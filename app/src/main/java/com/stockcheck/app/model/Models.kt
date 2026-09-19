package com.stockcheck.app.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.Exclude
import kotlin.math.abs

/**
 * Firestore maps documents onto these classes reflectively, which imposes two
 * rules on everything in this file: every property needs a default so a no-arg
 * constructor exists, and no property may be non-nullable-without-default.
 * Timestamps are plain epoch millis rather than Firebase `Timestamp` so that a
 * record written offline carries the device's own time and stays comparable
 * before it ever reaches the server.
 */

// ---------------------------------------------------------------- stock check

enum class StockStatus(val label: String) {
    DRAFT("Draft"),
    IN_PROGRESS("In progress"),
    COMPLETED("Completed"),
    REVIEWED("Reviewed"),
    LOCKED("Locked");

    /** Locked records are frozen for everyone without UNLOCK_STOCK. */
    val isFrozen: Boolean get() = this == LOCKED

    companion object {
        fun parse(raw: String?): StockStatus =
            entries.firstOrNull { it.name == raw } ?: DRAFT
    }
}

data class StockCheck(
    @DocumentId val id: String = "",
    val refNo: String = "",
    val templateId: String = "",
    val templateName: String = "",
    val status: String = StockStatus.DRAFT.name,
    val createdByUid: String = "",
    val createdByName: String = "",
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
    val completedAt: Long? = null,
    val reviewedByUid: String? = null,
    val reviewedByName: String? = null,
    val lockedByUid: String? = null,
    val itemCount: Int = 0,
    /**
     * Whole units, as totals were held before weighing was possible. Read,
     * never written — see the same field on [StockItem].
     */
    val totalQuantity: Int = 0,
    /** Everything counted on this check, in thousandths. See [Quantity]. */
    val totalQuantityMilli: Long? = null,
    val photoCount: Int = 0,
    /**
     * Which part of the building this count covers: "A", "Cold room", "Rack 3".
     *
     * A warehouse is counted zone by zone, by different people, often on the
     * same day. Without this every count is called SC-481669 and the only way
     * to tell which one covered aisle C is to open it and recognise the
     * products -- and two counts of the same aisle look identical.
     *
     * Free text rather than an enum: the company names its own areas, and a
     * fixed list would be wrong for the first customer who calls them 1 to 12.
     */
    val zone: String = "",
    val note: String = "",
) {
    @get:Exclude val statusEnum: StockStatus get() = StockStatus.parse(status)

    /**
     * Everything counted on this check, in thousandths.
     *
     * Falls back to the whole-unit total for a check totalled before weighing
     * existed, so an old check and a new one read on the same scale.
     */
    @get:Exclude val counted: Long
        get() = totalQuantityMilli ?: Quantity.of(totalQuantity)

    /** Reference plus zone, which is how a person refers to a count out loud. */
    @get:Exclude val label: String
        get() = if (zone.isBlank()) refNo else "$refNo · $zone"
}

enum class ItemSource { SCAN, VOICE, MANUAL }

