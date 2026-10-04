package com.stockcheck.app.ui.nav

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import com.stockcheck.app.CrashLog
import androidx.annotation.StringRes
import androidx.compose.ui.res.stringResource
import com.stockcheck.app.R
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.compose.runtime.LaunchedEffect
import com.stockcheck.app.data.AuthState
import com.stockcheck.app.data.Db
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.data.effectivePermissions
import com.stockcheck.app.model.Permission
import com.stockcheck.app.model.PermissionSet
import com.stockcheck.app.model.Session
import com.stockcheck.app.ui.SessionViewModel
import com.stockcheck.app.ui.auth.AuthScreen
import com.stockcheck.app.ui.common.EmptyState
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.common.NoticeTone
import com.stockcheck.app.ui.history.HistoryDetailScreen
import com.stockcheck.app.ui.history.HistoryScreen
import com.stockcheck.app.ui.onboarding.OnboardingSeen
import com.stockcheck.app.ui.onboarding.OnboardingTour
import com.stockcheck.app.ui.photos.PhotosScreen
import com.stockcheck.app.ui.products.ProductsScreen
import com.stockcheck.app.ui.profile.AuditLogScreen
import com.stockcheck.app.ui.profile.ProfileScreen
import com.stockcheck.app.ui.profile.RoleEditorScreen
import com.stockcheck.app.ui.profile.UserAdminScreen
import com.stockcheck.app.ui.reports.ReportsScreen
import com.stockcheck.app.ui.stock.StockCheckScreen
import com.stockcheck.app.ui.stock.StockHomeScreen
import com.stockcheck.app.ui.template.TemplateEditorScreen
import com.stockcheck.app.ui.template.TemplateListScreen

/** Every destination in the app, with the permission that reveals its tab. */
sealed class Dest(val route: String) {
    data object Stock : Dest("stock")
    data object StockDetail : Dest("stock/{checkId}") {
        fun of(checkId: String) = "stock/$checkId"
    }

    data object Products : Dest("products")
    data object Photos : Dest("photos")
    data object Templates : Dest("templates")
    data object TemplateEditor : Dest("templates/edit/{templateId}") {
        /** "new" creates; any other id edits that template. */
        fun of(templateId: String) = "templates/edit/$templateId"
    }

    data object History : Dest("history")
    data object HistoryDetail : Dest("history/{checkId}") {
        fun of(checkId: String) = "history/$checkId"
    }

    data object Profile : Dest("profile")
    data object Users : Dest("profile/users")
    data object Roles : Dest("profile/roles/{roleId}") {
        fun of(roleId: String) = "profile/roles/$roleId"
    }

    data object AuditLog : Dest("profile/audit")

    data object Onboarding : Dest("onboarding")

    // Not "history/reports": that would also match history/{checkId}. The
    // "history" prefix still keeps the History tab lit while it is open.
    data object Reports : Dest("historyreports")
}

private data class Tab(
    val dest: Dest,
    // A resource, not a word: the label has to change when the language does,
    // and a String baked into this list at class-load time never can.
    @StringRes val label: Int,
    val icon: ImageVector,
    /** Null means the tab is always shown. */
    val permission: Permission?,
)

private val tabs = listOf(
    Tab(Dest.Stock, R.string.tab_stock, Icons.Filled.QrCodeScanner, Permission.CREATE_STOCK_CHECK),
    Tab(Dest.Photos, R.string.tab_photos, Icons.Filled.PhotoCamera, Permission.TAKE_PHOTO),
    Tab(Dest.Templates, R.string.tab_templates, Icons.Filled.Description, Permission.VIEW_TEMPLATE),
    Tab(Dest.History, R.string.tab_history, Icons.Filled.History, null),
    Tab(Dest.Profile, R.string.tab_profile, Icons.Filled.Person, null),
)

