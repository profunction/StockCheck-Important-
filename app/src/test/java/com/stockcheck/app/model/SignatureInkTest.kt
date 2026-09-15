package com.stockcheck.app.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A signature is stored as text and redrawn from it.
 *
 * If the round trip is lossy the record still looks signed — there is a value
 * in the field and a timestamp beside it — while the mark shown back to whoever
 * checks it is not the one that was made. That is the failure worth testing
 * for, so most of these are about what survives.
 */
class SignatureInkTest {

    private fun stroke(vararg points: Pair<Float, Float>) =
        points.map { InkPoint(it.first, it.second) }

    @Test
    fun `a stroke survives the round trip`() {
        val original = listOf(stroke(0f to 0f, 0.5f to 0.25f, 1f to 1f))
        val decoded = SignatureInk.decode(SignatureInk.encode(original))

        assertEquals(1, decoded.size)
        assertEquals(3, decoded[0].size)
        assertEquals(0.5f, decoded[0][1].x, 0.001f)
        assertEquals(0.25f, decoded[0][1].y, 0.001f)
    }

    @Test
    fun `several strokes stay separate`() {
        // A signature is usually two or three strokes. Merging them into one
        // draws a line from where the finger lifted to where it came down.
        val original = listOf(
            stroke(0f to 0f, 0.2f to 0.2f),
            stroke(0.8f to 0.1f, 0.9f to 0.6f),
        )
        val decoded = SignatureInk.decode(SignatureInk.encode(original))
        assertEquals(2, decoded.size)
        assertEquals(0.8f, decoded[1][0].x, 0.002f)
    }

    @Test
    fun `an empty signature encodes to nothing and decodes back to nothing`() {
        assertEquals("", SignatureInk.encode(emptyList()))
        assertEquals(emptyList<List<InkPoint>>(), SignatureInk.decode(""))
        assertEquals(emptyList<List<InkPoint>>(), SignatureInk.decode("   "))
    }

    @Test
    fun `coordinates outside the pad are clamped rather than stored`() {
        // A drag can report a position past the edge of the canvas; storing it
        // would redraw the signature outside its own box.
        val decoded = SignatureInk.decode(
            SignatureInk.encode(listOf(stroke(-0.5f to 2f, 0.5f to 0.5f))),
        )
        assertEquals(0f, decoded[0][0].x, 0.001f)
        assertEquals(1f, decoded[0][0].y, 0.001f)
    }

    @Test
    fun `corrupt text is ignored instead of crashing the screen`() {
        // Whatever is in the field arrived from a database, and the screen that
        // draws it must not be the thing that fails.
        assertEquals(emptyList<List<InkPoint>>(), SignatureInk.decode("not ink at all"))
        assertEquals(emptyList<List<InkPoint>>(), SignatureInk.decode(";;;"))
        assertEquals(1, SignatureInk.decode("10,10 nonsense 20,20").size)
    }

    // ------------------------------------------------------------- signed-ness

    @Test
    fun `a stray tap does not count as a signature`() {
        assertFalse(SignatureInk.isSigned(""))
        assertFalse(SignatureInk.isSigned(SignatureInk.encode(listOf(stroke(0.1f to 0.1f)))))
    }

    @Test
    fun `an actual signature counts as signed`() {
        val signature = listOf(
            stroke(0f to 0.5f, 0.2f to 0.1f, 0.4f to 0.8f, 0.6f to 0.2f, 0.9f to 0.5f),
        )
        assertTrue(SignatureInk.isSigned(SignatureInk.encode(signature)))
    }

    // -------------------------------------------------------------- thinning

    @Test
    fun `thinning drops points that sit on top of each other`() {
        // Sixty points a second, most of them a hair apart.
        val dense = (0..60).map { InkPoint(0.5f + it * 0.0001f, 0.5f) }
        val thinned = SignatureInk.thin(dense)
        assertTrue("Thinning did nothing: ${thinned.size}", thinned.size < dense.size)
    }

    @Test
    fun `thinning keeps the shape`() {
        val shape = (0..40).map { InkPoint(it / 40f, it / 40f) }
        val thinned = SignatureInk.thin(shape)
        assertEquals(shape.first(), thinned.first())
        // Where the finger lifted is part of the mark.
        assertEquals(shape.last(), thinned.last())
    }

    @Test
    fun `a short stroke is left alone`() {
        val short = stroke(0f to 0f, 1f to 1f)
        assertEquals(short, SignatureInk.thin(short))
    }

    // ------------------------------------------------------------- ink keys

    @Test
    fun `the ink key cannot collide with a template field key`() {
        // Field keys come from template editing and cannot contain '#', which
        // is what keeps the strokes from ever becoming an export column.
        val key = SignatureInk.inkKeyFor("signature")
        assertTrue(SignatureInk.isInkKey(key))
        assertFalse(SignatureInk.isInkKey("signature"))
        assertTrue(key.contains("#"))
    }
}
