package com.stockcheck.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which codes reach one product.
 *
 * The same thing on a shelf wears several barcodes — new packaging, a second
 * supplier, a carton numbered differently from the tin inside it. When one of
 * them fails to resolve, that scan becomes a new unknown product and the count
 * reports one stock item twice under two names, with no sign anything is wrong.
 */
class ProductBarcodeTest {

    private fun product(id: String, vararg alts: String) =
        Product(barcode = id, name = "Milo 1kg", altBarcodes = alts.toList())

    @Test
    fun `the document id is one of the codes`() {
        assertTrue(product("955").answersTo("955"))
    }

    @Test
    fun `so is every alternate`() {
        val milo = product("955", "9556", "9557")
        assertTrue(milo.answersTo("9556"))
        assertTrue(milo.answersTo("9557"))
    }

    @Test
    fun `a code it has never heard of is not its`() {
        assertFalse(product("955", "9556").answersTo("123"))
    }

    @Test
    fun `whitespace around a scan does not lose the match`() {
        // A scanner can hand back trailing whitespace, and a person typing
        // one in adds a space more often than not.
        assertTrue(product("955", "9556").answersTo(" 9556 "))
    }

    @Test
    fun `case does not lose the match`() {
        // Alphanumeric codes exist, and which case a keyboard produces is not
        // something the person scanning chose.
        assertTrue(product("AB12").answersTo("ab12"))
    }

    @Test
    fun `an empty scan matches nothing`() {
        // Otherwise a failed read would resolve to whichever product was
        // looked at first.
        assertFalse(product("955", "9556").answersTo(""))
        assertFalse(product("955", "9556").answersTo("   "))
    }

    @Test
    fun `lists the id first, then the alternates`() {
        assertEquals(listOf("955", "9556", "9557"), product("955", "9556", "9557").allBarcodes)
    }

    @Test
    fun `does not list a code twice`() {
        // Storing the id in the list as well would send its own scans down
        // the slow path for nothing.
        assertEquals(listOf("955", "9556"), product("955", "955", "9556").allBarcodes)
    }

    @Test
    fun `drops blanks rather than matching on them`() {
        val milo = product("955", "", "  ")
        assertEquals(listOf("955"), milo.allBarcodes)
    }

    @Test
    fun `a product with no alternates behaves as it always did`() {
        // Every product already in a customer's database has no such field.
        val old = Product(barcode = "955", name = "Milo 1kg")
        assertEquals(listOf("955"), old.allBarcodes)
        assertTrue(old.answersTo("955"))
    }
}
