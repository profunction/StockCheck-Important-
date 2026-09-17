package com.stockcheck.app.data

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.stockcheck.app.BuildConfig
import com.stockcheck.app.model.Plan
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import org.json.JSONObject

/**
 * Buying a licence through Google Play.
 *
 * The money is the easy half. The half that matters is that a purchase on a
 * phone must never be what grants a licence: `/licences` is writable only by
 * the platform's service account, and that is the property keeping a modified
 * client from granting itself a plan. So the phone's only job here is to
 * complete the purchase and hand the token to the platform, which verifies it
 * against Google's own servers before writing anything.
 *
 * A phone that is told "you paid" and believes itself is a phone that can be
 * told anything.
 *
 * **Play Billing only works in an app installed from Google Play.** Installed
 * from an APK — which is how this app reaches most of its customers — the
 * connection succeeds and the product list comes back empty. [available] says
 * which world this copy is in, so the screen can offer the web checkout
 * instead of a button that silently does nothing.
 */
class BillingRepository(appContext: Context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _available = MutableStateFlow(false)
    /** True once Play has answered and actually offered something to sell. */
    val available: StateFlow<Boolean> = _available.asStateFlow()

    private val _products = MutableStateFlow<List<ProductDetails>>(emptyList())
    val products: StateFlow<List<ProductDetails>> = _products.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    /**
     * Which workspace a purchase belongs to.
     *
     * Travels with the purchase as its obfuscated account id, so the platform
     * knows what to licence without the phone getting to say.
     */
    var workspaceId: String = ""

    private val listener = PurchasesUpdatedListener { result, purchases ->
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK ->
                purchases.orEmpty().forEach { scope.launch { redeem(it) } }
            BillingClient.BillingResponseCode.USER_CANCELED -> Unit
            else -> _message.value = result.debugMessage.ifBlank {
                "Play could not complete the purchase (code ${result.responseCode})."
            }
        }
    }

    private val client: BillingClient = BillingClient.newBuilder(appContext)
        .setListener(listener)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build(),
        )
        .build()

    /**
     * Connects, lists what is for sale, and re-sends anything already bought.
     *
     * The last part is not housekeeping. A purchase completes on Google's side
     * the moment the sheet is dismissed; if the app dies before the token
     * reaches the platform, the customer has paid and has nothing. Asking Play
     * what they own on every start is what closes that window.
     */
    private var started = false

    fun start() {
        // Called from a screen that can be opened repeatedly; connecting again
        // each time would leave Play with a pile of clients.
        if (started) return
        started = true
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    _available.value = false
                    return
                }
                scope.launch {
                    loadProducts()
                    restoreExisting()
                }
            }

            override fun onBillingServiceDisconnected() {
                _available.value = false
                // Let the next screen that needs it try again.
                started = false
            }
        })
    }

    private suspend fun loadProducts() {
        val wanted = productIds().map { id ->
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        }
        val params = QueryProductDetailsParams.newBuilder().setProductList(wanted).build()

        val details = suspendCancellableCoroutine { continuation ->
            client.queryProductDetailsAsync(params) { _, list ->
                continuation.resume(list.orEmpty())
            }
        }
        _products.value = details
        // Empty means Play has nothing to sell this copy of the app: either it
        // was side-loaded, or the products are not published yet.
        _available.value = details.isNotEmpty()
    }

    private suspend fun restoreExisting() {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        val owned = suspendCancellableCoroutine { continuation ->
            client.queryPurchasesAsync(params) { _, list -> continuation.resume(list) }
        }
        owned.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
            .forEach { redeem(it) }
    }

    /** Opens Play's own purchase sheet. Needs a real Activity; Play requires one. */
    fun buy(activity: Activity, details: ProductDetails) {
        val offer = details.subscriptionOfferDetails?.firstOrNull()?.offerToken
        if (offer == null) {
            _message.value = "That plan has no offer to buy right now."
            return
        }
        val flow = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .setOfferToken(offer)
                        .build(),
                ),
            )
            .setObfuscatedAccountId(workspaceId)
            .build()
        client.launchBillingFlow(activity, flow)
    }

    /**
     * Hands the purchase to the platform and lets it decide.
     *
     * Acknowledgement happens only after the platform confirms. Google voids
     * an unacknowledged purchase after three days, which is the right way
     * round: if verification never succeeds, the customer gets their money
     * back rather than a licence nobody granted.
     */
    private suspend fun redeem(purchase: Purchase) {
        val granted = runCatching { tellPlatform(purchase) }.getOrDefault(false)
        if (!granted) {
            _message.value = "Payment received. Waiting for it to be confirmed."
            return
        }
        if (!purchase.isAcknowledged) {
            val params = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()
            client.acknowledgePurchase(params) { }
        }
        _message.value = null
    }

    private suspend fun tellPlatform(purchase: Purchase): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("workspaceId", workspaceId.ifBlank { purchase.accountIdentifiers?.obfuscatedAccountId.orEmpty() })
            .put("productId", purchase.products.firstOrNull().orEmpty())
            .put("purchaseToken", purchase.purchaseToken)
            .put("orderId", purchase.orderId.orEmpty())
            .toString()

        val connection = (URL("${BuildConfig.PLATFORM_URL}/play/verify").openConnection()
            as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 15_000
            readTimeout = 20_000
            setRequestProperty("Content-Type", "application/json")
        }
        try {
            OutputStreamWriter(connection.outputStream).use { it.write(body) }
            connection.responseCode in 200..299
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        /**
         * The ids as they must be created in Play Console.
         *
         * Two per paid plan, one per billing period. TRIAL is not sold — it is
         * issued by the platform CLI, and a trial somebody can buy is not a
         * trial.
         */
        fun productIds(): List<String> =
            Plan.entries.filter { it != Plan.TRIAL }.flatMap { plan ->
                val base = plan.name.lowercase()
                listOf("${base}_monthly", "${base}_yearly")
            }
    }
}
