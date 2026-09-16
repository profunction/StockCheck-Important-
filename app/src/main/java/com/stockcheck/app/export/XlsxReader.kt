package com.stockcheck.app.export

import org.w3c.dom.Element
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipInputStream
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Reads a real `.xlsx` file.
 *
 * Asking a customer to "just save it as CSV" is asking them to do a step they
 * will forget, get wrong, or do with the wrong encoding — and the file they
 * actually have, the one already open on their screen, is an xlsx. So this
 * reads that.
 *
 * An xlsx is a zip of XML parts, the same shape [XlsxWriter] produces. Only
 * what an import needs is implemented: the first worksheet, as text.
 *
 * Free of Android types so the parsing can be tested without a device.
 */
object XlsxReader {

    /**
     * Ceilings, because this runs on a phone.
     *
     * A workbook arrives as one ByteArray, is decompressed into another, and
     * is then parsed into a DOM several times larger again. An app heap is
     * commonly 128-256MB, so an unbounded read is an out-of-memory crash on a
     * genuinely large catalogue -- and a zip whose few kilobytes expand to
     * gigabytes would take the app down on purpose.
     *
     * Failing with a sentence someone can act on beats dying silently.
     */
    private const val MAX_FILE_BYTES = 24 * 1024 * 1024
    private const val MAX_UNCOMPRESSED_BYTES = 64L * 1024 * 1024

    /** True when these bytes are a zip, which is what an xlsx is. */
    fun looksLikeXlsx(bytes: ByteArray): Boolean =
        bytes.size >= 4 &&
            bytes[0] == 0x50.toByte() && bytes[1] == 0x4B.toByte() &&
            (bytes[2] == 0x03.toByte() || bytes[2] == 0x05.toByte() || bytes[2] == 0x07.toByte())

    /**
     * The first worksheet, as rows of plain text.
     *
     * @throws IllegalArgumentException when the file is not a workbook this
     *   can read, with a message aimed at whoever has to fix the file.
     */
    fun read(bytes: ByteArray): List<List<String>> {
        require(bytes.size <= MAX_FILE_BYTES) {
            "That file is ${bytes.size / (1024 * 1024)}MB, which is too large to " +
                "import on a phone. Split it into smaller files, or remove the " +
                "images and charts and save it again."
        }
        val parts = unzip(bytes)

        require(parts.containsKey("xl/workbook.xml")) {
            "That file is not an Excel workbook. If it came from another system, " +
                "open it in Excel and save it again as .xlsx or .csv."
        }

        val shared = parts["xl/sharedStrings.xml"]?.let(::readSharedStrings) ?: emptyList()
        val sheetPath = firstSheetPath(parts)
        val sheet = parts[sheetPath]
            ?: throw IllegalArgumentException("The workbook has no readable worksheet.")

        return readSheet(sheet, shared)
    }

    // ------------------------------------------------------------- parts

