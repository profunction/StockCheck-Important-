package com.stockcheck.app.data

import com.google.firebase.firestore.Query
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
 * Your own counts are always yours to see, whichever branch they are under.
 *
 * Mirrors `inMyBranch() || isOwner()` in firestore.rules, which is the copy a
 * modified client cannot argue with.
 */
fun Session.maySee(check: StockCheck): Boolean =
    profile.branchIds.isEmpty() ||
        check.branchId.isEmpty() ||
        check.branchId in profile.branchIds ||
        check.createdByUid == uid

/**
 * The queries that between them return every stock check this account may
 * read, and nothing it may not.
 *
 * Firestore does not filter a query down to what the rules allow: it refuses
 * the whole query unless the rules hold for every document it could return.
 * So the query has to carry the restriction itself. rules-test/branch-test.mjs
 * runs each of these shapes against the real rules.
 *
 * - Without VIEW_ALL_HISTORY: your own counts, which the rules always allow.
 * - Head office (no branches): everything, newest first, [limit] of them.
 * - A branch account: one whereIn per 10 branch ids, plus the counts filed
 *   under no branch (""), plus your own wherever they are. Ordered in memory
 *   by the caller, because whereIn with orderBy on another field needs a
 *   composite index this project does not deploy.
 *
 * A count from before counts carried a branch has no branchId field at all,
 * which whereIn("") does not match. A branch account therefore does not see
 * those; head office does.
 */
fun Session.stockCheckQueries(limit: Long? = null): List<Query> {
    val own = Db.stockChecks().whereEqualTo("createdByUid", uid)
    if (!can(Permission.VIEW_ALL_HISTORY)) return listOf(own)

    val branches = profile.branchIds
    if (branches.isEmpty()) {
        val all = Db.stockChecks().orderBy("createdAt", Query.Direction.DESCENDING)
        return listOf(if (limit != null) all.limit(limit) else all)
    }
    return (branches + "").distinct()
        .chunked(WHERE_IN_LIMIT)
        .map { Db.stockChecks().whereIn("branchId", it) } + own
}

/** Firestore's ceiling is 30; 10 keeps each query small and any old SDK happy. */
private const val WHERE_IN_LIMIT = 10

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
