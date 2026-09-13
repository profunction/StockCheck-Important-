package com.stockcheck.app.data

import com.stockcheck.app.model.BuiltInRoles
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.PermissionSet
import com.stockcheck.app.model.Session

/** Thrown when a write is attempted without the permission that covers it. */
class PermissionDeniedException(val permission: Permission) :
    IllegalStateException("Not allowed: ${permission.label}")

/** The session's effective permissions, with Admin resolved from code. */
val Session.effectivePermissions: PermissionSet
    get() = BuiltInRoles.permissionsFor(role)

fun Session.can(permission: Permission): Boolean = effectivePermissions.has(permission)

/**
 * Fails the call unless [permission] is granted.
 *
 * Repositories call this on every mutating path so that a screen which forgets
 * to hide a control still cannot write. This is a correctness guard, not a
 * security boundary — Firestore Security Rules are what actually stop a
 * modified client, and `firestore.rules` in the project root mirrors these
 * checks server-side.
 */
fun Session.require(permission: Permission) {
    if (!can(permission)) throw PermissionDeniedException(permission)
}
