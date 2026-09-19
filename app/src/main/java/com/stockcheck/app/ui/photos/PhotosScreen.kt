package com.stockcheck.app.ui.photos

import androidx.compose.ui.res.stringResource
import com.stockcheck.app.R
import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items as rowItems
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.IconButton
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.stockcheck.app.data.CloudPhotos
import com.stockcheck.app.data.ServiceLocator
import com.stockcheck.app.model.Quantity
import com.stockcheck.app.model.PhotoRecord
import com.stockcheck.app.model.Session
import com.stockcheck.app.model.StockCheck
import com.stockcheck.app.ui.common.EmptyState
import com.stockcheck.app.ui.common.NoticeBar
import com.stockcheck.app.ui.stock.friendlyDate
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File

class PhotosViewModel(private val session: Session) : ViewModel() {

    private val stock = ServiceLocator.stock
    private val photoRepo = ServiceLocator.photos

    val checks: StateFlow<List<StockCheck>> = stock.observeStockChecks(session, limit = 60)
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _selectedCheckId = MutableStateFlow<String?>(null)
    val selectedCheckId: StateFlow<String?> = _selectedCheckId.asStateFlow()

    @OptIn(ExperimentalCoroutinesApi::class)
    val photos: StateFlow<List<PhotoRecord>> = _selectedCheckId
        .flatMapLatest { id ->
            if (id == null) flowOf(emptyList()) else photoRepo.observePhotos(id)
        }
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    /**
     * The checks whose chips are worth showing.
     *
     * The picker is a horizontal row, which stops working long before a
     * vertical list would: forty counts is forty chips off the side of the
     * screen with no way to tell how far along you are. Matching the
     * reference, the template and the worker covers how people actually
     * remember a count -- "the one Ah Meng did last Tuesday".
     */
    val visibleChecks: StateFlow<List<StockCheck>> = combine(checks, _query) { all, text ->
        val needle = text.trim().lowercase()
        if (needle.isEmpty()) {
            all
        } else {
            all.filter { check ->
                check.refNo.lowercase().contains(needle) ||
                    check.templateName.lowercase().contains(needle) ||
                    check.createdByName.lowercase().contains(needle)
            }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun search(value: String) {
        _query.value = value
    }

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /** File the camera app is currently writing into. */
    private var pendingFile: File? = null

    fun select(checkId: String?) {
        _selectedCheckId.value = checkId
    }

    /** Creates the destination file and returns the URI to hand the camera. */
    /**
     * The camera could not be started.
     *
     * The message names the exception rather than smoothing it over. Two
     * guesses at this have already been wrong, and a person reading the
     * screen can tell us in one round what another round of guessing would
     * not. It reads as technical because it is: better a sentence nobody
     * loves than an app that closes itself, which reads as a crash because
     * it is one.
     */
    fun onCaptureFailed(cause: Throwable) {
        _error.value = buildString {
            append("Could not open the camera. ")
            append(cause::class.java.simpleName)
            cause.message?.let { append(": ").append(it) }
        }
    }

    fun prepareCapture(): Uri? {
        val checkId = _selectedCheckId.value ?: return null
        val file = photoRepo.newPhotoFile(checkId)
        pendingFile = file
        return photoRepo.uriFor(file)
    }

    fun onCaptured(success: Boolean, caption: String = "", linkedBarcode: String = "") {
        val file = pendingFile
        pendingFile = null
        val checkId = _selectedCheckId.value
        if (!success || file == null || checkId == null) {
            // The camera was cancelled; the empty placeholder file it may have
            // left behind is removed so it cannot be mistaken for a real photo.
            file?.takeIf { it.length() == 0L }?.delete()
            return
        }
        viewModelScope.launch {
            runCatching {
                photoRepo.registerCapture(
                    session = session,
                    stockCheckId = checkId,
                    localFile = file,
                    caption = caption,
                    linkedBarcode = linkedBarcode,
                )
            }.onFailure { _error.value = it.message }
        }
    }

    fun updateCaption(photo: PhotoRecord, caption: String) {
        viewModelScope.launch {
            runCatching { photoRepo.updateCaption(session, photo, caption) }
                .onFailure { _error.value = it.message }
        }
    }

    fun delete(photo: PhotoRecord) {
        viewModelScope.launch {
            runCatching { photoRepo.deletePhoto(session, photo) }
                .onFailure { _error.value = it.message }
        }
    }

    fun clearError() {
        _error.value = null
    }

    companion object {
        fun factory(session: Session) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                PhotosViewModel(session) as T
        }
    }
}

/**
 * Page 2 — the day's visual record.
 *
 * Every photo is bound to a stock check, so opening a count months later shows
 * what was actually on the shelf when the number was written down. That is the
 * whole point of this page: it answers "why did you record 24?" with evidence
 * rather than memory.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhotosScreen(session: Session) {
    val viewModel: PhotosViewModel = viewModel(factory = PhotosViewModel.factory(session))
    val checks by viewModel.checks.collectAsStateWithLifecycle()
    val photos by viewModel.photos.collectAsStateWithLifecycle()
    val selectedId by viewModel.selectedCheckId.collectAsStateWithLifecycle()
    val visibleChecks by viewModel.visibleChecks.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()

    var viewing by remember { mutableStateOf<PhotoRecord?>(null) }
    val context = LocalContext.current

    val captureLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { success -> viewModel.onCaptured(success) }

    // Declaring CAMERA in the manifest is what makes this necessary: once it
    // is declared, the system refuses ACTION_IMAGE_CAPTURE outright unless it
    // has also been granted. Every other screen that opens a camera asks
    // first; this one went straight to the intent and took the app down with
    // it for anyone who had not already said yes somewhere else.
    var hasCamera by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }

    fun capture() {
        // Everything, not just the launch. Building the file's content URI can
        // throw as readily as starting the camera can, and it was sitting
        // outside the guard -- so the one path most likely to fail was the one
        // path still able to take the app down with it.
        try {
            val target = viewModel.prepareCapture() ?: return
            captureLauncher.launch(target)
        } catch (failure: Throwable) {
            viewModel.onCaptureFailed(failure)
        }
    }

    val cameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasCamera = granted
        // Taking the photo is what was asked for; the prompt was in the way.
        if (granted) capture()
    }

    // Default to the most recent check so the page is useful the moment it opens.
    if (selectedId == null && checks.isNotEmpty()) {
        viewModel.select(checks.first().id)
    }
    val selected = checks.firstOrNull { it.id == selectedId }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(stringResource(R.string.tab_photos))
                        selected?.let {
                            Text(
                                text = "${it.refNo} · ${it.templateName}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            if (selected != null && !selected.statusEnum.isFrozen) {
                ExtendedFloatingActionButton(
                    onClick = {
                        if (hasCamera) {
                            capture()
                        } else {
                            cameraPermission.launch(Manifest.permission.CAMERA)
                        }
                    },
                    icon = { Icon(Icons.Filled.AddAPhoto, contentDescription = null) },
                    text = { Text(stringResource(R.string.take_photo)) },
                )
            }
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {

            if (!CloudPhotos.ENABLED) {
                NoticeBar(
                    // The previous wording claimed photos "travel out with the
                    // export". They never did -- the export is a spreadsheet of
                    // counted lines and has never contained an image. Saying so
                    // was worse than saying nothing: it told someone their
                    // photos were safe while the only copy sat on one phone.
                    text = "Photos are stored on this phone only. They are not in the " +
                        "CSV or Excel export and not visible on other phones. " +
                        "Profile > Back up everything is the only way to get them off " +
                        "this device.",
                    tone = com.stockcheck.app.ui.common.NoticeTone.WARNING,
                )
            }
            error?.let {
                NoticeBar(text = it, tone = com.stockcheck.app.ui.common.NoticeTone.ERROR)
            }

            if (checks.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.PhotoCamera,
                    title = "No stock check yet",
                    message = "Start a stock check on the Stock tab, then photograph " +
                        "the shelf or pallet you counted.",
                )
                return@Column
            }

            // Only once the row is long enough to be worth searching. A
            // horizontal picker degrades faster than a list does, so this sits
            // lower than the threshold used inside a count.
            if (checks.size >= SEARCH_THRESHOLD) {
                OutlinedTextField(
                    value = query,
                    onValueChange = viewModel::search,
                    label = { Text(stringResource(R.string.find_stock_check)) },
                    placeholder = { Text(stringResource(R.string.search_hint_ref)) },
                    singleLine = true,
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = { viewModel.search("") }) {
                                Icon(Icons.Filled.Close, contentDescription = "Clear search")
                            }
                        }
                    },
                    supportingText = if (query.isNotEmpty()) {
                        { Text("${visibleChecks.size} of ${checks.size} stock checks") }
                    } else {
                        null
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                )
            }

            // Guarded on the query, not just on emptiness: the flow starts
            // empty for a frame before it warms up, and without this the page
            // opens by flashing "No match" at someone who searched for nothing.
            if (visibleChecks.isEmpty() && query.isNotBlank()) {
                EmptyState(
                    icon = Icons.Filled.Search,
                    title = "No match",
                    message = "No stock check matches \"${query.trim()}\". " +
                        "The one you were looking at is still selected below.",
                )
            }

            CheckSelector(
                checks = visibleChecks,
                selectedId = selectedId,
                onSelect = viewModel::select,
            )

            SummaryLine(selected)

            if (photos.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.AddAPhoto,
                    title = "No photos for this check",
                    message = "Photograph the shelf, the pallet or the damaged case " +
                        "so the count can be justified later.",
                )
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 116.dp),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(photos, key = { it.id }) { photo ->
                        PhotoTile(photo = photo, onClick = { viewing = photo })
                    }
                }
            }
        }
    }

    viewing?.let { photo ->
        PhotoDetailDialog(
            photo = photo,
            onDismiss = { viewing = null },
            onSaveCaption = { caption ->
                viewModel.updateCaption(photo, caption)
                viewing = null
            },
            onDelete = {
                viewModel.delete(photo)
                viewing = null
            },
        )
    }
}

/**
 * How many stock checks the picker holds before a search box earns its place.
 */
private const val SEARCH_THRESHOLD = 6

@Composable
private fun CheckSelector(
    checks: List<StockCheck>,
    selectedId: String?,
    onSelect: (String) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        rowItems(checks, key = { it.id }) { check ->
            AssistChip(
                onClick = { onSelect(check.id) },
                label = {
                    Text(
                        text = check.refNo,
                        style = MaterialTheme.typography.labelLarge,
                    )
                },
                leadingIcon = if (check.id == selectedId) {
                    { Icon(Icons.Filled.PhotoCamera, contentDescription = null) }
                } else {
                    null
                },
            )
        }
    }
}

