package com.stockcheck.app.ui.stock

import androidx.compose.runtime.LaunchedEffect
import com.stockcheck.app.data.Db
import android.app.Activity
import androidx.compose.ui.platform.LocalView
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.platform.LocalContext
import com.stockcheck.app.BuildConfig
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import com.stockcheck.app.model.Branch
import com.stockcheck.app.model.Quantity
import com.stockcheck.app.model.WorkspaceConfig
import kotlinx.coroutines.flow.map
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.stockcheck.app.R
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.stockcheck.app.data.BillingRepository
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.model.StockStatus
import com.stockcheck.app.model.Template
import com.stockcheck.app.data.effectivePermissions
import com.stockcheck.app.model.Licence
import com.stockcheck.app.model.Plan
import com.stockcheck.app.model.LicenceStatus
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone
import com.stockcheck.app.ui.common.EmptyState
import com.stockcheck.app.ui.common.StatusChip
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class StockHomeViewModel(private val session: Session) : ViewModel() {

    private val stock = ServiceLocator.stock
    private val templateRepo = ServiceLocator.templates

    /**
     * What the company has paid for.
     *
     * Only ever used to explain. The refusal itself happens in the security
     * rules, which is the point -- but a write denied by a rule arrives as
     * PERMISSION_DENIED, and nobody can tell from that whether their
     * subscription lapsed or the app is broken.
     */
    val licence: StateFlow<Licence?> = ServiceLocator.licences.observeLicence()
        .catch { emit(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    val openChecks: StateFlow<List<StockCheck>> = stock.observeStockChecks(session)
        .catch { error ->
            _error.value = "Stock checks could not be loaded: ${error.message}"
            emit(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val templates: StateFlow<List<Template>> = templateRepo.observeTemplates(activeOnly = true)
        // A failed query is reported, not silently rendered as "none". An
        // unindexed filter+order combination failed here and the picker told
        // the user there were no templates while five sat in the database.
        .catch { error ->
            _error.value = "Templates could not be loaded: ${error.message}"
            emit(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /**
     * The areas this company counts.
     *
     * Read from the company config rather than hard-coded, because every
     * warehouse names its own: A to F here, 1 to 12 there, "Cold room" and
     * "Loading bay" somewhere else.
     */
    val zones: StateFlow<List<String>> = ServiceLocator.users.observeConfig()
        .map { it?.zones?.filter { zone -> zone.isNotBlank() } ?: WorkspaceConfig.DEFAULT_ZONES }
        .catch { emit(WorkspaceConfig.DEFAULT_ZONES) }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            WorkspaceConfig.DEFAULT_ZONES,
        )

    /**
     * The branches this account may count at.
     *
     * Only the active ones, and only the ones this person is assigned to --
     * an empty assignment being head office, which sees all of them. A
     * company that has never set one up gets an empty list and is never
     * asked which branch, because a shop with one shop should not have to
     * answer that.
     */
    val branches: StateFlow<List<Branch>> = ServiceLocator.users.observeConfig()
        .map { config ->
            val all = config?.branches.orEmpty().filter { it.active && it.name.isNotBlank() }
            val mine = session.profile.branchIds
            if (mine.isEmpty()) all else all.filter { it.id in mine }
        }
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** The code a customer quotes when they get in touch about paying. */
    val joinCode: StateFlow<String> = ServiceLocator.users.observeConfig()
        .map { it?.joinCode.orEmpty() }
        .catch { emit("") }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")

    /** Takes an area off the shortcut row. Counts made in it are untouched. */
    fun forgetZone(zone: String) {
        viewModelScope.launch {
            runCatching { stock.forgetZone(session, zone) }
                .onFailure { _error.value = it.message }
        }
    }

    /** Creates a check and hands its id back so the caller can navigate. */
    fun createCheck(
        template: Template,
        zone: String = "",
        branch: Branch? = null,
        onCreated: (String) -> Unit,
    ) {
        viewModelScope.launch {
            runCatching { stock.createStockCheck(session, template, zone, branch = branch) }
                .onSuccess(onCreated)
                .onFailure { _error.value = it.message }
        }
    }

    /**
     * Ends a count from the list it is sitting in.
     *
     * Reaching this through the counting screen's overflow menu was the only
     * route, which meant opening a count to close it -- and an empty one
     * started by accident had no route at all: nothing to complete, and the
     * only thing to look at was a camera nobody wanted.
     */
    fun complete(check: StockCheck) {
        viewModelScope.launch {
            runCatching { stock.updateStatus(session, check, StockStatus.COMPLETED) }
                .onFailure { _error.value = it.message }
        }
    }

    fun delete(check: StockCheck) {
        viewModelScope.launch {
            runCatching { stock.deleteStockCheck(session, check) }
                .onFailure { _error.value = it.message }
        }
    }

    /** Ensures the template picker is never empty on a brand-new workspace. */
    fun seedTemplatesIfNeeded() {
        viewModelScope.launch { runCatching { templateRepo.seedDefaults(session) } }
    }

    fun clearError() {
        _error.value = null
    }

    companion object {
        fun factory(session: Session) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                StockHomeViewModel(session) as T
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockHomeScreen(
    session: Session,
    onOpenCheck: (String) -> Unit,
    onOpenProducts: () -> Unit,
) {
    val viewModel: StockHomeViewModel = viewModel(
        factory = StockHomeViewModel.factory(session),
    )
    val checks by viewModel.openChecks.collectAsStateWithLifecycle()
    val templates by viewModel.templates.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val licence by viewModel.licence.collectAsStateWithLifecycle()
    val permissions = session.effectivePermissions
    var picking by remember { mutableStateOf(false) }
    var pickedBranch by remember { mutableStateOf<Branch?>(null) }
    // Held between the two steps: template first, then which part of the
    // building this count covers.
    var pickedTemplate by remember { mutableStateOf<Template?>(null) }
    val zones by viewModel.zones.collectAsStateWithLifecycle()
    val branches by viewModel.branches.collectAsStateWithLifecycle()
    var blocked by remember { mutableStateOf(false) }
    val joinCode by viewModel.joinCode.collectAsStateWithLifecycle()

    // A company needs an ACTIVE, unexpired licence to start a count. Every
    // new company gets a 14-day trial licence issued the moment it registers
    // (see platform/licences.mjs startTrial), so this is never the reason a
    // brand-new signup sees a refusal with nothing behind it -- that problem
    // is solved upstream, by always having something to show them, not by
    // waving the check through.
    //
    // TURNING THIS OFF is this line reading `!= false`, plus dropping
    // `exists(licencePath()) &&` from licenceAllowsNewWork() in
    // firestore.rules. Both together or neither: the app's check alone is one
    // a modified client can delete, and the rule alone refuses a write the
    // app has already told somebody would work.
    val now = System.currentTimeMillis()
    val mayStart = licence?.allowsCounting(now) == true

    // Anything not yet reviewed is still "on the floor" and belongs here; the
    // finished ones live on the History tab.
    val active = checks.filter {
        it.statusEnum == StockStatus.DRAFT || it.statusEnum == StockStatus.IN_PROGRESS
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.stock_check)) },
            )
        },
        floatingActionButton = {
            Column(horizontalAlignment = Alignment.End) {
                // Above the primary action, because naming products is the
                // preparation that makes counting fast -- a scan resolves to a
                // name instead of a row of digits -- but it is not the thing
                // someone opens this tab to do.
                SmallFloatingActionButton(onClick = onOpenProducts) {
                    Icon(Icons.Filled.Inventory2, contentDescription = "Products")
                }
                Spacer(Modifier.height(12.dp))
                if (session.role.permissionSet.has(Permission.CREATE_STOCK_CHECK) ||
                    session.role.id == "admin"
                ) {
                    ExtendedFloatingActionButton(
                        onClick = {
                            // Still tappable when expired, and it explains
                            // rather than doing nothing. A greyed-out button
                            // is the same dead end as a denied write.
                            if (!mayStart) {
                                blocked = true
                            } else {
                                viewModel.seedTemplatesIfNeeded()
                                picking = true
                            }
                        },
                        icon = {
                            Icon(
                                imageVector = if (mayStart) Icons.Filled.Add else Icons.Filled.Lock,
                                contentDescription = null,
                            )
                        },
                        text = { Text(stringResource(R.string.new_stock_check)) },
                    )
                }
            }
        },
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
        error?.let {
            NoticeBar(text = it, tone = NoticeTone.ERROR)
        }
        licence?.let { LicenceBanner(it, now) }
        if (active.isEmpty()) {
            EmptyState(
                icon = Icons.Filled.QrCodeScanner,
                title = "No stock check in progress",
                message = "Start one, pick a template, then scan barcodes and " +
                    "call out the quantities.",
            )
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(active, key = { it.id }) { check ->
                    StockCheckCard(
                        check = check,
                        onClick = { onOpenCheck(check.id) },
                        canComplete = permissions.has(Permission.MARK_COMPLETED),
                        canDelete = permissions.canDeleteRecordBy(
                            check.createdByUid,
                            session.uid,
                        ),
                        onComplete = { viewModel.complete(check) },
                        onDelete = { viewModel.delete(check) },
                    )
                }
            }
        }
        }
    }

    if (blocked) {
        LicenceBlockedDialog(
            licence = licence,
            joinCode = joinCode,
            onDismiss = { blocked = false },
        )
    }

    if (picking) {
        TemplatePickerDialog(
            templates = templates,
            onDismiss = { picking = false },
            onPick = { template ->
                picking = false
                pickedTemplate = template
            },
        )
    }

    // Which branch, then which area. A company with one place skips straight
    // past this: being asked which shop you are standing in, when there is
    // only one, is a question that makes an app feel like paperwork.
    pickedTemplate?.let { template ->
        if (branches.isNotEmpty() && pickedBranch == null) {
            BranchPickerDialog(
                branches = branches,
                onDismiss = { pickedTemplate = null },
                onPick = { pickedBranch = it },
            )
        } else {
            ZonePickerDialog(
                template = template,
                zones = zones,
                branch = pickedBranch,
                onDismiss = {
                    pickedTemplate = null
                    pickedBranch = null
                },
                onStart = { zone ->
                    val branch = pickedBranch
                    pickedTemplate = null
                    pickedBranch = null
                    viewModel.createCheck(template, zone, branch, onOpenCheck)
                },
                onForgetZone = viewModel::forgetZone,
            )
        }
    }
}

