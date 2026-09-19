package com.stockcheck.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QuantityTest {

    @Test
    fun `reads whole numbers`() {
        assertEquals(24_000L, Quantity.parse("24"))
        assertEquals(0L, Quantity.parse("0"))
    }

    @Test
    fun `reads decimals`() {
        assertEquals(500L, Quantity.parse("0.5"))
        assertEquals(1_250L, Quantity.parse("1.25"))
        assertEquals(100_999L, Quantity.parse("100.999"))
    }

    @Test
    fun `a leading point is a decimal`() {
        // What somebody types when the scale reads .5 and they copy it across.
        assertEquals(500L, Quantity.parse(".5"))
    }

    @Test
    fun `a comma is a decimal point`() {
        // Half of Malaysia writes it this way, and which one the keyboard
        // offers depends on the phone's locale rather than on the person.
        assertEquals(1_500L, Quantity.parse("1,5"))
    }

    @Test
    fun `the last decimal place is thousandths, not whatever was typed`() {
        // "5" after the point is five hundred thousandths. Parsing the
        // fraction as a number and using it directly would make this 5, which
        // is out by a factor of a hundred and looks plausible on screen.
        assertEquals(500L, Quantity.parse("0.5"))
        assertEquals(50L, Quantity.parse("0.05"))
        assertEquals(5L, Quantity.parse("0.005"))
    }

    @Test
    fun `refuses more precision than it can hold`() {
        // Rounding 0.3333 to 0.333 silently would make three of them fail to
        // add up to one, with nothing on screen to explain why.
        assertNull(Quantity.parse("1.2345"))
    }

    @Test
    fun `refuses what is not a number`() {
        assertNull(Quantity.parse(""))
        assertNull(Quantity.parse("abc"))
        assertNull(Quantity.parse("."))
        assertNull(Quantity.parse("-"))
        assertNull(Quantity.parse("1.2.3"))
        assertNull(Quantity.parse("12 kg"))
    }

    @Test
    fun `reads negatives, which a variance needs`() {
        assertEquals(-3_000L, Quantity.parse("-3"))
        assertEquals(-500L, Quantity.parse("-0.5"))
    }

    @Test
    fun `shows no more decimals than the value needs`() {
        // A shop counting tins must never be shown "24.000".
        assertEquals("24", Quantity.format(24_000L))
        assertEquals("0", Quantity.format(0L))
        assertEquals("0.5", Quantity.format(500L))
        assertEquals("1.25", Quantity.format(1_250L))
        assertEquals("0.01", Quantity.format(10L))
        assertEquals("0.001", Quantity.format(1L))
        assertEquals("100.999", Quantity.format(100_999L))
    }

    @Test
    fun `shows negatives with the sign in front`() {
        assertEquals("-3", Quantity.format(-3_000L))
        assertEquals("-0.5", Quantity.format(-500L))
    }

    @Test
    fun `survives a round trip`() {
        listOf("24", "0.5", "1.25", "0.001", "100.999", "0").forEach { typed ->
            assertEquals(typed, Quantity.format(Quantity.parse(typed)!!))
        }
    }

    @Test
    fun `adds exactly, which is the whole point`() {
        // 0.1 + 0.2 + 0.3 as Doubles is 0.30000000000000004 short of 0.6, and
        // a count of three weighed trays reporting a variance that small
        // against a sheet saying 0.6 is a count nobody trusts again.
        val total = Quantity.parse("0.1")!! + Quantity.parse("0.2")!! + Quantity.parse("0.3")!!
        assertEquals("0.6", Quantity.format(total))
        assertEquals(600L, total)
    }

    @Test
    fun `of counts whole units`() {
        assertEquals(24_000L, Quantity.of(24))
        assertEquals(0L, Quantity.of(0))
    }

    @Test
    fun `rounds to whole units for the legacy field`() {
        assertEquals(24, Quantity.toWholeUnits(24_000L))
        assertEquals(1, Quantity.toWholeUnits(500L))
        assertEquals(0, Quantity.toWholeUnits(499L))
        assertEquals(2, Quantity.toWholeUnits(1_500L))
        assertEquals(1, Quantity.toWholeUnits(1_499L))
    }

    @Test
    fun `rounds negatives without jumping the wrong way`() {
        // floorDiv, not integer division: -501 / 1000 truncates towards zero
        // and would round a half-kilo shortfall up to nothing.
        assertEquals(0, Quantity.toWholeUnits(-500L))
        assertEquals(-1, Quantity.toWholeUnits(-501L))
    }
}
