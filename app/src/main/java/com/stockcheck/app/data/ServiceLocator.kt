package com.stockcheck.app.data

import android.content.Context

/**
 * Manual dependency container.
 *
 * The graph is small and entirely singleton-scoped, so a hand-rolled locator
 * keeps the build free of an annotation processor without costing anything in
 * testability — every consumer takes its repositories as constructor
 * parameters and only the ViewModel factories read from here.
 */
object ServiceLocator {

    private lateinit var appContext: Context

    val audit: AuditRepository by lazy { AuditRepository() }
    val workspaces: WorkspaceRepository by lazy { WorkspaceRepository() }
    val provisioning: UserProvisioning by lazy { UserProvisioning(appContext) }
    val users: UserRepository by lazy { UserRepository(audit, provisioning, workspaces) }
    val auth: AuthRepository by lazy { AuthRepository(users = users, workspaces = workspaces) }
    val products: ProductRepository by lazy { ProductRepository(audit) }
    val licences: LicenceRepository by lazy { LicenceRepository() }
    val imports: ImportRepository by lazy { ImportRepository(products, audit) }
    val refNos: RefNoAllocator by lazy { RefNoAllocator(appContext) }
    val billing: BillingRepository by lazy { BillingRepository(appContext) }
    val adminGate: AdminGate by lazy { AdminGate(appContext) }
    val stock: StockRepository by lazy { StockRepository(audit, products, refNos) }
    val templates: TemplateRepository by lazy { TemplateRepository(audit) }
    val photos: PhotoRepository by lazy { PhotoRepository(appContext, audit) }
    val exports: com.stockcheck.app.export.ExportService by lazy {
        com.stockcheck.app.export.ExportService(appContext, templates, audit)
    }
    val backups: com.stockcheck.app.export.BackupService by lazy {
        com.stockcheck.app.export.BackupService(appContext, audit)
    }

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun context(): Context = appContext
}