data class StockItem(
    @DocumentId val id: String = "",
    val barcode: String = "",
    val productName: String = "",
    /**
     * Copied from the catalogue at scan time rather than looked up on demand,
     * so a count stays readable even if the product is renamed or removed
     * afterwards. A stock check is a record of what was true that day.
     */
    val sku: String = "",
    /**
     * Whole units, as counts were held before weighing was possible.
     *
     * Read, never written. [counted] falls back to it so a line recorded by
     * an earlier version still shows its number instead of zero.
     *
     * Writing it too was the obvious thing and is wrong: an edit is an atomic
     * increment against whatever the server holds, and rounding does not
     * survive that. Half a kilo added to half a kilo is one, but the rounded
     * increments are one plus one, so the mirror would claim two. A field
     * that is right on creation and drifts on every edit afterwards is worse
     * than one that is plainly historical.
     */
    val quantity: Int = 0,
    /**
     * What was actually counted, in thousandths of a unit: 500 is half a
     * kilo, 24_000 is twenty-four tins. See [Quantity].
     *
     * Null on a line written before weighing was possible, which is the case
     * [counted] falls back on. A new line always sets it, so null means old
     * rather than zero — and on a count sheet those are very different things.
     */
    val quantityMilli: Long? = null,
    /**
     * What the customer's own system says should be here.
     *
     * Meaningless unless [onList] is true: zero is a stock level someone
     * stated, and a line nobody stated anything about is a different thing
     * entirely. Keeping them apart is what stops an import inventing
     * shortages for everything it did not mention.
     */
    val expected: Int = 0,
    /** [expected] in thousandths, null on a line predating weighing. */
    val expectedMilli: Long? = null,
    /**
     * When what was counted here goes off, at midnight UTC of that day.
     *
     * On the counted line, not on the product: a product does not have one
     * expiry, the batch sitting on the shelf does, and the next delivery of
     * the same thing has another. Null where nobody recorded one, which is
     * most lines — dry goods and non-food do not need it, and a date nobody
     * typed must not read as "expires today".
     *
     * A count that balances perfectly while a third of the shelf is out of
     * date is a count that answered the wrong question.
     */
    val expiresAt: Long? = null,
    /** True when this line came from an imported count sheet. */
    val onList: Boolean = false,
    val unit: String = "pcs",
    val remark: String = "",
    /** Values for the template's custom fields, keyed by [TemplateField.key]. */
    val fieldValues: Map<String, String> = emptyMap(),
    val source: String = ItemSource.MANUAL.name,
    val createdByUid: String = "",
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
) {
    @get:Exclude val sourceEnum: ItemSource
        get() = runCatching { ItemSource.valueOf(source) }.getOrDefault(ItemSource.MANUAL)

    /**
     * What was counted, in thousandths.
     *
     * Falls back to the whole-unit field for a line written before weighing
     * existed. Everything derived below reads this rather than either stored
     * field, so an old line and a new one compare on the same scale.
     */
    @get:Exclude val counted: Long get() = quantityMilli ?: Quantity.of(quantity)

    /** What the sheet said should be here, in thousandths. */
    @get:Exclude val expectedCount: Long get() = expectedMilli ?: Quantity.of(expected)

    /** Counted minus expected: negative is missing stock, positive is surplus. */
    @get:Exclude val variance: Long get() = if (onList) counted - expectedCount else 0L

    @get:Exclude val hasVariance: Boolean get() = onList && counted != expectedCount

    /**
     * Counted, but not on the sheet at all.
     *
     * Its own kind of finding: stock nobody's system knows about is as much a
     * problem as stock that has gone missing, and it does not show up as a
     * variance because there is nothing to compare against.
     */
    @get:Exclude val isUnlisted: Boolean get() = !onList && counted > 0L

    /**
     * Whether counting this line down to zero should remove it.
     *
     * A scanned line at zero says nothing a missing line does not. An expected
     * line at zero says the opposite: the sheet said ten and the shelf had
     * none, which is the single most important row in the report.
     */
    @get:Exclude val survivesZero: Boolean get() = onList

    /**
     * Days until this goes off, or null where no date was recorded.
     *
     * Negative once the date has passed. Null is not "fine" and not "today";
     * it is "nobody said", and a caller showing it as either would be
     * inventing a fact about somebody's stock.
     */
    @get:Exclude fun daysToExpiry(now: Long): Int? =
        expiresAt?.let { ExpiryDate.daysUntil(it, now) }

    /** Past its date, and still on the shelf being counted. */
    @get:Exclude fun isExpired(now: Long): Boolean =
        daysToExpiry(now)?.let { it < 0 } == true

    /** Close enough to its date to be worth acting on while somebody is there. */
    @get:Exclude fun isExpiringSoon(now: Long): Boolean =
        daysToExpiry(now)?.let { it in 0..ExpiryDate.SOON_DAYS } == true

    /**
     * The variance as a share of what was expected.
     *
     * Null when a percentage would say nothing: a line nobody put on the sheet
     * has no baseline, and dividing by an expected zero has no answer. The
     * caller shows the absolute figures in those cases, which are the honest
     * ones anyway.
     */
    @get:Exclude val variancePercent: Double?
        get() = if (!onList || expectedCount == 0L) null
        else variance.toDouble() * 100 / expectedCount

    /**
     * Whether this line is worth a second pair of eyes before the count is
     * signed off.
     *
     * The point is a shortlist a supervisor will actually read. Flagging every
     * line that differs at all produces a list as long as the count, which is
     * the same as flagging nothing -- so a percentage alone is not enough
     * either: three expected against four counted is a 33% swing and almost
     * never interesting, while a hundred expected against ninety is a tenth of
     * the stock gone and easily is.
     *
     * So: nothing where something was expected, or something where nothing
     * was, is always worth looking at whatever the arithmetic says. Beyond
     * that a line needs both a baseline big enough for a percentage to mean
     * something and a swing past [LARGE_VARIANCE_PERCENT].
     */
    @get:Exclude val isLargeVariance: Boolean
        get() = when {
            !onList -> false
            // The sheet said none and the shelf had some: stock no system
            // knows about, which is a finding in its own right.
            expectedCount == 0L -> counted > 0L
            // The sheet said some and the shelf had none. Whatever the
            // numbers, somebody should walk back and look.
            counted == 0L -> true
            expectedCount < Quantity.of(SMALL_COUNT_FLOOR) -> false
            else -> abs(variancePercent ?: 0.0) >= LARGE_VARIANCE_PERCENT
        }

    companion object {
        /** A swing at or past this share of the expected figure is flagged. */
        const val LARGE_VARIANCE_PERCENT = 20.0

        /**
         * Below this expected figure, percentages mislead more than they help
         * -- one counted against two is a 50% variance and means nothing.
         */
        const val SMALL_COUNT_FLOOR = 5
    }
}

