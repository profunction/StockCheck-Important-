package com.stockcheck.app.export

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The import reads a file somebody else made.
 *
 * Every assumption it holds about that file is one a real customer workbook
 * gets to break: the tab is not sheet1, the empty cells are absent rather than
 * blank, the barcode is stored as a number, and the whole thing is far bigger
 * than a phone can hold. The cases below are those, not the happy path.
 */
class XlsxReaderTest {

    private fun zip(entries: Map<String, String>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { archive ->
            entries.forEach { (name, body) ->
                archive.putNextEntry(ZipEntry(name))
                archive.write(body.toByteArray(Charsets.UTF_8))
                archive.closeEntry()
            }
        }
        return out.toByteArray()
    }

    private fun workbook(sheet: String, sharedStrings: String? = null): ByteArray {
        val entries = mutableMapOf(
            "xl/workbook.xml" to
                """<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>""",
            "xl/_rels/workbook.xml.rels" to
                """<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>""",
            "xl/worksheets/sheet1.xml" to sheet,
        )
        if (sharedStrings != null) entries["xl/sharedStrings.xml"] = sharedStrings
        return zip(entries)
    }

    @Test
    fun `shared strings and numbers are read as the person typed them`() {
        val rows = XlsxReader.read(
            workbook(
                sheet = """
                    <worksheet><sheetData>
                      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
                      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>9556007960072</v></c></row>
                    </sheetData></worksheet>
                """.trimIndent(),
                sharedStrings =
                    "<sst><si><t>Barcode</t></si><si><t>Name</t></si><si><t>Coke</t></si></sst>",
            ),
        )

        assertEquals(listOf("Barcode", "Name"), rows[0])
        // B2 is absent, not blank: the barcode must stay under column C.
        assertEquals(listOf("Coke", "", "9556007960072"), rows[1])
    }

    @Test
    fun `a barcode stored as a number does not come back in scientific notation`() {
        val rows = XlsxReader.read(
            workbook("""<worksheet><sheetData><row r="1"><c r="A1"><v>9556007960072</v></c></row></sheetData></worksheet>"""),
        )
        assertEquals("9556007960072", rows[0][0])
    }

    @Test
    fun `a file too large to hold in memory is refused, not crashed on`() {
        val message = try {
            XlsxReader.read(ByteArray(25 * 1024 * 1024))
            null
        } catch (error: IllegalArgumentException) {
            error.message
        }
        assertTrue("Expected a refusal, got: $message", message?.contains("too large") == true)
    }

    @Test
    fun `something that is not a workbook is refused with a usable message`() {
        val message = try {
            XlsxReader.read(zip(mapOf("hello.txt" to "not a workbook")))
            null
        } catch (error: IllegalArgumentException) {
            error.message
        }
        assertTrue("Expected a refusal, got: $message", message?.contains("not an Excel") == true)
    }

    @Test
    fun `column letters map to positions`() {
        assertEquals(0, XlsxReader.columnIndex("A1"))
        assertEquals(25, XlsxReader.columnIndex("Z9"))
        assertEquals(26, XlsxReader.columnIndex("AA1"))
        assertEquals(27, XlsxReader.columnIndex("AB12"))
    }

    @Test
    fun `a zip is recognised and a text file is not`() {
        assertTrue(XlsxReader.looksLikeXlsx(zip(mapOf("a.xml" to "<a/>"))))
        assertTrue(!XlsxReader.looksLikeXlsx("barcode,name\n123,Coke".toByteArray()))
    }
}
