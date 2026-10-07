package com.stockcheck.app.model

import com.stockcheck.app.model.Permission as P

/**
 * The roles seeded into a fresh workspace. Admins can create further roles and
 * edit these two presets, but [ADMIN_ID] always keeps every permission — see
 * [permissionsFor] — so a workspace can never lock itself out of its own
 * administration screen.
 */
object BuiltInRoles {

    const val ADMIN_ID = "admin"
    const val WORKER_ID = "worker"
    const val SUPERVISOR_ID = "supervisor"
    const val MANAGER_ID = "warehouse_manager"

    private val adminPermissions: Set<P> = P.entries.toSet()

    private val workerPermissions: Set<P> = setOf(
        P.CREATE_STOCK_CHECK,
        P.SCAN_BARCODE,
        P.VOICE_INPUT,
        P.TAKE_PHOTO,
        P.EDIT_OWN_STOCK,
        P.VIEW_OWN_HISTORY,
        P.MARK_COMPLETED,
        P.VIEW_TEMPLATE,
        P.VIEW_EXPORT,
        P.EXPORT_CSV,
        P.EXPORT_OWN_DATA,
    )

    private val supervisorPermissions: Set<P> = workerPermissions + setOf(
        P.EDIT_ANY_STOCK,
        P.DUPLICATE_STOCK,
        P.VIEW_ALL_HISTORY,
        P.VIEW_AUDIT_LOG,
        P.MARK_REVIEWED,
        P.LOCK_STOCK,
        P.EXPORT_EXCEL,
        P.EXPORT_ALL_DATA,
        P.PRINT,
        P.VIEW_USERS,
        P.IMPORT_COUNT_SHEET,
    )

    private val managerPermissions: Set<P> = supervisorPermissions + setOf(
        P.DELETE_ANY_STOCK,
        P.DELETE_OWN_STOCK,
        P.UNLOCK_STOCK,
        P.CREATE_TEMPLATE,
        P.EDIT_TEMPLATE,
        P.EDIT_EXPORTED_FILE,
        P.IMPORT_PRODUCTS,
        P.RECORD_STOCK_MOVEMENTS,
        P.POS_SELL,
        P.POS_VOID,
        P.POS_MANAGE,
        P.POS_REPORTS,
    )

    val seeds: List<Role> = listOf(
        Role(
            id = ADMIN_ID,
            name = "Admin",
            description = "Full control over stock, templates, users, roles and exports.",
            permissions = adminPermissions.map { it.name }.sorted(),
            builtIn = true,
        ),
        Role(
            id = WORKER_ID,
            name = "Worker",
            description = "Counts stock and edits only their own records.",
            permissions = workerPermissions.map { it.name }.sorted(),
            builtIn = true,
        ),
        Role(
            id = SUPERVISOR_ID,
            name = "Supervisor",
            description = "Reviews and locks the team's counts; cannot delete or manage users.",
            permissions = supervisorPermissions.map { it.name }.sorted(),
            builtIn = true,
        ),
        Role(
            id = MANAGER_ID,
            name = "Warehouse Manager",
            description = "Supervisor plus template authoring, deletion and unlocking.",
            permissions = managerPermissions.map { it.name }.sorted(),
            builtIn = true,
        ),
    )

    /**
     * Admin is resolved from code rather than from its stored permission list.
     * An admin who accidentally unticks CHANGE_PERMISSION on their own role
     * would otherwise be unable to tick it back on.
     */
    fun permissionsFor(role: Role): PermissionSet =
        if (role.id == ADMIN_ID) PermissionSet.parse(adminPermissions.map { it.name })
        else role.permissionSet

    fun isProtected(roleId: String): Boolean = roleId == ADMIN_ID
}