@Composable
fun StockCheckRoot() {
    LastCrashDialog()
    val sessionViewModel: SessionViewModel = viewModel()
    val authState by sessionViewModel.authState.collectAsStateWithLifecycle()
    val busy by sessionViewModel.busy.collectAsStateWithLifecycle()
    val error by sessionViewModel.formError.collectAsStateWithLifecycle()

    when (val state = authState) {
        AuthState.Loading -> FullScreenLoader()

        AuthState.SignedOut -> AuthScreen(
            busy = busy,
            error = error,
            onSignIn = sessionViewModel::signIn,
            onCreateCompany = sessionViewModel::createCompany,
            onResetPassword = sessionViewModel::resetPassword,
            onClearError = sessionViewModel::clearError,
        )

        // Signed in to an account that belongs to no company: either it was
        // made before companies existed, or its registration died after the
        // Auth account was created. Signing out returns to the form, where
        // Join or New company is the way forward.
        is AuthState.NoWorkspace -> Surface(modifier = Modifier.fillMaxSize()) {
            EmptyState(
                icon = Icons.Filled.Person,
                title = "This account has no company",
                message = "${state.email} is signed in but is not a member of any " +
                    "company yet. Ask an administrator to create your account, or sign " +
                    "out and set up a new company.",
                action = {
                    Button(onClick = sessionViewModel::signOut) { Text("Sign out") }
                },
            )
        }

        // Signed in, but registration never wrote the profile behind the
        // account. This used to fall through to the sign-in screen, which was
        // indistinguishable from the Sign in button doing nothing at all: the
        // credentials were accepted, the screen simply reappeared. Say what
        // happened and offer to finish the job.
        is AuthState.NoProfile -> Surface(modifier = Modifier.fillMaxSize()) {
            EmptyState(
                icon = Icons.Filled.Person,
                title = "Setup didn't finish",
                message = "You are signed in as ${state.email}, but this account has no " +
                    "profile yet — registration created the login and then could not " +
                    "write to the database. Finish it now to carry on with the same " +
                    "account.",
                action = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        if (error != null) {
                            NoticeBar(text = error!!, tone = NoticeTone.ERROR)
                            Spacer(Modifier.height(12.dp))
                        }
                        Button(onClick = sessionViewModel::completeSetup, enabled = !busy) {
                            Text(if (busy) "Finishing…" else "Finish setup")
                        }
                        TextButton(onClick = sessionViewModel::signOut, enabled = !busy) {
                            Text("Sign out")
                        }
                    }
                },
            )
        }

        is AuthState.Failed -> Surface(modifier = Modifier.fillMaxSize()) {
            EmptyState(
                icon = Icons.Filled.Person,
                title = "Signed in, but couldn't load your account",
                message = state.message,
                action = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Button(onClick = sessionViewModel::completeSetup, enabled = !busy) {
                            Text(if (busy) "Retrying…" else "Retry setup")
                        }
                        TextButton(onClick = sessionViewModel::signOut, enabled = !busy) {
                            Text("Sign out")
                        }
                    }
                },
            )
        }

        is AuthState.Deactivated -> Surface(modifier = Modifier.fillMaxSize()) {
            EmptyState(
                icon = Icons.Filled.Person,
                title = "Account deactivated",
                message = "${state.profile.displayName}, an administrator has deactivated " +
                    "this account. Ask them to reactivate it to continue.",
                action = {
                    TextButton(onClick = sessionViewModel::signOut) { Text("Sign out") }
                },
            )
        }

        is AuthState.SignedIn -> MainScaffold(
            session = state.session,
            busy = busy,
            formError = error,
            onChangePassword = sessionViewModel::changePassword,
            onSignOut = sessionViewModel::signOut,
            onSeedTemplates = sessionViewModel::seedTemplatesIfNeeded,
        )
    }
}

@Composable
private fun FullScreenLoader() {
    Surface(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
    }
}