@Composable
private fun TemplatePickerDialog(
    templates: List<Template>,
    onDismiss: () -> Unit,
    onPick: (Template) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.choose_template)) },
        text = {
            if (templates.isEmpty()) {
                Text(stringResource(R.string.no_templates))
            } else {
                Column {
                    templates.forEach { template ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onPick(template) }
                                .padding(vertical = 10.dp),
                        ) {
                            Text(template.name, style = MaterialTheme.typography.titleMedium)
                            if (template.description.isNotEmpty()) {
                                Text(
                                    text = template.description,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                text = "${template.fields.size} extra field" +
                                    (if (template.fields.size == 1) "" else "s") +
                                    if (template.photoRequired) " · photo required" else "",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.outline,
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        },
    )
}

@Composable
private fun StockCheckCard(
    check: StockCheck,
    onClick: () -> Unit,
    canComplete: Boolean,
    canDelete: Boolean,
    onComplete: () -> Unit,
    onDelete: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }

    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(modifier = Modifier.padding(start = 16.dp, top = 8.dp, end = 4.dp, bottom = 16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(check.refNo, style = MaterialTheme.typography.titleMedium)
                    if (check.zone.isNotBlank()) {
                        Text(
                            text = stringResource(R.string.area_label, check.zone),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                StatusChip(check.statusEnum)
                // Visible rather than a long-press. A hidden gesture is no
                // route at all for someone who has never been told about it,
                // and this is the only way to end a count from the list.
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "More")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        if (canComplete) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.mark_completed)) },
                                leadingIcon = {
                                    Icon(Icons.Filled.Check, contentDescription = null)
                                },
                                onClick = { menuOpen = false; onComplete() },
                            )
                        }
                        if (canDelete) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.delete)) },
                                leadingIcon = {
                                    Icon(Icons.Filled.Delete, contentDescription = null)
                                },
                                onClick = { menuOpen = false; confirmingDelete = true },
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = check.templateName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = "${check.itemCount} products · ${Quantity.format(check.counted)} total · " +
                    "${check.photoCount} photos",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = "${check.createdByName} · ${friendlyDate(check.createdAt)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text(stringResource(R.string.delete_check_title, check.refNo)) },
            text = {
                Text(
                    if (check.itemCount == 0) {
                        "Nothing has been counted in it, so nothing is lost."
                    } else {
                        "${check.itemCount} counted lines and ${check.photoCount} photos " +
                            "go with it. This cannot be undone."
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = { confirmingDelete = false; onDelete() }) { Text(stringResource(R.string.delete)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) { Text(stringResource(R.string.cancel)) }
            },
        )
    }
}

