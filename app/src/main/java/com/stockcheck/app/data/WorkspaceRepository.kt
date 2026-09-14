package com.stockcheck.app.data

import com.stockcheck.app.model.BuiltInRoles
import com.stockcheck.app.model.UserIndex
import com.stockcheck.app.model.WorkspaceCode
import com.stockcheck.app.model.WorkspaceConfig
import kotlinx.coroutines.tasks.await

/**
 * Everything that happens above a single company.
 *
 * The per-company repositories all read [Db.workspaceId] and know nothing
 * about tenancy; this class is what decides what that id is — resolving a
 * code to a company when someone joins one, claiming a code when someone
 * creates one, and remembering which company an account belongs to.
 */
class WorkspaceRepository {

    /**
     * Looks up the company a code belongs to.
     *
     * Returns null when the code is unknown. The rules allow reading a code
     * document by id but forbid listing the collection, so this can only
     * succeed for someone who was told the code — there is no way to walk the
     * list and discover companies.
     */
    suspend fun resolveCode(rawCode: String): WorkspaceCode? {
        val code = WorkspaceConfig.normalise(rawCode)
        if (code.isEmpty()) return null
        return runCatching { Db.workspaceCode(code).getAs<WorkspaceCode>() }.getOrNull()
    }

    /** The company this account belongs to, or null if it has joined none. */
    suspend fun workspaceOf(uid: String): String? =
        runCatching { Db.userIndex(uid).getAs<UserIndex>()?.workspaceId }
            .getOrNull()
            ?.takeIf { it.isNotEmpty() }

    /**
     * Points an account at a company. Written once, at join time.
     *
     * The rules forbid updating it afterwards: moving an existing account
     * between companies would carry its role with it, and an admin of one
     * company could otherwise walk into another.
     */
    suspend fun linkUserToWorkspace(uid: String, workspaceId: String) {
        Db.userIndex(uid).set(
            UserIndex(workspaceId = workspaceId, joinedAt = System.currentTimeMillis()),
        ).awaitAck()
    }

    /**
     * Creates a company and claims its code for the calling account.
     *
     * Returns the new workspace id. Throws when the code is already taken —
     * the rules allow creating a code document only when none exists, so two
     * companies racing for the same code cannot both win.
     */
    suspend fun createWorkspace(
        uid: String,
        companyName: String,
        rawCode: String,
    ): String {
        val code = WorkspaceConfig.normalise(rawCode)
        require(code.length >= 4) { "The company code must be at least 4 characters." }
        require(companyName.isNotBlank()) { "Enter a company name." }

        if (resolveCode(code) != null) {
            throw IllegalStateException(
                "The code $code is already used by another company. Pick a different one.",
            )
        }

        val workspaceId = Db.newWorkspaceId()
        val now = System.currentTimeMillis()

        // Claiming the code first means a failure here stops the whole
        // creation, rather than leaving a company nobody can join.
        runCatching {
            Db.workspaceCode(code).set(
                WorkspaceCode(
                    workspaceId = workspaceId,
                    companyName = companyName.trim(),
                    createdAt = now,
                    createdByUid = uid,
                ),
            ).awaitAck()
        }.onFailure {
            throw IllegalStateException(
                "The code $code could not be claimed. It may have just been taken.",
                it,
            )
        }

        // Everything below is written into the new company, so point the
        // path helpers at it before touching any of them.
        Db.workspaceId = workspaceId

        val batch = Db.batch()
        BuiltInRoles.seeds.forEach { role ->
            batch.set(Db.role(role.id), role.copy(createdAt = now, createdByUid = uid))
        }
        batch.commit().awaitAck()

        Db.config().set(
            WorkspaceConfig(
                companyName = companyName.trim(),
                joinCode = code,
                updatedAt = now,
                updatedByUid = uid,
            ),
        ).awaitAck()

        linkUserToWorkspace(uid, workspaceId)
        return workspaceId
    }

    /** Forgets the current company, so the next sign-in resolves its own. */
    fun clearWorkspace() {
        Db.workspaceId = ""
    }
}
