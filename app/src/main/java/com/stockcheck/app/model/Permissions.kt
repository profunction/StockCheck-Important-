package com.stockcheck.app.model

/**
 * Every distinct thing a user can be allowed to do.
 *
 * The stored form is the enum `name`, so entries may be added freely but must
 * never be renamed or removed once a role in Firestore references them —
 * [PermissionSet.parse] drops unknown names rather than failing, which keeps an
 * older app build usable against newer role documents.
 */
enum class Permission(val group: PermissionGroup, val label: String) {
    // --- Stock check ---
    CREATE_STOCK_CHECK(PermissionGroup.STOCK, "Create stock check"),
    SCAN_BARCODE(PermissionGroup.STOCK, "Scan barcode"),
    VOICE_INPUT(PermissionGroup.STOCK, "Voice input"),
    TAKE_PHOTO(PermissionGroup.STOCK, "Take photo"),
    EDIT_OWN_STOCK(PermissionGroup.STOCK, "Edit own stock check"),
    EDIT_ANY_STOCK(PermissionGroup.STOCK, "Edit anyone's stock check"),
    DELETE_OWN_STOCK(PermissionGroup.STOCK, "Delete own stock check"),
    DELETE_ANY_STOCK(PermissionGroup.STOCK, "Delete anyone's stock check"),
    DUPLICATE_STOCK(PermissionGroup.STOCK, "Duplicate stock check"),
    // Goods in and out between counts: deliveries, sales imported from the
    // till, write-offs. Its own permission because it moves the figure the
    // next count is judged against, which a counter must not be able to nudge.
    RECORD_STOCK_MOVEMENTS(PermissionGroup.STOCK, "Record goods in/out and import sales"),

    // --- History visibility ---
    VIEW_OWN_HISTORY(PermissionGroup.HISTORY, "View own history"),
    VIEW_ALL_HISTORY(PermissionGroup.HISTORY, "View all workers' history"),
    VIEW_AUDIT_LOG(PermissionGroup.HISTORY, "View audit log"),

    // --- Status workflow ---
    MARK_COMPLETED(PermissionGroup.WORKFLOW, "Mark as completed"),
    MARK_REVIEWED(PermissionGroup.WORKFLOW, "Mark as reviewed"),
    LOCK_STOCK(PermissionGroup.WORKFLOW, "Lock stock check"),
    UNLOCK_STOCK(PermissionGroup.WORKFLOW, "Unlock stock check"),

    // --- Templates ---
    VIEW_TEMPLATE(PermissionGroup.TEMPLATE, "View templates"),
    CREATE_TEMPLATE(PermissionGroup.TEMPLATE, "Create template"),
    EDIT_TEMPLATE(PermissionGroup.TEMPLATE, "Edit template"),
    DELETE_TEMPLATE(PermissionGroup.TEMPLATE, "Delete template"),

    // --- Export (deliberately granular, per the spec) ---
    VIEW_EXPORT(PermissionGroup.EXPORT, "Open export screen"),
    EXPORT_CSV(PermissionGroup.EXPORT, "Export CSV"),
    EXPORT_EXCEL(PermissionGroup.EXPORT, "Export Excel"),
    EXPORT_OWN_DATA(PermissionGroup.EXPORT, "Export own data"),
    EXPORT_ALL_DATA(PermissionGroup.EXPORT, "Export all data"),
    // Excel only, and the label says so. A CSV has no concept of a locked
    // cell, so withholding this from someone who holds EXPORT_CSV changes
    // nothing they can do -- and a permission that reads as though it governs
    // every export is worse than one that admits its scope.
    EDIT_EXPORTED_FILE(PermissionGroup.EXPORT, "Produce an unlocked Excel file"),
    PRINT(PermissionGroup.EXPORT, "Print"),

    // --- Import ---
    // Separate from CREATE_STOCK_CHECK, which every counter holds. Naming one
    // barcode just scanned is a counter's job; replacing the company's whole
    // catalogue from a spreadsheet is not the same act and must not ride on
    // the same permission.
    IMPORT_PRODUCTS(PermissionGroup.EXPORT, "Import product list"),
    IMPORT_COUNT_SHEET(PermissionGroup.EXPORT, "Import count sheet"),