@Composable
private fun MainScaffold(
    session: Session,
    busy: Boolean,
    formError: String?,
    onChangePassword: (
        current: String,
        new: String,
        confirm: String,
        done: () -> Unit,
    ) -> Unit,
    onSignOut: () -> Unit,
    onSeedTemplates: () -> Unit,
) {
    val navController = rememberNavController()
    val permissions = session.effectivePermissions
    val visibleTabs = tabs.filter { it.permission == null || permissions.has(it.permission) }
    val context = LocalContext.current

    // Decided once per sign-in, not re-checked on every recomposition: the
    // tour marks itself seen the moment it is dismissed, and re-evaluating
    // this after that would try to change a NavHost's start destination
    // after it has already been created, which does nothing.
    val startDestination = remember(session.profile.uid) {
        if (OnboardingSeen.wasSeen(context, session.profile.uid)) {
            visibleTabs.first().dest.route
        } else {
            Dest.Onboarding.route
        }
    }

    // Finish paying for anything Play took money for.
    //
    // A purchase completes the moment Play's sheet closes, and the licence is
    // only written once the platform has verified the token with Google. If
    // that call does not get through -- the server is down, the phone is in a
    // basement -- the customer has paid and has nothing, and Google refunds an
    // unacknowledged purchase after three days.
    //
    // Play re-offers an unfinished purchase on every connection, so the fix is
    // to connect on every sign-in rather than only when somebody happens to
    // open the paywall again. Someone who paid, saw nothing happen and closed
    // the app is exactly the person who will not go back and press the button
    // that used to be the only thing that retried.
    LaunchedEffect(Db.workspaceId) {
        if (Db.hasWorkspace) {
            ServiceLocator.billing.workspaceId = Db.workspaceId
            ServiceLocator.billing.start()
        }
    }

    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route

    Scaffold(
        bottomBar = {
            // Full screen while the tour is up -- a bottom bar underneath it
            // invites tapping straight past a step rather than reading it.
            if (currentRoute != Dest.Onboarding.route) {
                AppBottomBar(navController = navController, visibleTabs = visibleTabs)
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            composable(Dest.Onboarding.route) {
                OnboardingTour(
                    onDone = {
                        OnboardingSeen.markSeen(context, session.profile.uid)
                        navController.navigate(visibleTabs.first().dest.route) {
                            popUpTo(Dest.Onboarding.route) { inclusive = true }
                        }
                    },
                )
            }

            composable(Dest.Stock.route) {
                StockHomeScreen(
                    session = session,
                    onOpenCheck = { checkId ->
                        navController.navigate(Dest.StockDetail.of(checkId))
                    },
                    onOpenProducts = { navController.navigate(Dest.Products.route) },
                )
            }
            composable(Dest.StockDetail.route) { entry ->
                StockCheckScreen(
                    session = session,
                    checkId = entry.arguments?.getString("checkId").orEmpty(),
                    onBack = { navController.popBackStack() },
                    onOpenPhotos = { navController.navigate(Dest.Photos.route) },
                )
            }

            composable(Dest.Products.route) {
                ProductsScreen(session = session, onBack = { navController.popBackStack() })
            }

            composable(Dest.Photos.route) {
                PhotosScreen(session = session)
            }

            composable(Dest.Templates.route) {
                TemplateListScreen(
                    session = session,
                    onSeedDefaults = onSeedTemplates,
                    onEdit = { templateId ->
                        navController.navigate(Dest.TemplateEditor.of(templateId))
                    },
                )
            }
            composable(Dest.TemplateEditor.route) { entry ->
                TemplateEditorScreen(
                    session = session,
                    templateId = entry.arguments?.getString("templateId").orEmpty(),
                    onDone = { navController.popBackStack() },
                )
            }

            composable(Dest.History.route) {
                HistoryScreen(
                    session = session,
                    onOpen = { checkId -> navController.navigate(Dest.HistoryDetail.of(checkId)) },
                    onOpenReports = { navController.navigate(Dest.Reports.route) },
                )
            }
            composable(Dest.Reports.route) {
                ReportsScreen(session = session, onBack = { navController.popBackStack() })
            }
            composable(Dest.HistoryDetail.route) { entry ->
                HistoryDetailScreen(
                    session = session,
                    checkId = entry.arguments?.getString("checkId").orEmpty(),
                    onBack = { navController.popBackStack() },
                    onContinueCounting = { id ->
                        navController.navigate(Dest.StockDetail.of(id))
                    },
                )
            }

            composable(Dest.Profile.route) {
                ProfileScreen(
                    session = session,
                    busy = busy,
                    passwordError = formError,
                    onChangePassword = onChangePassword,
                    onSignOut = onSignOut,
                    onManageUsers = { navController.navigate(Dest.Users.route) },
                    onEditRole = { roleId -> navController.navigate(Dest.Roles.of(roleId)) },
                    onViewAuditLog = { navController.navigate(Dest.AuditLog.route) },
                    onOpenOnboarding = { navController.navigate(Dest.Onboarding.route) },
                )
            }
            composable(Dest.Users.route) {
                UserAdminScreen(session = session, onBack = { navController.popBackStack() })
            }
            composable(Dest.Roles.route) { entry ->
                RoleEditorScreen(
                    session = session,
                    roleId = entry.arguments?.getString("roleId").orEmpty(),
                    onBack = { navController.popBackStack() },
                )
            }
            composable(Dest.AuditLog.route) {
                AuditLogScreen(session = session, onBack = { navController.popBackStack() })
            }
        }
    }
}

@Composable
private fun AppBottomBar(navController: NavHostController, visibleTabs: List<Tab>) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    NavigationBar {
        visibleTabs.forEach { tab ->
            // A detail screen keeps its parent tab highlighted, so opening a
            // stock check from the Stock tab does not clear the selection.
            val selected = currentDestination?.hierarchy?.any { dest ->
                dest.route == tab.dest.route || dest.route?.startsWith(tab.dest.route) == true
            } == true

            NavigationBarItem(
                selected = selected,
                onClick = {
                    navController.navigate(tab.dest.route) {
                        // Standard bottom-nav behaviour: one entry per tab, and
                        // re-tapping a tab returns to its root rather than
                        // stacking another copy.
                        popUpTo(navController.graph.findStartDestination().id) {
                            saveState = true
                        }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = {
                    Icon(tab.icon, contentDescription = stringResource(tab.label))
                },
                label = {
                    Text(
                        text = stringResource(tab.label),
                        style = MaterialTheme.typography.labelSmall,
                    )
                },
            )
        }
    }
}

/** Shown in place of a screen the role may open but not act on. */
@Composable
fun NotPermitted(what: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxSize()) {
        EmptyState(
            icon = Icons.Filled.Person,
            title = "Not available for your role",
            message = "Your role does not include permission to $what. " +
                "An administrator can change this in Profile.",
        )
    }
}

/** Convenience for screens that need to branch on a single permission. */
fun PermissionSet.gate(permission: Permission): Boolean = has(permission)

/**
 * Shows the stack trace of the last crash, once, with a button that copies it.
 *
 * A crash on somebody else's phone is otherwise only ever reported as "it
 * closed itself" -- true, and no help in finding where. Reading it back on
 * the next launch turns each crash into one paste instead of one round of
 * guessing, which is the difference between fixing it and fixing something
 * near it.
 *
 * Shown above everything, including the sign-in screen: a crash before anyone
 * signs in is exactly the kind that is hardest to hear about.
 */
@Composable
private fun LastCrashDialog() {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var trace by remember { mutableStateOf(CrashLog.last(context)) }

    trace?.let { text ->
        AlertDialog(
            onDismissRequest = {},
            title = { Text("The app closed unexpectedly") },
            text = {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    Text(
                        text = "Copy this and send it on — it says where it went wrong.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = text,
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { clipboard.setText(AnnotatedString(text)) },
                ) { Text("Copy") }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        CrashLog.clear(context)
                        trace = null
                    },
                ) { Text("Dismiss") }
            },
        )
    }
}
