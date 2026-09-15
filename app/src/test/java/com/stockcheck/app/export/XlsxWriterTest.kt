package com.stockcheck.app.export

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Document
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipInputStream
import javax.xml.parsers.DocumentBuilderFactory

/**
 * The xlsx writer produces a file this app never opens.
 *
 * Nothing in the app can tell whether the workbook is valid — that only shows
 * up when someone opens it in Excel, by which point the count it was carrying
 * is already in an email. These tests open it instead: they unzip the parts and
 * run a real XML parser over them, which is what catches an unescaped character
 * turning the whole workbook into "file is corrupt".
 */
class XlsxWriterTest {

    private fun unzip(bytes: ByteArray): Map<String, String> {
        val parts = mutableMapOf<String, String>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                parts[entry.name] = zip.readBytes().toString(Charsets.UTF_8)
            }
        }
        return parts
    }

    private fun write(
        password: String? = null,
        block: XlsxWriter.() -> Unit,
    ): Map<String, String> {
        val writer = XlsxWriter().apply(block)
        val out = ByteArrayOutputStream()
        writer.writeTo(out, password)
        return unzip(out.toByteArray())
    }

    private fun parse(xml: String): Document =
        DocumentBuilderFactory.newInstance().newDocumentBuilder()
            .parse(ByteArrayInputStream(xml.toByteArray(Charsets.UTF_8)))

    private fun sheetOf(parts: Map<String, String>): Document =
        parse(parts.getValue("xl/worksheets/sheet1.xml"))

    private fun text(value: String) = XlsxWriter.Styled(XlsxWriter.Cell.Text(value))
    private fun number(value: Double) = XlsxWriter.Styled(XlsxWriter.Cell.Number(value))

    // ------------------------------------------------------- package shape

    @Test
    fun `every part Excel requires is present and is valid XML`() {
        val parts = write {
            header(listOf("Barcode", "Product", "Quantity"))
            row(listOf(text("9556007960072"), text("汽水"), number(4.0)))
        }

        val required = listOf(
            "[Content_Types].xml",
            "_rels/.rels",
            "xl/workbook.xml",
            "xl/_rels/workbook.xml.rels",
            "xl/styles.xml",
            "xl/worksheets/sheet1.xml",
        )
        required.forEach { name ->
            assertNotNull("Missing part $name", parts[name])
            // Throws if malformed, which is exactly the failure Excel reports
            // as an unopenable file.
            parse(parts.getValue(name))
        }
    }

    // -------------------------------------------------------------- content

    @Test
    fun `chinese text survives the round trip`() {
        val parts = write {
            header(listOf("Product"))
            row(listOf(text("汽水")))
        }
        assertEquals("汽水", sheetOf(parts).getElementsByTagName("t").item(1).textContent)
    }

    @Test
    fun `xml special characters are escaped rather than breaking the sheet`() {
        val nasty = "Tom & Jerry <b> \"quoted\" 'single'"
        val parts = write {
            header(listOf("Product"))
            row(listOf(text(nasty)))
        }
        // Parsing is the real assertion: an unescaped & would throw here.
        val values = sheetOf(parts).getElementsByTagName("t")
        assertEquals(nasty, values.item(1).textContent)
    }

    @Test
    fun `control characters are dropped instead of making the workbook unopenable`() {
        // A stray bell character in a remark is illegal in XML 1.0 even when
        // escaped, and would take the whole workbook down with it.
        val parts = write {
            header(listOf("Remark"))
            row(listOf(text("before\u0007after")))
        }
        assertEquals(
            "beforeafter",
            sheetOf(parts).getElementsByTagName("t").item(1).textContent,
        )
    }

    @Test
    fun `newlines and tabs are kept because they are legal`() {
        val parts = write {
            header(listOf("Remark"))
            row(listOf(text("line one\nline two")))
        }
        assertEquals(
            "line one\nline two",
            sheetOf(parts).getElementsByTagName("t").item(1).textContent,
        )
    }

    @Test
    fun `whole numbers are written without a decimal tail`() {
        val parts = write {
            header(listOf("Quantity"))
            row(listOf(number(4.0)))
        }
        assertEquals("4", sheetOf(parts).getElementsByTagName("v").item(0).textContent)
    }

    @Test
    fun `a blank cell is still written so a redacted column stays in place`() {
        val parts = write {
            header(listOf("A", "B", "C"))
            row(listOf(text("one"), XlsxWriter.Styled(XlsxWriter.Cell.Blank), text("three")))
        }
        val rows = sheetOf(parts).getElementsByTagName("row")
        assertEquals("Row lost a cell", 3, rows.item(1).childNodes.length)
    }

    // ----------------------------------------------------------- references

    @Test
    fun `cell references pass the twenty sixth column`() {
        // Column 26 is AA. Getting this wrong corrupts every wide export, and
        // a combined history export across several templates is exactly what
        // produces more than 26 columns.
        val parts = write {
            header((1..30).map { "Col $it" })
            row((1..30).map { text("v$it") })
        }
        val headerRow = sheetOf(parts).getElementsByTagName("row").item(0)
        val refs = (0 until headerRow.childNodes.length).map { index ->
            headerRow.childNodes.item(index).attributes.getNamedItem("r").nodeValue
        }
        assertEquals("A1", refs[0])
        assertEquals("Z1", refs[25])
        assertEquals("AA1", refs[26])
        assertEquals("AD1", refs[29])
    }

    // ----------------------------------------------------------- protection

    @Test
    fun `no password means no sheet protection`() {
        val parts = write {
            header(listOf("A"))
            row(listOf(text("one")))
        }
        assertFalse(parts.getValue("xl/worksheets/sheet1.xml").contains("sheetProtection"))
    }

    @Test
    fun `a password locks the sheet without carrying the password`() {
        val parts = write(password = "secret") {
            header(listOf("A"))
            row(listOf(text("one")))
        }
        val sheet = parts.getValue("xl/worksheets/sheet1.xml")
        assertTrue("Sheet was not protected", sheet.contains("sheetProtection"))
        assertFalse("Password written in clear", sheet.contains("secret"))
    }

    @Test
    fun `the protection hash is four hex digits`() {
        val parts = write(password = "password") {
            header(listOf("A"))
            row(listOf(text("one")))
        }
        val hash = Regex("password=\"([0-9A-F]{4})\"")
            .find(parts.getValue("xl/worksheets/sheet1.xml"))
            ?.groupValues?.get(1)
        assertNotNull("Hash missing or not four hex digits", hash)
    }

    @Test
    fun `an editable cell is unlocked and everything else is not`() {
        val parts = write(password = "secret") {
            header(listOf("Ref", "Quantity"))
            row(
                listOf(
                    XlsxWriter.Styled(XlsxWriter.Cell.Text("SC-1"), editable = false),
                    XlsxWriter.Styled(XlsxWriter.Cell.Number(4.0), editable = true),
                ),
            )
        }
        val dataRow = sheetOf(parts).getElementsByTagName("row").item(1)
        fun styleOf(index: Int) =
            dataRow.childNodes.item(index).attributes.getNamedItem("s").nodeValue
        // Style 0 is locked, style 2 is unlocked; see XlsxWriter.styles().
        assertEquals("0", styleOf(0))
        assertEquals("2", styleOf(1))
    }

    // ----------------------------------------------------------- sheet name

    @Test
    fun `a sheet name is truncated to what Excel accepts`() {
        val out = ByteArrayOutputStream()
        XlsxWriter("A".repeat(50)).apply { header(listOf("A")) }.writeTo(out, null)
        val name = parse(unzip(out.toByteArray()).getValue("xl/workbook.xml"))
            .getElementsByTagName("sheet").item(0)
            .attributes.getNamedItem("name").nodeValue
        assertEquals(31, name.length)
    }
}
