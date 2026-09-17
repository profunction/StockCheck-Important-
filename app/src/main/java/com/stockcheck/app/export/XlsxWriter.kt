package com.stockcheck.app.export

import java.io.File
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * A minimal, dependency-free `.xlsx` writer.
 *
 * An xlsx file is a zip of XML parts, so writing one directly costs about two
 * hundred lines and nothing at runtime. Apache POI would do the same job but
 * adds tens of megabytes to the APK and needs library desugaring to run on
 * Android at all — not worth it for the handful of parts used here.
 *
 * Only what this app needs is implemented: one sheet, inline strings, numbers,
 * a bold header row frozen in place, column widths, and — the reason this class
 * exists rather than a CSV-only export — real per-cell locking backed by
 * Excel's own sheet protection.
 */
class XlsxWriter(
    private val sheetName: String = "Stock Check",
) {

    /** A cell's value; the type decides how Excel stores and formats it. */
    sealed interface Cell {
        data class Text(val value: String) : Cell
        data class Number(val value: Double) : Cell
        data object Blank : Cell
    }

    /**
     * @param editable when false the cell is locked once the sheet is
     *   protected, which is how an export is restricted for a role that may
     *   read a column but must not alter it.
     */
    data class Styled(val cell: Cell, val editable: Boolean = false)

    private val rows = mutableListOf<List<Styled>>()
    private var header: List<String> = emptyList()
    private var columnWidths: List<Int> = emptyList()

    fun header(columns: List<String>, widths: List<Int> = emptyList()) = apply {
        header = columns
        columnWidths = widths
    }

    fun row(cells: List<Styled>) = apply { rows += cells }

    /**
     * Writes the workbook to [out].
     *
     * When [protectionPassword] is non-null the sheet is protected, so cells
     * marked `editable = false` genuinely cannot be typed into. The password is
     * a deterrent, not encryption — Excel's legacy sheet-protection hash is
     * trivially bypassed by anyone determined, and the audit trail, not the
     * spreadsheet, is what actually establishes what a record said.
     */
    fun writeTo(out: OutputStream, protectionPassword: String? = null) {
        ZipOutputStream(out).use { zip ->
            zip.part("[Content_Types].xml", contentTypes())
            zip.part("_rels/.rels", rootRels())
            zip.part("xl/workbook.xml", workbook())
            zip.part("xl/_rels/workbook.xml.rels", workbookRels())
            zip.part("xl/styles.xml", styles())
            zip.part("xl/worksheets/sheet1.xml", sheet(protectionPassword))
        }
    }

    fun writeTo(file: File, protectionPassword: String? = null) {
        file.outputStream().use { writeTo(it, protectionPassword) }
    }

    private fun ZipOutputStream.part(name: String, body: String) {
        putNextEntry(ZipEntry(name))
        write(body.toByteArray(Charsets.UTF_8))
        closeEntry()
    }

    // ------------------------------------------------------------ XML parts

    private fun contentTypes() = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"""

    private fun rootRels() = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

    private fun workbook() = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escape(sheetName.take(31))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>"""

    private fun workbookRels() = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

    /**
     * Three cell formats, referenced by index from the sheet:
     * 0 = body (locked), 1 = header (bold, locked), 2 = body (unlocked).
     */
    private fun styles() = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0F5132"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection locked="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyProtection="1"><protection locked="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection locked="0"/></xf>
</cellXfs>
</styleSheet>"""

    private fun sheet(protectionPassword: String?): String = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        append("""<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""")

        // Freeze the header, so scrolling row nine hundred still says which
        // column is Counted and which is Expected. Before <cols> and
        // <sheetData> because the schema fixes this order and Excel rejects
        // the file outright if it is wrong -- no warning, no partial open.
        //
        // Nothing to freeze when there is no header row: a pane split above
        // row one locks an empty strip at the top of the sheet.
        if (header.isNotEmpty()) {
            append("<sheetViews><sheetView workbookViewId=\"0\">")
            append("""<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>""")
            append("""<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>""")
            append("</sheetView></sheetViews>")
        }

        if (columnWidths.isNotEmpty()) {
            append("<cols>")
            columnWidths.forEachIndexed { index, width ->
                append("""<col min="${index + 1}" max="${index + 1}" width="$width" customWidth="1"/>""")
            }
            append("</cols>")
        }

        append("<sheetData>")
        if (header.isNotEmpty()) {
            append("""<row r="1">""")
            header.forEachIndexed { column, title ->
                append(inlineString(column, 1, title, styleIndex = 1))
            }
            append("</row>")
        }
        val firstDataRow = if (header.isEmpty()) 1 else 2
        rows.forEachIndexed { offset, cells ->
            val rowNumber = firstDataRow + offset
            append("""<row r="$rowNumber">""")
            cells.forEachIndexed { column, styled ->
                val style = if (styled.editable) 2 else 0
                when (val cell = styled.cell) {
                    is Cell.Text -> append(inlineString(column, rowNumber, cell.value, style))
                    is Cell.Number -> append(numberCell(column, rowNumber, cell.value, style))
                    // A blank cell still carries its style, which is what makes
                    // a redacted column render as empty-but-locked rather than
                    // disappearing from the sheet entirely.
                    Cell.Blank -> append("""<c r="${ref(column, rowNumber)}" s="$style"/>""")
                }
            }
            append("</row>")
        }
        append("</sheetData>")

        if (protectionPassword != null) {
            append(
                // Only the attributes Excel itself writes when a sheet is
                // protected through its own UI. selectLockedCells and
                // selectUnlockedCells were set here too, and in this schema a
                // protection attribute set to 1 forbids the action rather than
                // permitting it -- which would leave a protected export whose
                // cells cannot even be clicked to read or copy. Omitted, both
                // default to allowing selection, which is what anyone opening
                // a locked sheet expects.
                """<sheetProtection password="${legacyPasswordHash(protectionPassword)}"""" +
                    """ sheet="1" objects="1" scenarios="1"/>""",
            )
        }
        append("</worksheet>")
    }

    private fun inlineString(column: Int, row: Int, value: String, styleIndex: Int): String =
        """<c r="${ref(column, row)}" s="$styleIndex" t="inlineStr"><is><t xml:space="preserve">""" +
            escape(value) + "</t></is></c>"

    private fun numberCell(column: Int, row: Int, value: Double, styleIndex: Int): String {
        // Whole numbers are written without a trailing ".0" so quantities read
        // as quantities in the spreadsheet.
        val text = if (value == value.toLong().toDouble()) value.toLong().toString() else value.toString()
        return """<c r="${ref(column, row)}" s="$styleIndex"><v>$text</v></c>"""
    }

    /** Converts a zero-based column index and 1-based row into e.g. `AB12`. */
    private fun ref(column: Int, row: Int): String {
        val name = StringBuilder()
        var n = column
        while (true) {
            name.insert(0, ('A' + (n % 26)))
            n = n / 26 - 1
            if (n < 0) break
        }
        return "$name$row"
    }

    private fun escape(raw: String): String = buildString(raw.length) {
        raw.forEach { ch ->
            when (ch) {
                '&' -> append("&amp;")
                '<' -> append("&lt;")
                '>' -> append("&gt;")
                '"' -> append("&quot;")
                '\'' -> append("&apos;")
                // Control characters are illegal in XML 1.0 and would make the
                // whole workbook unopenable, so they are dropped rather than
                // escaped. Tab, newline and carriage return are legal.
                else -> if (ch.code >= 0x20 || ch == '\t' || ch == '\n' || ch == '\r') append(ch)
            }
        }
    }

    /**
     * Excel's legacy 16-bit sheet-protection hash.
     *
     * Reimplemented here because the format requires it; see the note on
     * [writeTo] about what this does and does not protect.
     */
    private fun legacyPasswordHash(password: String): String {
        var hash = 0
        for (index in password.indices.reversed()) {
            hash = ((hash shr 14) and 0x01) or ((hash shl 1) and 0x7FFF)
            hash = hash xor password[index].code
        }
        hash = ((hash shr 14) and 0x01) or ((hash shl 1) and 0x7FFF)
        hash = hash xor password.length
        hash = hash xor 0xCE4B
        return hash.toString(16).uppercase().padStart(4, '0')
    }
}
