package com.stockcheck.app.export

/**
 * Reads the CSV people actually have.
 *
 * Not a general parser — a tolerant one, aimed at the file a stock controller
 * exports from whatever system they already run. That file has a UTF-8 BOM
 * from Excel, CRLF endings, quoted fields containing commas, a header row
 * whose column names nobody agreed on, and at least one blank line at the
 * bottom. Every one of those, met with a stack trace, is a customer who
 * decides the import does not work.
 *
 * Kept free of Android types so the grammar is testable without a device.
 */
object CsvReader {

    /** One parsed row, addressable by header name. */
    class Row(private val byHeader: Map<String, String>, val lineNumber: Int) {
        /**
         * The first of [names] that the file actually has, trimmed.
         *
         * Several names because the same column arrives called "barcode",
         * "Bar Code", "EAN" or "UPC" depending on who exported it, and asking
         * the customer to rename their columns first loses the customer.
         */
        fun get(vararg names: String): String {
            names.forEach { name ->
                byHeader[normaliseHeader(name)]?.let { if (it.isNotBlank()) return it.trim() }
            }
            return ""
        }

        fun int(vararg names: String): Int? {
            val raw = get(*names)
            if (raw.isEmpty()) return null
            // "1,200" and "1 200" are both a thousand two hundred to a human.
            return raw.replace(",", "").replace(" ", "").trim().toIntOrNull()
                ?: raw.toDoubleOrNull()?.toInt()
        }

        val isEmpty: Boolean get() = byHeader.values.all { it.isBlank() }
    }

    data class Parsed(
        val rows: List<Row>,
        val headers: List<String>,
    )

    /**
     * Splits [text] into rows keyed by header.
     *
     * The first non-empty line is the header. A file with no header at all
     * would be guesswork, and guessing which column is the barcode is how an
     * import silently loads prices as quantities.
     */
    fun parse(text: String): Parsed = fromRows(split(text))

    /**
     * Builds the same result from rows that came from somewhere other than CSV
     * text -- a real .xlsx, read by [XlsxReader].
     *
     * Header matching, blank-row skipping and short-row tolerance are the same
     * either way, because the file being a spreadsheet rather than text
     * changes nothing about how forgiving the import has to be.
     */
    fun fromRows(cells: List<List<String>>): Parsed {
        val headerRow = cells.firstOrNull { row -> row.any { it.isNotBlank() } }
            ?: return Parsed(emptyList(), emptyList())
        val headers = headerRow.map { it.trim() }
        val keys = headers.map { normaliseHeader(it) }

        val rows = cells
            .drop(cells.indexOf(headerRow) + 1)
            .mapIndexedNotNull { offset, values ->
                if (values.all { it.isBlank() }) return@mapIndexedNotNull null
                val map = buildMap {
                    keys.forEachIndexed { index, key ->
                        // A row may be short; a missing trailing cell is empty,
                        // not a parse error.
                        put(key, values.getOrNull(index)?.trim().orEmpty())
                    }
                }
                Row(map, lineNumber = cells.indexOf(headerRow) + offset + 2)
            }
        return Parsed(rows, headers)
    }

    /**
     * Splits CSV text into rows of raw cells.
     *
     * Handles quoted fields, doubled quotes inside them, and newlines inside
     * quotes — a product description with a line break in it would otherwise
     * shift every following column by one.
     */
    fun split(text: String): List<List<String>> {
        // Excel writes a BOM so it can recognise its own UTF-8 later. Left in,
        // it becomes part of the first header name and that column is never
        // found again.
        val body = text.removePrefix("﻿")
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        val cell = StringBuilder()
        var inQuotes = false
        var index = 0

        fun endCell() {
            row.add(cell.toString())
            cell.setLength(0)
        }

        fun endRow() {
            endCell()
            rows.add(row)
            row = mutableListOf()
        }

        while (index < body.length) {
            val ch = body[index]
            when {
                inQuotes && ch == '"' && body.getOrNull(index + 1) == '"' -> {
                    cell.append('"')
                    index++
                }
                ch == '"' -> inQuotes = !inQuotes
                !inQuotes && ch == ',' -> endCell()
                !inQuotes && (ch == '\n' || ch == '\r') -> {
                    // CRLF is one ending, not two empty rows.
                    if (ch == '\r' && body.getOrNull(index + 1) == '\n') index++
                    endRow()
                }
                else -> cell.append(ch)
            }
            index++
        }
        if (cell.isNotEmpty() || row.isNotEmpty()) endRow()
        return rows
    }

    /**
     * Makes header matching forgiving.
     *
     * "Bar Code", "barcode" and "BARCODE" are the same column, and a customer
     * should not have to discover which one this app wanted.
     */
    fun normaliseHeader(raw: String): String =
        // Letters and digits in ANY script. Restricting this to a-z threw away
        // every character of a Chinese header, so 条码 and 品名 both normalised
        // to the empty string and collided -- an import from a Chinese
        // spreadsheet found no columns at all.
        raw.trim().lowercase().replace(Regex("""[^\p{L}\p{N}]"""), "")

    // ------------------------------------------------------- known columns

    val BARCODE = arrayOf("barcode", "bar code", "ean", "upc", "code", "item code", "条码")
    val NAME = arrayOf("name", "product", "product name", "description", "item", "品名", "名称")
    val SKU = arrayOf("sku", "item code", "code", "part no", "ref", "货号")
    val UNIT = arrayOf("unit", "uom", "单位")
    val EXPECTED = arrayOf(
        "expected", "expected qty", "expected quantity", "system qty", "system quantity",
        "on hand", "onhand", "stock", "qty", "quantity", "应盘", "系统数量",
    )
}
