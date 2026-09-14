package com.stockcheck.app.ui.nav

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
import com.stockcheck.app.data.AuthState
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
import com.stockcheck.app.ui.photos.PhotosScreen
import com.stockcheck.app.ui.profile.AuditLogScreen
import com.stockcheck.app.ui.profile.ProfileScreen
import com.stockcheck.app.ui.profile.RoleEditorScreen
import com.stockcheck.app.ui.profile.UserAdminScreen
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
}

private data class Tab(
    val dest: Dest,
    val label: String,
    val icon: ImageVector,
    /** Null means the tab is always shown. */
    val permission: Permission?,
)

private val tabs = listOf(
    Tab(Dest.Stock, "Stock", Icons.Filled.QrCodeScanner, Permission.CREATE_STOCK_CHECK),
    Tab(Dest.Photos, "Photos", Icons.Filled.PhotoCamera, Permission.TAKE_PHOTO),
    Tab(Dest.Templates, "Templates", Icons.Filled.Description, Permission.VIEW_TEMPLATE),
    Tab(Dest.History, "History", Icons.Filled.History, null),
    Tab(Dest.Profile, "Profile", Icons.Filled.Person, null),
)

@Composable
fun StockCheckRoot() {
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
            onRegister = sessionViewModel::register,
            onResetPassword = sessionViewModel::resetPassword,
            onClearError = sessionViewModel::clearError,
        )

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
    onSignOut: () -> Unit,
    onSeedTemplates: () -> Unit,
) {
    val navController = rememberNavController()
    val permissions = session.effectivePermissions
    val visibleTabs = tabs.filter { it.permission == null || permissions.has(it.permission) }

    Scaffold(
        bottomBar = {
            AppBottomBar(navController = navController, visibleTabs = visibleTabs)
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = visibleTabs.first().dest.route,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            composable(Dest.Stock.route) {
                StockHomeScreen(
                    session = session,
                    onOpenCheck = { checkId ->
                        navController.navigate(Dest.StockDetail.of(checkId))
                    },
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
                )
            }
            composable(Dest.HistoryDetail.route) { entry ->
                HistoryDetailScreen(
                    session = session,
                    checkId = entry.arguments?.getString("checkId").orEmpty(),
                    onBack = { navController.popBackStack() },
                )
            }

            composable(Dest.Profile.route) {
                ProfileScreen(
                    session = session,
                    onSignOut = onSignOut,
                    onManageUsers = { navController.navigate(Dest.Users.route) },
                    onEditRole = { roleId -> navController.navigate(Dest.Roles.of(roleId)) },
                    onViewAuditLog = { navController.navigate(Dest.AuditLog.route) },
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
                icon = { Icon(tab.icon, contentDescription = tab.label) },
                label = { Text(tab.label, style = MaterialTheme.typography.labelSmall) },
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