    // --- User & role administration ---
    VIEW_USERS(PermissionGroup.ADMIN, "View users"),
    CREATE_USER(PermissionGroup.ADMIN, "Create user"),
    EDIT_USER(PermissionGroup.ADMIN, "Edit user"),
    DELETE_USER(PermissionGroup.ADMIN, "Delete user"),
    CREATE_ROLE(PermissionGroup.ADMIN, "Create role"),
    EDIT_ROLE(PermissionGroup.ADMIN, "Edit role"),
    DELETE_ROLE(PermissionGroup.ADMIN, "Delete role"),
    CHANGE_PERMISSION(PermissionGroup.ADMIN, "Change permissions"),

    // --- Cash register (the Stock Check POS website) ---
    // Selling and running the till are separate from managing it: a cashier
    // rings up sales but must not be able to change a price or make a sale
    // disappear.
    POS_SELL(PermissionGroup.POS, "Use the cash register"),
    POS_VOID(PermissionGroup.POS, "Void a sale"),
    POS_MANAGE(PermissionGroup.POS, "Manage prices, products and register settings"),
    POS_REPORTS(PermissionGroup.POS, "View sales reports"),

    // --- Warehouse system (the Stock Check warehouse website) ---
    // Receiving, transfers and adjustments ride on RECORD_STOCK_MOVEMENTS,
    // since each of them is a movement. Buying and approving are their own:
    // raising a purchase order commits the company's money, and whoever
    // approves one should not need to be the one who raised it.
    WH_PURCHASE(PermissionGroup.WAREHOUSE, "Raise purchase orders and manage suppliers"),
    WH_APPROVE(PermissionGroup.WAREHOUSE, "Approve purchase orders");

    companion object {
        fun byNameOrNull(raw: String): Permission? = entries.firstOrNull { it.name == raw }
    }
}

enum class PermissionGroup(val label: String) {
    STOCK("Stock check"),
    HISTORY("History"),
    WORKFLOW("Status workflow"),
    TEMPLATE("Templates"),
    EXPORT("Import & export"),
    ADMIN("Users & roles"),
    POS("Cash register (POS)"),
    WAREHOUSE("Warehouse"),
}

/**
 * An immutable set of granted permissions.
 *
 * This is the only place the app should ask "is X allowed?". UI hides what is
 * not granted, but every repository write re-checks here as well, so a screen
 * that forgets to hide a button still cannot perform the write. The real
 * enforcement boundary is Firestore Security Rules — this class exists to keep
 * the app honest and to give fast, offline-capable UI decisions.
 */
@JvmInline
value class PermissionSet(private val granted: Set<Permission>) {

    operator fun contains(permission: Permission): Boolean = permission in granted

    fun has(permission: Permission): Boolean = permission in granted

    fun hasAny(vararg permissions: Permission): Boolean = permissions.any { it in granted }

    fun hasAll(vararg permissions: Permission): Boolean = permissions.all { it in granted }

    fun asStoredNames(): List<String> = granted.map { it.name }.sorted()

    fun plus(permission: Permission): PermissionSet = PermissionSet(granted + permission)

    fun minus(permission: Permission): PermissionSet = PermissionSet(granted - permission)

    fun toggle(permission: Permission, on: Boolean): PermissionSet =
        if (on) plus(permission) else minus(permission)

    /** True when the holder may see a record authored by [authorUid]. */
    fun canViewRecordBy(authorUid: String, selfUid: String): Boolean =
        has(Permission.VIEW_ALL_HISTORY) || (authorUid == selfUid && has(Permission.VIEW_OWN_HISTORY))

    /** True when the holder may edit a record authored by [authorUid]. */
    fun canEditRecordBy(authorUid: String, selfUid: String): Boolean =
        has(Permission.EDIT_ANY_STOCK) || (authorUid == selfUid && has(Permission.EDIT_OWN_STOCK))

    /** True when the holder may delete a record authored by [authorUid]. */
    fun canDeleteRecordBy(authorUid: String, selfUid: String): Boolean =
        has(Permission.DELETE_ANY_STOCK) || (authorUid == selfUid && has(Permission.DELETE_OWN_STOCK))

    companion object {
        val EMPTY = PermissionSet(emptySet())

        fun of(vararg permissions: Permission) = PermissionSet(permissions.toSet())

        fun parse(stored: List<String>?): PermissionSet =
            PermissionSet(stored.orEmpty().mapNotNull(Permission::byNameOrNull).toSet())
    }
}