    private fun unzip(bytes: ByteArray): Map<String, ByteArray> {
        val parts = mutableMapOf<String, ByteArray>()
        var budget = MAX_UNCOMPRESSED_BYTES
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                if (entry.isDirectory || !isNeeded(entry.name)) continue
                val buffer = ByteArrayOutputStream()
                val chunk = ByteArray(16 * 1024)
                while (true) {
                    val read = zip.read(chunk)
                    if (read < 0) break
                    budget -= read
                    require(budget >= 0) {
                        "That workbook expands to more than " +
                            "${MAX_UNCOMPRESSED_BYTES / (1024 * 1024)}MB, which will not " +
                            "fit in memory on a phone. Split it into smaller files."
                    }
                    buffer.write(chunk, 0, read)
                }
                parts[entry.name] = buffer.toByteArray()
            }
        }
        return parts
    }

    /**
     * Which parts of the zip are worth decompressing.
     *
     * A catalogue exported with a logo on every row carries megabytes of
     * images an import will never look at. Skipping them is both the memory
     * saving that matters and the reason a large-looking file often imports
     * fine.
     */
    private fun isNeeded(name: String): Boolean {
        val lower = name.lowercase()
        if (!lower.startsWith("xl/")) return false
        if (lower.startsWith("xl/media/") ||
            lower.startsWith("xl/embeddings/") ||
            lower.startsWith("xl/theme/") ||
            lower.contains("printersettings")
        ) {
            return false
        }
        return lower.endsWith(".xml") || lower.endsWith(".rels")
    }

    /**
     * Which part holds the first tab.
     *
     * Resolved through workbook.xml and its relationships rather than assumed
     * to be `sheet1.xml`. A workbook whose first tab was added last stores it
     * as sheet3.xml, and guessing imports the wrong tab silently — which is
     * worse than failing, because the numbers look plausible.
     */
    private fun firstSheetPath(parts: Map<String, ByteArray>): String {
        val fallback = parts.keys
            .filter { it.startsWith("xl/worksheets/") && it.endsWith(".xml") }
            .minByOrNull { it }
            ?: "xl/worksheets/sheet1.xml"

        val workbook = parts["xl/workbook.xml"] ?: return fallback
        val rels = parts["xl/_rels/workbook.xml.rels"] ?: return fallback

        val firstSheet = parse(workbook).getElementsByTagName("sheet").item(0) as? Element
            ?: return fallback
        // The r: prefix may or may not be declared the way a parser expects,
        // so the attribute is read both ways.
        val relId = firstSheet.getAttribute("r:id").ifEmpty {
            firstSheet.getAttribute("id")
        }
        if (relId.isEmpty()) return fallback

        val relationships = parse(rels).getElementsByTagName("Relationship")
        for (index in 0 until relationships.length) {
            val rel = relationships.item(index) as? Element ?: continue
            if (rel.getAttribute("Id") != relId) continue
            val target = rel.getAttribute("Target").removePrefix("/").removePrefix("xl/")
            return "xl/$target"
        }
        return fallback
    }

    /**
     * A parser that will not follow the file anywhere it should not go.
     *
     * These bytes came from a customer's machine. A DTD with a nested entity
     * expands to gigabytes from a few hundred bytes of XML, and an external
     * entity turns a spreadsheet into a request for whatever the phone can
     * reach. Neither is needed to read a worksheet, so both are refused.
     *
     * Each switch is set defensively: a parser that does not recognise one
     * throws rather than ignoring it, and an unrecognised switch is not a
     * reason to fail the import.
     */
    private fun secureFactory(): DocumentBuilderFactory =
        DocumentBuilderFactory.newInstance().apply {
            runCatching { setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true) }
            runCatching {
                setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            }
            runCatching {
                setFeature("http://xml.org/sax/features/external-general-entities", false)
            }
            runCatching {
                setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            }
            runCatching { isXIncludeAware = false }
            runCatching { isExpandEntityReferences = false }
        }

    private fun parse(bytes: ByteArray) =
        secureFactory().newDocumentBuilder().parse(ByteArrayInputStream(bytes))

    // ------------------------------------------------------------ strings

    /**
     * The shared string table.
     *
     * Excel stores most text once here and refers to it by index. A cell of
     * rich text is several runs, each with its own `<t>`; concatenating them
     * is what keeps "Coca **Cola** 1.5L" from importing as "Coca ".
     */
    private fun readSharedStrings(bytes: ByteArray): List<String> {
        val items = parse(bytes).getElementsByTagName("si")
        return (0 until items.length).map { index ->
            val si = items.item(index) as Element
            val runs = si.getElementsByTagName("t")
            buildString {
                for (run in 0 until runs.length) append(runs.item(run).textContent)
            }
        }
    }

    // ------------------------------------------------------------- sheet

    private fun readSheet(bytes: ByteArray, shared: List<String>): List<List<String>> {
        val rowNodes = parse(bytes).getElementsByTagName("row")
        val rows = mutableListOf<List<String>>()

        for (index in 0 until rowNodes.length) {
            val rowElement = rowNodes.item(index) as Element
            val cellNodes = rowElement.getElementsByTagName("c")
            val cells = mutableListOf<String>()

            for (position in 0 until cellNodes.length) {
                val cell = cellNodes.item(position) as Element
                // Excel omits empty cells entirely, so a cell's place in the
                // row comes from its reference, not from its position in the
                // XML. Reading them in order shifts every column after the
                // first gap -- quantities land under SKU and nobody notices
                // until the count is wrong.
                val column = columnIndex(cell.getAttribute("r"))
                while (cells.size < column) cells.add("")
                cells.add(valueOf(cell, shared))
            }
            rows.add(cells)
        }
        return rows
    }

    private fun valueOf(cell: Element, shared: List<String>): String {
        val type = cell.getAttribute("t")
        if (type == "inlineStr") {
            val runs = cell.getElementsByTagName("t")
            return buildString {
                for (run in 0 until runs.length) append(runs.item(run).textContent)
            }
        }

        val raw = cell.getElementsByTagName("v").item(0)?.textContent.orEmpty()
        if (raw.isEmpty()) return ""

        return when (type) {
            "s" -> raw.toIntOrNull()?.let { shared.getOrNull(it) }.orEmpty()
            "b" -> if (raw == "1") "TRUE" else "FALSE"
            // "str" is a formula result and "e" an error; both are already text.
            "str", "e" -> raw
            else -> number(raw)
        }
    }

    /**
     * Renders a numeric cell the way the person who typed it would recognise.
     *
     * A barcode is stored as a number, and 9556007960072 through a naive
     * Double.toString comes out "9.556007960072E12". Importing that produces a
     * catalogue whose barcodes match nothing ever scanned.
     */
    private fun number(raw: String): String {
        val value = raw.toDoubleOrNull() ?: return raw
        return if (value == Math.floor(value) && !value.isInfinite() &&
            Math.abs(value) < 9.007199254740992E15
        ) {
            value.toLong().toString()
        } else {
            raw
        }
    }

    /** Turns the column letters of a reference like `AB12` into a 0-based index. */
    fun columnIndex(reference: String): Int {
        var index = 0
        var seen = false
        for (ch in reference) {
            val upper = ch.uppercaseChar()
            if (upper !in 'A'..'Z') {
                if (seen) break else continue
            }
            index = index * 26 + (upper - 'A' + 1)
            seen = true
        }
        return if (seen) index - 1 else 0
    }
}
