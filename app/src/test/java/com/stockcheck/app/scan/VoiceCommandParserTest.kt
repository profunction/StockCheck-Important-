package com.stockcheck.app.scan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The voice grammar is the one piece of this app that guesses.
 *
 * Everything else records what someone typed or what a camera read; this turns
 * an ambiguous sound into a number that ends up in a stock record. A wrong
 * guess here is a wrong count that looks exactly like a right one, so the
 * cases below are mostly about where it must refuse rather than where it
 * succeeds.
 */
class VoiceCommandParserTest {

    private fun parse(text: String) = VoiceCommandParser.parse(text)

    private fun count(text: String): VoiceCommand.Count =
        parse(text) as? VoiceCommand.Count
            ?: error("Expected a Count for \"$text\", got ${parse(text)}")

    // ------------------------------------------------------------- English

    @Test
    fun `digits with a product name are read as a count`() {
        val result = count("coca cola 25")
        assertEquals(25, result.quantity)
        assertEquals("coca cola", result.productName)
    }

    @Test
    fun `english number words are read as a count`() {
        assertEquals(25, count("coca cola twenty five").quantity)
        assertEquals(30, count("cola thirty").quantity)
        assertEquals(120, count("cola one hundred and twenty").quantity)
        assertEquals(1000, count("cola one thousand").quantity)
    }

    @Test
    fun `a word after the number ends it`() {
        // "twenty five boxes of cola" must not let "cola" extend the number.
        val result = count("twenty five boxes of cola")
        assertEquals(25, result.quantity)
        assertEquals("box", result.unit)
        assertEquals("cola", result.productName)
    }

    @Test
    fun `units map to their short form`() {
        assertEquals("ctn", count("cola 4 cartons").unit)
        assertEquals("btl", count("cola 4 bottles").unit)
        assertEquals("kg", count("rice 4 kg").unit)
    }

    // ------------------------------------------------------------- Chinese

    @Test
    fun `chinese numerals are read as a count`() {
        assertEquals(25, count("可乐 二十五").quantity)
        assertEquals(10, count("可乐 十箱").quantity)
        assertEquals(120, count("可乐 一百二十").quantity)
        assertEquals(200, count("可乐 两百").quantity)
    }

    @Test
    fun `chinese units map to their short form`() {
        assertEquals("ctn", count("可乐 三箱").unit)
        assertEquals("btl", count("可乐 三瓶").unit)
    }

    @Test
    fun `gong jin is kilograms not catties`() {
        // 公斤 contains 斤. Matching the shorter key first would record catties.
        assertEquals("kg", count("米 五公斤").unit)
        assertEquals("catty", count("米 五斤").unit)
    }

    // -------------------------------------------------------------- markers

    @Test
    fun `an explicit quantity marker wins over an earlier number`() {
        // The 3 is the case size; the operator stated 25.
        assertEquals(25, count("可乐 3 箱 数量 25").quantity)
    }

    // --------------------------------------------------------- bare numbers

    @Test
    fun `a bare number applies to the focused line`() {
        val result = parse("25")
        assertTrue("Expected QuantityOnly, got $result", result is VoiceCommand.QuantityOnly)
        assertEquals(25, (result as VoiceCommand.QuantityOnly).quantity)
    }

    // ------------------------------------------------------------- barcodes

    @Test
    fun `a long digit run is a barcode, not a quantity`() {
        val result = parse("9556007960072")
        assertTrue("Expected Barcode, got $result", result is VoiceCommand.Barcode)
        assertEquals("9556007960072", (result as VoiceCommand.Barcode).barcode)
    }

    @Test
    fun `a barcode spoken in groups is rejoined`() {
        val result = parse("955 600 796 0072")
        assertTrue("Expected Barcode, got $result", result is VoiceCommand.Barcode)
        assertEquals("9556007960072", (result as VoiceCommand.Barcode).barcode)
    }

    // ------------------------------------------------------------- refusals

    @Test
    fun `silence is refused rather than guessed`() {
        assertTrue(parse("") is VoiceCommand.Unrecognised)
        assertTrue(parse("   ") is VoiceCommand.Unrecognised)
    }

    @Test
    fun `speech with no number is refused`() {
        val result = parse("put that over there")
        assertTrue("Expected Unrecognised, got $result", result is VoiceCommand.Unrecognised)
    }

    @Test
    fun `the raw transcript survives so the operator can correct it`() {
        val spoken = "coca cola twenty five"
        assertEquals(spoken, count(spoken).transcript)
        assertEquals("nonsense here", (parse("nonsense here") as VoiceCommand.Unrecognised).transcript)
    }

    // --------------------------------------------------------- punctuation

    @Test
    fun `recogniser punctuation does not break parsing`() {
        val result = count("可乐，数量 25。")
        assertEquals(25, result.quantity)
        assertEquals("可乐", result.productName)
    }
}