@Composable
private fun SummaryLine(check: StockCheck?) {
    if (check == null) return
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(friendlyDate(check.createdAt), style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                text = "${check.itemCount} products · ${Quantity.format(check.counted)} total quantity · " +
                    "${check.photoCount} photos",
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = "Counted by ${check.createdByName}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PhotoTile(photo: PhotoRecord, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
    ) {
        AsyncImage(
            // The local copy is preferred whenever it exists: it renders with no
            // network at all and is identical to whatever was uploaded.
            model = photo.localPath.takeIf { it.isNotEmpty() } ?: photo.downloadUrl,
            contentDescription = photo.caption.ifEmpty { "Stock photo" },
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        if (!photo.uploaded && CloudPhotos.ENABLED) {
            Icon(
                imageVector = Icons.Filled.CloudOff,
                contentDescription = "Waiting to upload",
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(6.dp),
            )
        }
    }
}

@Composable
private fun PhotoDetailDialog(
    photo: PhotoRecord,
    onDismiss: () -> Unit,
    onSaveCaption: (String) -> Unit,
    onDelete: () -> Unit,
) {
    var caption by remember(photo.id) { mutableStateOf(photo.caption) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(friendlyDate(photo.takenAt)) },
        text = {
            Column {
                AsyncImage(
                    model = photo.localPath.takeIf { it.isNotEmpty() } ?: photo.downloadUrl,
                    contentDescription = photo.caption,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(220.dp)
                        .clip(RoundedCornerShape(8.dp)),
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Taken by ${photo.takenByName}" +
                        if (photo.linkedBarcode.isNotEmpty()) {
                            " · ${photo.linkedBarcode}"
                        } else {
                            ""
                        },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = caption,
                    onValueChange = { caption = it },
                    label = { Text(stringResource(R.string.caption)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = { TextButton(onClick = { onSaveCaption(caption) }) { Text(stringResource(R.string.save)) } },
        dismissButton = {
            Row {
                TextButton(onClick = onDelete) { Text(stringResource(R.string.delete)) }
                Spacer(Modifier.width(4.dp))
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) }
            }
        },
    )
}
