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
    val users: UserRepository by lazy { UserRepository(audit) }
    val auth: AuthRepository by lazy { AuthRepository(users = users) }
    val stock: StockRepository by lazy { StockRepository(audit) }
    val templates: TemplateRepository by lazy { TemplateRepository(audit) }
    val photos: PhotoRepository by lazy { PhotoRepository(appContext, audit) }
    val exports: com.stockcheck.app.export.ExportService by lazy {
        com.stockcheck.app.export.ExportService(appContext, templates, audit)
    }

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun context(): Context = appContext
}
