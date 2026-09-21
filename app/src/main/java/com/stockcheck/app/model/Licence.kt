package com.stockcheck.app.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.Exclude

/**
 * What a company has paid for, held at `/licences/{workspaceId}`.
 *
 * Top-level on purpose. Everything else a company owns lives under
 * `/workspaces/{id}/…` where its own admin can write, and `meta/{docId}` is
 * explicitly `allow write: if isAdmin()` — so a licence kept there could be
 * edited by the customer into a lifetime plan expiring in 2099. This is the
 * one document in the database that no client may write at all; only the
 * platform, holding a service-account key, can change it.
 *
 * Absent means no new work may be started, which is the opposite of what
 * this said before the paywall: `licenceAllowsNewWork()` in firestore.rules
 * now requires the document to exist. Every company has one written for it,
 * a free trial included, so absent means nobody has been sold anything yet
 * rather than a customer who slipped through.
 *
 * Reading, finishing and exporting are untouched by it. What a missing or
 * expired licence stops is starting the next count.
 */
data class Licence(
    @DocumentId val workspaceId: String = "",
    val plan: String = Plan.TRIAL.name,
    val status: String = LicenceStatus.ACTIVE.name,
    /** How many accounts the plan covers. */
    val seats: Int = Plan.TRIAL.seats,
    val startedAt: Long = 0L,
    /**
     * When the right to start new counts ends. Zero means never — that is
     * what a lifetime licence is, and why it cannot simply be a far-future
     * date that eventually arrives.
     */
    val expiresAt: Long = 0L,
    /**
     * When updates and support stop for a lifetime licence.
     *
     * Separate from [expiresAt] because they are different promises: the app
     * keeps working forever, the help does not. Zero means it has not been
     * set, which is the case for every subscription.
     */
    val supportUntil: Long = 0L,
    val companyName: String = "",
    val contactEmail: String = "",
    /** Set by the payment webhook; empty for a licence granted by hand. */
    val stripeCustomerId: String = "",
    val stripeSubscriptionId: String = "",
    /** Why this licence looks the way it does. Written by the platform only. */
    val note: String = "",
    val updatedAt: Long = 0L,
) {
    @get:Exclude val planEnum: Plan get() = Plan.parse(plan)

    @get:Exclude val statusEnum: LicenceStatus get() = LicenceStatus.parse(status)

    /** True when there is no end date at all. */
    @get:Exclude val isLifetime: Boolean get() = expiresAt == 0L && planEnum != Plan.TRIAL

    fun isExpiredAt(now: Long): Boolean = expiresAt != 0L && expiresAt <= now

    /**
     * Whether new work may be started right now.
     *
     * Expiry deliberately does not freeze the whole app. Someone halfway
     * through counting a warehouse when the card expires must be able to
     * finish, save and export; what stops is starting the next count. Locking
     * a customer out of data they already entered is how a billing problem
     * turns into a lost customer with a grievance.
     */
    fun allowsNewWork(now: Long): Boolean =
        statusEnum == LicenceStatus.ACTIVE && !isExpiredAt(now)

    /** Whole days left, floored; negative once past. Meaningless for lifetime. */
    fun daysLeft(now: Long): Int =
        if (expiresAt == 0L) Int.MAX_VALUE
        else Math.floorDiv(expiresAt - now, 86_400_000L).toInt()

    /** True while it is worth telling someone their time is running out. */
    fun isRunningOut(now: Long): Boolean =
        expiresAt != 0L && !isExpiredAt(now) && daysLeft(now) <= WARN_DAYS

    fun supportEndedAt(now: Long): Boolean = supportUntil != 0L && supportUntil <= now

    companion object {
        /** How early the countdown starts showing. */
        const val WARN_DAYS = 14

        // There was a `unprovisioned()` here that built an ACTIVE TRIAL with
        // no expiry. Nothing called it, and anything that did would have had
        // a licence passing allowsNewWork() forever -- the paywall switched
        // off by a helper that reads like a default. A company without a
        // licence has null, and null is not permission.
    }
}

/**
 * The published plans.
 *
 * Seat counts live here rather than only in the licence document so the app
 * can say what an upgrade would buy without asking the server. The licence's
 * own `seats` still wins — a deal done by hand can differ from the price list
 * and the customer must get what they were sold.
 */
enum class Plan(
    val label: String,
    val seats: Int,
    /** Monthly price in sen, so no arithmetic ever happens in floating point. */
    val monthlySen: Int,
    val yearlySen: Int,
    val lifetimeSen: Int,
) {
    // Launch pricing: roughly 30% below the original list price, to get the
    // first customers in rather than to be what this app charges forever.
    // Raising it later is changing these six numbers and the matching six in
    // platform/plans.mjs -- nothing else has to move, because everything
    // downstream (the export, the paywall, Play's own product prices once
    // they are entered in the Console) reads the plan, not a price baked in
    // anywhere else.
    TRIAL("Trial", seats = 5, monthlySen = 0, yearlySen = 0, lifetimeSen = 0),
    STARTER("Starter", seats = 5, monthlySen = 4_800, yearlySen = 48_000, lifetimeSen = 168_000),
    BUSINESS("Business", seats = 20, monthlySen = 11_800, yearlySen = 118_000, lifetimeSen = 418_000),
    UNLIMITED(
        "Unlimited",
        seats = Int.MAX_VALUE,
        monthlySen = 22_800,
        yearlySen = 228_000,
        lifetimeSen = 798_000,
    );

    val seatsLabel: String get() = if (seats == Int.MAX_VALUE) "Unlimited" else "$seats accounts"

    companion object {
        fun parse(raw: String?): Plan = entries.firstOrNull { it.name == raw } ?: TRIAL

        /** "RM 168" / "RM 1,688" — the form the price list uses. */
        fun ringgit(sen: Int): String {
            val whole = sen / 100
            val cents = sen % 100
            val grouped = whole.toString().reversed().chunked(3).joinToString(",").reversed()
            return if (cents == 0) "RM $grouped" else "RM $grouped.%02d".format(cents)
        }
    }
}

enum class LicenceStatus(val label: String) {
    /** Paid, or inside the trial. */
    ACTIVE("Active"),

    /** Payment failed or the subscription lapsed. Data stays readable. */
    EXPIRED("Expired"),

    /** Stopped by the platform: abuse, chargeback, or a deal gone wrong. */
    SUSPENDED("Suspended");

    companion object {
        fun parse(raw: String?): LicenceStatus = entries.firstOrNull { it.name == raw } ?: ACTIVE
    }
}
