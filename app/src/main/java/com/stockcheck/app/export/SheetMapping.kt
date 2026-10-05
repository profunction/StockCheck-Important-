package com.stockcheck.app.export

import com.stockcheck.app.model.Quantity
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.temporal.ChronoField
import java.util.Locale

/**
 * Which column of somebody's spreadsheet is which.
 *
 * Every till system exports its own layout -- "Item code" here, "SKU" there,
 * 数量 in one shop and "Kuantiti" in the next -- and a customer asked to
 * rename their columns to suit an app is a customer lost. So the columns are
 * guessed, from the header first and the values second, and the guess is
 * shown for the person to correct with a tap before anything is written.
 *
 * Pure: no Android, no database, so the guessing is tested directly.
 */
object SheetMapping {

    enum class Role {
        BARCODE,
        SKU,
        NAME,
        UNIT,
        /** How many: sold, received, counted. */
        QUANTITY,
        /** What the customer's own system says should be there, on a count sheet. */
        EXPECTED,
        DATE,
        EXPIRY,
    }

    /** Header words for each role, compared after [CsvReader.normaliseHeader]. */
    private val WORDS: Map<Role, List<String>> = mapOf(
        Role.BARCODE to listOf(
            "barcode", "barcodes", "ean", "ean13", "upc", "gtin", "itembarcode", "productbarcode",
            "条码", "条形码", "商品条码", "kodbar",
        ),
        Role.SKU to listOf(
            "sku", "itemcode", "productcode", "stockcode", "itemno", "code", "partno", "ref",
            "reference", "货号", "编号", "商品编码", "编码", "kod", "kodproduk", "koditem",
        ),
        Role.NAME to listOf(
            "name", "itemname", "productname", "product", "item", "description", "itemdescription",
            "stockdescription", "desc", "品名", "名称", "商品", "商品名称", "产品", "nama",
            "namaproduk", "namabarang", "barang", "produk",
        ),
        Role.UNIT to listOf("unit", "uom", "units", "单位", "unitukuran"),
        Role.QUANTITY to listOf(
            "qty", "quantity", "qtysold", "quantitysold", "soldqty", "itemssold", "sold", "salesqty",
            "qtyreceived", "received", "receivedqty", "count", "counted", "数量", "销量",
            "销售数量", "进货数量", "实盘", "kuantiti", "kuantitijualan", "bilangan",
        ),
        Role.EXPECTED to listOf(
            "expected", "expectedqty", "expectedquantity", "systemqty", "systemquantity", "onhand",
            "qtyonhand", "instock", "stock", "stockqty", "balance", "qty", "quantity", "应盘",
            "系统数量", "库存", "账面数量", "数量", "kuantiti", "bakistok", "stokdijangka",
        ),
        Role.DATE to listOf(
            "date", "datetime", "day", "time", "receiptdate", "salesdate", "transactiondate",
            "createdat", "created", "日期", "时间", "销售日期", "tarikh", "masa", "tarikhjualan",
        ),
        Role.EXPIRY to listOf(
            "expiry", "expires", "expirydate", "expiration", "expirationdate", "bestbefore",
            "bbdate", "exp", "expdate", "useby", "有效期", "到期日", "保质期", "tarikhluput",
        ),
    )

    /**
     * Headers that look like a quantity but are money or something else.
     * "Gross sales" in a till export is ringgit, and importing ringgit as
     * units is the most expensive mistake this screen could make.
     */
    private val NOT_QUANTITY = listOf(
        "price", "amount", "total", "rm", "cost", "sales", "discount", "tax", "profit", "margin",
        "value", "money", "harga", "jumlah", "金额", "价格", "总额", "单价",
    )

    data class Guess(
        /** Role -> column index, only for roles that were found. */
        val columns: Map<Role, Int>,
    )

    /**
     * Picks a column for each of [wanted], at most one role per column.
     *
     * Header words decide where they can; a role no header claims is then
     * looked for in the values -- a column of 13-digit numbers is a barcode
     * whatever it is called.
     */
    fun guess(headers: List<String>, sample: List<List<String>>, wanted: List<Role>): Guess {
        val keys = headers.map { CsvReader.normaliseHeader(it) }
        val taken = mutableSetOf<Int>()
        val result = mutableMapOf<Role, Int>()

        // Strongest claims first, so "Barcode" is not lost to SKU's "code".
        val claims = wanted.flatMap { role ->
            keys.mapIndexedNotNull { index, key ->
                score(role, key).takeIf { it > 0 }?.let { Triple(role, index, it) }
            }
        }.sortedByDescending { it.third }

        for ((role, index, _) in claims) {
            if (role in result || index in taken) continue
            result[role] = index
            taken += index
        }

        for (role in wanted) {
            if (role in result) continue
            val index = headers.indices
                .filter { it !in taken }
                .firstOrNull { column -> looksLike(role, sample.map { it.getOrNull(column).orEmpty() }) }
                ?: continue
            result[role] = index
            taken += index
        }
        return Guess(result)
    }

    /**
     * Which row is the header.
     *
     * Not always the first: a till's report usually opens with its own title
     * and a date range, then the column names. The header is the row in the
     * first twenty that the most column names recognise; with none
     * recognised, the first row that has something in it.
     */
    fun findHeader(cells: List<List<String>>): Int? {
        val candidates = cells.withIndex().take(20).filter { (_, row) -> row.count { it.isNotBlank() } >= 2 }
        val best = candidates.maxByOrNull { (index, row) ->
            val recognised = row.count { cell ->
                val key = CsvReader.normaliseHeader(cell)
                Role.entries.any { score(it, key) > 0 }
            }
            // Ties go to the earlier row.
            recognised * 100 - index
        }
        return best?.index ?: cells.indexOfFirst { row -> row.any { it.isNotBlank() } }.takeIf { it >= 0 }
    }

