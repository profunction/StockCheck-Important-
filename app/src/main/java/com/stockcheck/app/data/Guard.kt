package com.stockcheck.app.data

import com.stockcheck.app.model.BuiltInRoles
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.PermissionSet
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck

/** Thrown when a write is attempted without the permission that covers it. */
class PermissionDeniedException(val permission: Permission) :
    IllegalStateException("Not allowed: ${permission.label}")

/** The session's effective permissions, with Admin resolved from code. */
val Session.effectivePermissions: PermissionSet
    get() = BuiltInRoles.permissionsFor(role)

fun Session.can(permission: Permission): Boolean = effectivePermissions.has(permission)

/**
 * Whether this account may look at a count made at [check]'s branch.
 *
 * An account with no branches listed sees every one of them. That is head
 * office, it is the default, and it is what makes adding branches to a company
 * that already has history harmless: nobody is locked out of anything by a
 * field appearing.
 *
 * A count carrying no branch is visible to everyone. Most customers run one
 * shop and will never set a branch on anything, and hiding those from a branch
 * manager would hide the company's entire past from them.
 *
 * This narrows a query so the client does not ask for documents it would be
 * refused: a denied read fails the whole listener rather than filtering it.
 * The refusal itself belongs in firestore.rules, which is the copy a modified
 * client cannot argue with.
 */
fun Session.maySee(check: StockCheck): Boolean =
    profile.branchIds.isEmpty() ||
        check.branchId.isEmpty() ||
        check.branchId in profile.branchIds

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
