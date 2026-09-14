package com.stockcheck.app.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.Exclude

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
    val totalQuantity: Int = 0,
    val photoCount: Int = 0,
    val note: String = "",
) {
    @get:Exclude val statusEnum: StockStatus get() = StockStatus.parse(status)
}

enum class ItemSource { SCAN, VOICE, MANUAL }

data class StockItem(
    @DocumentId val id: String = "",
    val barcode: String = "",
    val productName: String = "",
    val quantity: Int = 0,
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
    val updatedAt: Long = 0L,
    val updatedByUid: String = "",
) {
    companion object {
        /** Codes are compared case- and space-insensitively. */
        fun normalise(raw: String): String = raw.trim().uppercase()
    }
}

/** A signed-in user together with the resolved permissions of their role. */
data class Session(
    val profile: UserProfile,
    val role: Role,
) {
    val uid: String get() = profile.uid
    val permissions: PermissionSet get() = role.permissionSet
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