// -------------------------------------------------------------------- photos

data class PhotoRecord(
    @DocumentId val id: String = "",
    val stockCheckId: String = "",
    /** Path inside Firebase Storage; empty until the upload worker succeeds. */
    val storagePath: String = "",
    val downloadUrl: String = "",
    /** Absolute path of the on-device copy, kept so offline capture still shows. */
    val localPath: String = "",
    val uploaded: Boolean = false,
    val caption: String = "",
    /** Optional link back to a specific scanned item. */
    val linkedBarcode: String = "",
    val takenAt: Long = 0L,
    val takenByUid: String = "",
    val takenByName: String = "",
)

// ------------------------------------------------------------------ products

/**
 * A known product, held at `products/{barcode}`.
 *
 * The barcode IS the document id, so a scan is a direct lookup rather than a
 * query — which matters because it happens on every scan, often with no
 * signal, and has to resolve from the offline cache in the time between the
 * camera reading a code and the row appearing.
 *
 * Without this a counted line shows nothing but a number, which nobody can
 * check against the shelf in front of them.
 */
data class Product(
    @DocumentId val barcode: String = "",
    val name: String = "",
    val sku: String = "",
    /**
     * Other codes that are the same product.
     *
     * One thing on a shelf can wear several barcodes: the manufacturer
     * changes the packaging, a second supplier ships the same item under
     * their own code, a carton carries a different number from the tin
     * inside it. Without this each of those scans as an unknown product and
     * the count reports the same stock three times under three names.
     *
     * A list beside the id rather than a separate lookup collection, because
     * the id is what makes a scan a single cached read on a phone with no
     * signal. That path stays exactly as it was; this is only what happens
     * when it misses.
     */
    val altBarcodes: List<String> = emptyList(),
    /** Pre-fills the unit on a counted line, e.g. ctn for a case. */
    val unit: String = "pcs",
    val active: Boolean = true,
    val createdAt: Long = 0L,
    val createdByUid: String = "",
    val updatedAt: Long = 0L,
) {
    /** Every code that reaches this product, the document id included. */
    @get:Exclude val allBarcodes: List<String>
        get() = (listOf(barcode) + altBarcodes).filter { it.isNotBlank() }.distinct()

    /** True when [code] is any of this product's codes. */
    @get:Exclude fun answersTo(code: String): Boolean {
        val key = code.trim()
        return key.isNotEmpty() && allBarcodes.any { it.equals(key, ignoreCase = true) }
    }
}

// ------------------------------------------------------------------ templates

enum class FieldType(val label: String) {
    TEXT("Text"),
    NUMBER("Number"),
    BARCODE("Barcode"),
    DATE("Date"),
    DROPDOWN("Dropdown"),
    LOCATION("Location"),
    SIGNATURE("Signature");

    companion object {
        fun parse(raw: String?): FieldType = entries.firstOrNull { it.name == raw } ?: TEXT
    }
}

data class TemplateField(
    val key: String = "",
    val label: String = "",
    val type: String = FieldType.TEXT.name,
    val required: Boolean = false,
    val options: List<String> = emptyList(),
    val defaultValue: String = "",
    val order: Int = 0,
    /** Included as a column when exporting. */
    val includeInExport: Boolean = true,
    /**
     * Role ids that may NOT edit this field even when they can edit the record.
     * This is what blanks out individual cells for lower-privileged users.
     */
    val lockedForRoleIds: List<String> = emptyList(),
) {
    @get:Exclude val typeEnum: FieldType get() = FieldType.parse(type)

    fun isEditableBy(roleId: String): Boolean = roleId !in lockedForRoleIds
}

data class Template(
    @DocumentId val id: String = "",
    val name: String = "",
    val description: String = "",
    val fields: List<TemplateField> = emptyList(),
    /** Drives Page 2: when true a stock check cannot be completed without photos. */
    val photoRequired: Boolean = false,
    val minPhotos: Int = 1,
    val signatureRequired: Boolean = false,
    val active: Boolean = true,
    val createdByUid: String = "",
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
)

// -------------------------------------------------------------- users & roles

