package com.stockcheck.app.data

import com.stockcheck.app.model.Licence
import com.stockcheck.app.model.LicenceStatus
import com.stockcheck.app.model.Plan
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

/**
 * Reads what this company has paid for, and can write exactly one thing.
 *
 * `/licences/{workspaceId}` is `allow write: if false` for every client, with
 * one carved-out exception mirrored here: a brand-new company issuing itself
 * the 3-day trial every company gets, in [startTrial]. Anything past that —
 * upgrading, extending, renewing — goes through the Admin SDK on the
 * platform's own machine, from `platform/licence-cli.mjs` or the Stripe
 * webhook, and adding a method here for any of those would only produce a
 * call that fails on the server.
 *
 * What the app does otherwise is show the licence and stay out of the way.
 * The rules are what actually stop an expired company starting a new count;
 * this exists so that refusal is something the customer saw coming rather
 * than a denied write they cannot interpret.
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

    /**
     * Issues the one licence a client may ever write: a 3-day trial, for a
     * company that was just created.
     *
     * Called with an explicit [workspaceId] rather than through [Db.licence],
     * because this runs during registration, before `Db.workspaceId` is set
     * for the session — see the ordering note on
     * [AuthRepository.createCompany].
     *
     * The shape is pinned to what `licenceAllowsNewWork()` in
     * firestore.rules will actually accept for this write: plan TRIAL,
     * status ACTIVE, 5 seats, an expiry 3 days out. Sending anything else
     * is refused server-side, so there is nothing to gain by changing these
     * values here — the rule, not this function, is what a modified client
     * would have to get past.
     *
     * Best-effort by design: a failure here must not fail registration
     * itself. A company with no trial yet meets the paywall on its first
     * count instead of never having been able to sign up at all, and that
     * is the failure worth choosing between the two.
     */
    suspend fun startTrial(workspaceId: String) {
        val now = System.currentTimeMillis()
        Db.licenceFor(workspaceId).set(
            Licence(
                workspaceId = workspaceId,
                plan = Plan.TRIAL.name,
                status = LicenceStatus.ACTIVE.name,
                seats = Plan.TRIAL.seats,
                startedAt = now,
                expiresAt = now + TRIAL_MILLIS,
                note = "self-service trial",
                updatedAt = now,
            ),
        ).awaitAck()
    }

    private companion object {
        /** 3 days, matching TRIAL_DAYS in platform/plans.mjs. */
        const val TRIAL_MILLIS = 3L * 24 * 60 * 60 * 1000
    }
}
