package com.stockcheck.app.data

import com.stockcheck.app.model.Licence
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

/**
 * Reads what this company has paid for. There is no write side.
 *
 * Deliberately so: `/licences/{workspaceId}` is `allow write: if false` for
 * every client, and adding a save method here would only produce a call that
 * fails on the server — an invitation to someone later "fixing" the rule that
 * is stopping it. The platform writes licences through the Admin SDK, from
 * `platform/licence.mjs` or the Stripe webhook.
 *
 * What the app does with this is show it and stay out of the way. The rules
 * are what actually stop an expired company starting a new count; this exists
 * so that refusal is something the customer saw coming rather than a denied
 * write they cannot interpret.
 */
class LicenceRepository {

    /**
     * Streams the licence, or null when none has been written yet.
     *
     * Null means unprovisioned, not unlicensed, and callers must treat it as
     * permission — matching `licenceAllowsNewWork()` in firestore.rules. A
     * read that fails does the same: a listener error is a network or rules
     * problem, and neither is a reason to tell someone their company has
     * stopped paying.
     */
    fun observeLicence(): Flow<Licence?> {
        if (!Db.hasWorkspace) return kotlinx.coroutines.flow.flowOf(null)
        return Db.licence().asFlow<Licence>()
            .map { it }
            .catch { emit(null) }
    }

    suspend fun current(): Licence? =
        if (Db.hasWorkspace) Db.licence().getAs<Licence>() else null
}
