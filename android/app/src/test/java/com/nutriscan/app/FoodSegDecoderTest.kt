package com.nutriscan.app

import org.junit.Assert.*
import org.junit.Test

class FoodSegDecoderTest {
    @Test fun masksAndNmsRespectInstances() {
        val rows = Array(7) { FloatArray(3) }
        rows[0] = floatArrayOf(2f,2f,2f); rows[1] = floatArrayOf(2f,2f,2f)
        rows[2] = floatArrayOf(4f,4f,4f); rows[3] = floatArrayOf(4f,4f,4f)
        rows[4] = floatArrayOf(.9f,.8f,.1f); rows[5] = floatArrayOf(.1f,.1f,.85f)
        rows[6] = floatArrayOf(1f,1f,1f)
        val proto = arrayOf(arrayOf(floatArrayOf(1f,-1f),floatArrayOf(1f,1f)))
        val detections = FoodSegDecoder.decode(rows,proto,2,4,4,4,20,.25f)
        assertEquals(2,detections.size) // same-class duplicate suppressed, distinct class retained
        assertEquals(0,detections[0].classIndex)
        assertEquals(.75,detections[0].areaFraction,0.0001)
        assertArrayEquals(intArrayOf(0,1,1,2),detections[0].maskRle)
    }
    @Test fun paddingIsExcludedFromArea() {
        val rows = Array(6) { floatArrayOf(1f) }
        rows[0][0]=2f; rows[1][0]=2f; rows[2][0]=4f; rows[3][0]=4f; rows[4][0]=.9f
        val proto = arrayOf(Array(4) { FloatArray(4) { 1f } })
        val d = FoodSegDecoder.decode(rows,proto,1,4,4,2,20,.25f).single()
        assertEquals(1.0,d.areaFraction,0.0001)
        assertArrayEquals(floatArrayOf(0f,0f,1f,1f),d.box,0.0001f)
    }
    @Test fun emptyMasksAndLowScoresAreNotFoods() {
        val rows = Array(6) { floatArrayOf(1f) }
        rows[0][0]=2f; rows[1][0]=2f; rows[2][0]=4f; rows[3][0]=4f; rows[4][0]=.9f
        val proto = arrayOf(Array(4) { FloatArray(4) { -1f } })
        assertTrue(FoodSegDecoder.decode(rows,proto,1,4,4,4,20,.25f).isEmpty())
        rows[4][0]=.1f
        assertTrue(FoodSegDecoder.decode(rows,proto,1,4,4,4,20,.25f).isEmpty())
    }
}