private val dayFormat = SimpleDateFormat("d MMM yyyy, HH:mm", Locale.getDefault())

internal fun friendlyDate(millis: Long): String =
    if (millis <= 0L) "—" else dayFormat.format(Date(millis))


// --------------------------------------------------------------- licensing

/**
 * Says where the company stands, but only when it is worth saying.
 *
 * Silent on a healthy subscription. A banner that is always there is read
 * once and then stops existing, which is exactly the wrong behaviour for the
 * message that eventually matters.
 */
@Composable
private fun LicenceBanner(licence: Licence, now: Long) {
    when {
        licence.statusEnum == LicenceStatus.SUSPENDED -> NoticeBar(
            text = "This company's access has been suspended. Your records are safe " +
                "and can still be exported. Contact support to restore it.",
            tone = NoticeTone.ERROR,
        )

        !licence.allows(Licence.MODULE_APP) -> NoticeBar(
            text = "The ${licence.planEnum.label} plan does not include counting in this app. " +
                "Your records stay readable here; counting comes with the All-in-One plans " +
                "or the JEXO Count plan.",
            tone = NoticeTone.WARNING,
        )

        licence.isExpiredAt(now) -> NoticeBar(
            text = "The ${licence.planEnum.label} plan has ended. Everything already " +
                "counted stays here and exports still work \u2014 new stock checks " +
                "resume once it is renewed.",
            tone = NoticeTone.ERROR,
        )

        licence.planEnum == Plan.TRIAL -> NoticeBar(
            text = "Trial \u2014 ${licence.daysLeft(now)} days left, " +
                "${licence.seats} accounts included.",
            tone = if (licence.isRunningOut(now)) NoticeTone.WARNING else NoticeTone.INFO,
        )

        licence.isRunningOut(now) -> NoticeBar(
            text = "The ${licence.planEnum.label} plan renews in " +
                "${licence.daysLeft(now)} days.",
            tone = NoticeTone.WARNING,
        )

        else -> Unit
    }
}

