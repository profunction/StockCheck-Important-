package com.stockcheck.app.export

import java.nio.charset.Charset

/**
 * Reads whatever spreadsheet the customer actually picked.
 *
 * Deliberately decides by looking at the bytes rather than at the file name or
 * the MIME type the picker reports. Both lie routinely: a file exported by
 * another system arrives as `stock.xls` holding CSV, Android hands over
 * `application/octet-stream` for anything it does not recognise, and a file
 * copied through a chat app loses its extension altogether. The first four
 * bytes do not lie.
 */
object SheetReader {

    /**
     * @throws IllegalArgumentException when the file cannot be read at all,
     *   with a message written for whoever has to fix the file.
     */
    fun read(bytes: ByteArray): CsvReader.Parsed {
        if (bytes.isEmpty()) {
            throw IllegalArgumentException("That file is empty.")
        }

        if (XlsxReader.looksLikeXlsx(bytes)) {
            return CsvReader.fromRows(XlsxReader.read(bytes))
        }

        // An .xls from Excel 97-2003 is a completely different format -- an
        // OLE compound document -- and its signature is unmistakable. Saying
        // so beats parsing it as text and importing a page of mojibake.
        if (isLegacyXls(bytes)) {
            throw IllegalArgumentException(
                "That is an old .xls file. Open it in Excel and use Save As to " +
                    "make an .xlsx or a .csv, then import that.",
            )
        }

        return CsvReader.parse(decode(bytes))
    }

    private fun isLegacyXls(bytes: ByteArray): Boolean {
        val signature = byteArrayOf(
            0xD0.toByte(), 0xCF.toByte(), 0x11, 0xE0.toByte(),
            0xA1.toByte(), 0xB1.toByte(), 0x1A, 0xE1.toByte(),
        )
        return bytes.size >= 8 && signature.indices.all { bytes[it] == signature[it] }
    }

    /**
     * Turns bytes into text without mangling names.
     *
     * UTF-8 is tried first and used when it holds. Excel on a Chinese Windows
     * still writes CSV in the system code page, so a file full of 汽水 comes
     * through as replacement characters if UTF-8 is simply assumed -- and the
     * import "works", silently, producing a catalogue of garbage names.
     */
    private fun decode(bytes: ByteArray): String {
        val utf8 = String(bytes, Charsets.UTF_8)
        if (!utf8.contains('�')) return utf8

        // GBK covers Simplified Chinese Excel exports, which is the case that
        // actually turns up here; anything else falls back to Latin-1, which
        // at least never throws and keeps the ASCII columns readable.
        for (name in listOf("GBK", "Big5", "windows-1252")) {
            val charset = runCatching { Charset.forName(name) }.getOrNull() ?: continue
            val decoded = String(bytes, charset)
            if (!decoded.contains('�')) return decoded
        }
        return utf8
    }
}