    private fun score(role: Role, key: String): Int {
        if (key.isEmpty()) return 0
        val saysQuantity = key.contains("qty") || key.contains("quantity") ||
            key.contains("数量") || key.contains("kuantiti")
        val isAmount = role == Role.QUANTITY || role == Role.EXPECTED
        if (isAmount && !saysQuantity && NOT_QUANTITY.any { key.contains(it) }) return 0
        // "Unit price" and "Unit cost" are money, not a unit.
        if (role == Role.UNIT && NOT_QUANTITY.any { key.contains(it) }) return 0
        val words = WORDS.getValue(role)
        return when {
            key in words -> 3
            words.any { it.length >= 3 && key.contains(it) } -> 2
            else -> 0
        }
    }

    private fun looksLike(role: Role, values: List<String>): Boolean {
        val filled = values.map { it.trim() }.filter { it.isNotEmpty() }
        if (filled.size < 2) return false
        fun share(test: (String) -> Boolean) = filled.count(test).toDouble() / filled.size
        return when (role) {
            Role.BARCODE -> share { it.matches(Regex("""\d{8,14}""")) } >= 0.8
            Role.QUANTITY, Role.EXPECTED -> share { parseQuantity(it) != null && it.length <= 9 } >= 0.9
            Role.DATE -> share { parseDate(it) != null } >= 0.8
            else -> false
        }
    }

    // ---------------------------------------------------------------- values

    private val THOUSANDS = Regex("""(?<=\d),(?=\d{3}(?!\d))""")

    /**
     * A quantity in thousandths, or null when it is not one.
     *
     * "1,200" is a thousand two hundred and "1,5" is one and a half -- a comma
     * is a thousands separator only where it groups exactly three digits.
     * "(3)" is how accounting exports write minus three.
     */
    fun parseQuantity(raw: String): Long? {
        var text = raw.trim().replace(" ", "")
        if (text.isEmpty()) return null
        var negative = false
        if (text.startsWith("(") && text.endsWith(")")) {
            negative = true
            text = text.substring(1, text.length - 1)
        }
        val value = Quantity.parse(text.replace(THOUSANDS, "")) ?: return null
        return if (negative) -value else value
    }

    /** A date and, where the cell has one, a time of day. */
    data class When(val date: LocalDate, val time: LocalTime?)

    // English month names whatever the phone's language: a till export says
    // "Oct" on a Chinese phone too.
    private fun formatter(pattern: String): DateTimeFormatter =
        DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern(pattern).toFormatter(Locale.ENGLISH)

    private val DATE_TIMES = listOf(
        "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm",
        "d/M/yyyy HH:mm:ss", "d/M/yyyy HH:mm", "d/M/yyyy h:mm a", "d-M-yyyy HH:mm",
        "yyyy/M/d HH:mm:ss", "yyyy/M/d HH:mm", "d MMM yyyy HH:mm", "MMM d, yyyy h:mm a",
    ).map(::formatter)

    private val DATES = listOf(
        "yyyy-M-d", "d/M/yyyy", "d-M-yyyy", "d.M.yyyy", "yyyy/M/d", "d/M/yy",
        "d MMM yyyy", "d-MMM-yyyy", "MMM d, yyyy", "yyyyMMdd",
    ).map(::formatter)

    /**
     * Reads a date the way this country writes one: day before month, so
     * 03/04/2026 is the third of April. A Excel serial number -- what an
     * .xlsx date cell holds underneath -- is read as one too.
     */
    fun parseDate(raw: String): When? {
        val text = raw.trim().removeSuffix("Z").replace(Regex("""\.\d+$"""), "")
        if (text.isEmpty()) return null

        text.toDoubleOrNull()?.let { serial ->
            // 1950 to 2119: anything else is a number, not a date.
            if (serial in 18_264.0..80_000.0) {
                val days = serial.toLong()
                val seconds = ((serial - days) * 86_400).toLong()
                val date = LocalDate.of(1899, 12, 30).plusDays(days)
                return When(date, if (seconds > 0) LocalTime.ofSecondOfDay(seconds) else null)
            }
            if (text.length != 8) return null
        }

        for (format in DATE_TIMES) {
            runCatching { LocalDateTime.parse(text, format) }.getOrNull()?.let {
                return When(it.toLocalDate(), it.toLocalTime())
            }
        }
        for (format in DATES) {
            runCatching { LocalDate.parse(text, format) }.getOrNull()?.let {
                return When(normaliseYear(it), null)
            }
        }
        // Month before day, only when the day-first reading is impossible:
        // 04/23/2026 can only be the twenty-third of April.
        Regex("""(\d{1,2})/(\d{1,2})/(\d{4})""").matchEntire(text)?.let { match ->
            val (month, day, year) = match.destructured
            return runCatching { When(LocalDate.of(year.toInt(), month.toInt(), day.toInt()), null) }.getOrNull()
        }
        return null
    }

    /** "1/2/26" parsed as the year 26 is the year 2026. */
    private fun normaliseYear(date: LocalDate): LocalDate =
        if (date.get(ChronoField.YEAR) < 100) date.plusYears(2000) else date
}