/**
 * Explains a refusal the server would otherwise deliver as PERMISSION_DENIED.
 *
 * Deliberately specific about what still works. Someone whose card bounced
 * needs to know their counts are not gone before they need to know how to
 * pay, and telling them in that order is the difference between a renewal
 * and an argument.
 */
/**
 * Hands a URL to whatever app handles it, and says whether anything did.
 *
 * Returns false rather than throwing, because every caller here is a button
 * on a dialog: the useful response to "nothing on this phone opens that" is a
 * line of text under the button, not a crash.
 */
private fun openLink(context: android.content.Context, url: String): Boolean {
    // A mail client answers ACTION_SENDTO, not ACTION_VIEW, and the manifest
    // asks about each one separately -- so the action has to match the scheme
    // or the app is invisible whichever way round it is.
    val action =
        if (url.startsWith("mailto:")) Intent.ACTION_SENDTO else Intent.ACTION_VIEW
    return try {
        context.startActivity(
            Intent(action, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        true
    } catch (missing: ActivityNotFoundException) {
        false
    }
}

@Composable
private fun LicenceBlockedDialog(
    licence: Licence?,
    joinCode: String,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    // From LocalView, not LocalContext: the language provider hands the tree a
    // configuration context, which is not an Activity, and Play requires one.
    val activity = LocalView.current.context as? Activity
    var noBrowser by remember { mutableStateOf(false) }
    var noEmail by remember { mutableStateOf(false) }

    val whatsApp = BuildConfig.SUPPORT_WHATSAPP
    val supportEmail = BuildConfig.SUPPORT_EMAIL
    // A button to a host that does not resolve is worse than no button: it
    // reads as "we tried to take your money and something broke".
    val buyPageConfigured = !BuildConfig.BUY_URL.contains("example.invalid")

    val billing = ServiceLocator.billing
    val playAvailable by billing.available.collectAsStateWithLifecycle()
    val playProducts by billing.products.collectAsStateWithLifecycle()
    val billingMessage by billing.message.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) {
        billing.workspaceId = Db.workspaceId
        billing.start()
    }

    val suspended = licence?.statusEnum == LicenceStatus.SUSPENDED
    // Nothing issued at all reads differently from something that ran out: a
    // company told its plan "ended" when it never had one is being told it
    // lost something it never received.
    val neverIssued = licence == null
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Filled.Lock, contentDescription = null) },
        title = {
            Text(
                when {
                    neverIssued -> stringResource(R.string.paywall_title)
                    suspended -> "Access suspended"
                    else -> stringResource(R.string.paywall_trial_over)
                },
            )
        },
        text = {
            Column {
                Text(
                    when {
                        neverIssued -> stringResource(R.string.paywall_body)
                        suspended ->
                            "New stock checks are paused while this company's access " +
                                "is suspended."
                        else ->
                            "The ${licence?.planEnum?.label ?: "current"} plan ended, " +
                                "so a new stock check cannot be started."
                    },
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    "Nothing has been deleted. Every count already taken can still be " +
                        "opened, finished, exported and backed up.",
                    style = MaterialTheme.typography.bodySmall,
                )

                if (joinCode.isNotBlank()) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        // The one thing they will be asked for. Putting it on
                        // the screen that refuses them saves a round trip
                        // through an admin who has to go and look it up.
                        text = stringResource(R.string.paywall_quote_code, joinCode),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                Spacer(Modifier.height(14.dp))
                Text(
                    text = stringResource(R.string.paywall_plans),
                    style = MaterialTheme.typography.labelMedium,
                )
                Spacer(Modifier.height(4.dp))
                if (playAvailable && activity != null) {
                    // Play knows the real prices, in the buyer's own currency,
                    // and they are the ones that will be charged. Showing the
                    // Kotlin price list beside Play's would be two answers to
                    // one question.
                    playProducts.forEach { product ->
                        TextButton(onClick = { billing.buy(activity, product) }) {
                            Text("${product.title} · " + BillingRepository.priceOf(product))
                        }
                    }
                } else {
                    Plan.entries.filter { it != Plan.TRIAL && it.app }.forEach { plan ->
                        Text(
                            text = "${plan.label} · " +
                                stringResource(R.string.paywall_per_month, plan.monthlySen / 100),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                billingMessage?.let { note ->
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = note,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                // Who to quote that code to. Without this the dialog asks
                // for a code and names nobody -- and since every licence,
                // trial included, is issued by hand, a customer with no way
                // to ask is one who can neither start nor pay.
                //
                // Not in a copy Google Play sells through: a Play app may sell
                // its plans only with Play's own billing, never point to
                // another way to pay. The website and the side-loaded APK
                // keep these.
                if (!playAvailable && (whatsApp.isNotBlank() || supportEmail.isNotBlank())) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = stringResource(R.string.paywall_contact_prompt),
                        style = MaterialTheme.typography.labelMedium,
                    )
                    if (whatsApp.isNotBlank()) {
                        TextButton(
                            onClick = {
                                val text = Uri.encode(
                                    context.getString(R.string.paywall_contact_message, joinCode),
                                )
                                // wa.me opens the installed app when there is
                                // one and the website when there is not, so
                                // this works on a phone without WhatsApp.
                                openLink(context, "https://wa.me/$whatsApp?text=$text")
                                    .let { opened -> if (!opened) noBrowser = true }
                            },
                        ) { Text(stringResource(R.string.paywall_contact_whatsapp)) }
                    }
                    if (supportEmail.isNotBlank()) {
                        TextButton(
                            onClick = {
                                val subject = Uri.encode(
                                    context.getString(R.string.paywall_contact_subject, joinCode),
                                )
                                val body = Uri.encode(
                                    context.getString(R.string.paywall_contact_message, joinCode),
                                )
                                openLink(context, "mailto:$supportEmail?subject=$subject&body=$body")
                                    .let { opened -> if (!opened) noEmail = true }
                            },
                        ) { Text(stringResource(R.string.paywall_contact_email)) }
                    }
                }

                if (noBrowser) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = stringResource(R.string.paywall_no_browser),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                if (noEmail) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = stringResource(R.string.paywall_no_email),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                licence?.contactEmail?.takeIf { it.isNotBlank() }?.let { email ->
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Renewal notice goes to $email.",
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
        },
        confirmButton = {
            // Only when Play has nothing to sell this copy — side-loaded, or
            // products not published. Offering both at once is how an app
            // gets pulled from the store.
            if (!playAvailable && buyPageConfigured) TextButton(
                onClick = {
                    // Out to a browser, never a form in here. The app takes no
                    // card details and holds no payment state, so there is
                    // nothing about billing on the device to forge -- and the
                    // licence it results in is written by the platform's
                    // service account, which the rules are the only reader of.
                    val url = BuildConfig.BUY_URL +
                        if (joinCode.isBlank()) "" else "?company=$joinCode"
                    noBrowser = !openLink(context, url)
                },
            ) { Text(stringResource(R.string.paywall_buy)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.ok)) }
        },
    )
}


/**
 * Which part of the building this count covers.
 *
 * A warehouse is counted zone by zone, by different people, often on the same
 * day. Without this every count is called SC-481669 and telling them apart
 * means opening each one and recognising the products -- and two counts of the
 * same aisle look identical in the list.
 *
 * Skippable on purpose. A shop with one room should not have to answer, and
 * forcing an answer produces a column full of "A" that means nothing.
 */
/**
 * Which shop or warehouse this count covers.
 *
 * Only shown to a company that has branches. Two counts of "Rack 7" mean
 * nothing until you know which building's rack 7, and a count filed against
 * the wrong branch is worse than one filed against none -- it moves stock, on
 * paper, between two places that each then disagree with their own shelves.
 */
@Composable
private fun BranchPickerDialog(
    branches: List<Branch>,
    onDismiss: () -> Unit,
    onPick: (Branch) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Which branch?") },
        text = {
            Column {
                branches.forEach { branch ->
                    TextButton(
                        onClick = { onPick(branch) },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(branch.name) }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ZonePickerDialog(
    template: Template,
    zones: List<String>,
    /** Chosen a moment ago, null for a company with one place. */
    branch: Branch? = null,
    onDismiss: () -> Unit,
    onStart: (String) -> Unit,
    onForgetZone: (String) -> Unit,
) {
    var selected by remember { mutableStateOf("") }
    var typed by remember { mutableStateOf("") }
    val zone = typed.trim().ifEmpty { selected }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.which_area)) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    // The branch beside the template, because the answer to
                    // "which area" is different in each building and the last
                    // thing a person saw was a list of branches.
                    text = listOfNotNull(branch?.name, template.name).joinToString(" · "),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))

                if (zones.isNotEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        zones.forEach { option ->
                            FilterChip(
                                selected = selected == option && typed.isBlank(),
                                onClick = {
                                    typed = ""
                                    selected = if (selected == option) "" else option
                                },
                                label = { Text(option) },
                                // The list is whatever this company has typed
                                // before, so it needs a way back out. Anything
                                // that can be added and never removed fills up
                                // with a typo nobody can clear.
                                trailingIcon = {
                                    Icon(
                                        imageVector = Icons.Filled.Close,
                                        contentDescription = stringResource(R.string.area_remove, option),
                                        modifier = Modifier
                                            .size(16.dp)
                                            .clickable { onForgetZone(option) },
                                    )
                                },
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = stringResource(R.string.area_remove_hint),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = typed,
                    onValueChange = { typed = it },
                    label = { Text(stringResource(R.string.type_new_area)) },
                    placeholder = { Text(stringResource(R.string.area_examples)) },
                    singleLine = true,
                    // Anything typed here joins the list, so the next person
                    // taps it rather than retyping it and inventing
                    // "Cold Room" beside "cold room".
                    supportingText = { Text(stringResource(R.string.area_saved_for_next_time)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onStart(zone) }) {
                Text(
                    if (zone.isBlank()) {
                        stringResource(R.string.start_without_area)
                    } else {
                        stringResource(R.string.start_area, zone)
                    },
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        },
    )
}
