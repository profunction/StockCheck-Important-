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
     * Null means no work may be started, matching `licenceAllowsNewWork()` in
     * firestore.rules, which requires the document to exist. It used to mean
     * the opposite here, and the two must not drift apart again: if this says
     * yes while the rules say no, the customer taps a button that appears to
     * work and gets a denied write they cannot interpret. Every company,
     * including one on a free trial, has a licence document written for it.
     *
     * A read that fails also emits null, which is the safe direction: the
     * screen offers the paid plans rather than silently allowing work the
     * server will refuse.
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