data class Role(
    @DocumentId val id: String = "",
    val name: String = "",
    val description: String = "",
    val permissions: List<String> = emptyList(),
    /** Built-in roles cannot be deleted; Admin's permissions cannot be reduced. */
    val builtIn: Boolean = false,
    val createdByUid: String = "",
    val createdAt: Long = 0L,
) {
    @get:Exclude val permissionSet: PermissionSet get() = PermissionSet.parse(permissions)
}

data class UserProfile(
    @DocumentId val uid: String = "",
    val email: String = "",
    val displayName: String = "",
    val roleId: String = "",
    val roleName: String = "",
    val active: Boolean = true,
    val createdAt: Long = 0L,
    val lastSeenAt: Long = 0L,
    /**
     * The company code this account registered with.
     *
     * Written by the client and checked by the Firestore rules against
     * [WorkspaceConfig.joinCode] at creation time — that comparison is what
     * actually keeps strangers out, since the code itself is unreadable to
     * anyone without a profile. Kept afterwards as a record of how the
     * account got in.
     */
    val joinCode: String = "",
)

/**
 * Workspace-wide settings, held at `meta/config`.
 *
 * Readable only by members, writable only by an admin, and deliberately
 * readable by the security rules themselves — which is how registration can
 * verify a code that the person registering cannot look up.
 */
data class WorkspaceConfig(
    val companyName: String = "",
    /** Stored upper-cased; callers normalise before comparing. */
    val joinCode: String = "",
    /**
     * Password applied to exported spreadsheets' sheet protection.
     *
     * Set by an admin because the alternative — a constant compiled into the
     * app — is published in the repository and therefore known to everyone.
     * Be clear about what this buys: Excel's sheet protection uses a 16-bit
     * hash that free tools strip in seconds. It stops idle edits, not a
     * determined person. The record that counts is the one in the app, and
     * the audit trail behind it.
     */
    val exportPassword: String = "",
    /**
     * The areas this company counts, offered when a stock check is started.
     *
     * Held per company because every warehouse names its own: A to F, 1 to 12,
     * "Cold room" and "Loading bay". Anything typed that is not on the list is
     * still accepted and added, so the list grows into the truth rather than
     * having to be right up front.
     */
    val zones: List<String> = DEFAULT_ZONES,
    val updatedAt: Long = 0L,
    val updatedByUid: String = "",
) {
    companion object {
        /** A starting point, not a rule. Replaced the moment anyone types one. */
        /**
         * No areas until somebody names one.
         *
         * A, B, C, D were a guess at how a building is divided, and a guess
         * printed as four buttons is worse than an empty row: it fills the
         * picker with names nobody uses, and the real ones queue up behind
         * them. Every warehouse names its own -- "Cold room", "Rack 7",
         * "Level 2" -- and the first one typed is the first one offered.
         */
        val DEFAULT_ZONES = emptyList<String>()

        /** Codes are compared case- and space-insensitively. */
        fun normalise(raw: String): String = raw.trim().uppercase()
    }
}

/**
 * A claimed company code, stored at `workspaceCodes/{CODE}`.
 *
 * The document id IS the code. Nothing here is secret once you can read it —
 * being able to read it is the secret.
 */
data class WorkspaceCode(
    val workspaceId: String = "",
    val companyName: String = "",
    val createdAt: Long = 0L,
    val createdByUid: String = "",
)

/** Which company an account belongs to, at `userIndex/{uid}`. */
data class UserIndex(
    val workspaceId: String = "",
    val joinedAt: Long = 0L,
)

/** A signed-in user together with the resolved permissions of their role. */
data class Session(
    val profile: UserProfile,
    val role: Role,
) {
    val uid: String get() = profile.uid
}

// ------------------------------------------------------------------ audit log

enum class AuditAction(val label: String) {
    CREATE("Created"),
    UPDATE("Changed"),
    DELETE("Deleted"),
    STATUS_CHANGE("Status changed"),
    EXPORT("Exported"),
    PERMISSION_CHANGE("Permission changed");

    companion object {
        fun parse(raw: String?): AuditAction = entries.firstOrNull { it.name == raw } ?: UPDATE
    }
}

data class AuditEntry(
    @DocumentId val id: String = "",
    val stockCheckId: String = "",
    /** e.g. "StockItem", "Template", "Role". */
    val entity: String = "",
    val entityId: String = "",
    val entityLabel: String = "",
    val action: String = AuditAction.UPDATE.name,
    val field: String = "",
    val oldValue: String = "",
    val newValue: String = "",
    val actorUid: String = "",
    val actorName: String = "",
    val at: Long = 0L,
) {
    @get:Exclude val actionEnum: AuditAction get() = AuditAction.parse(action)
}
