package com.habitschool.app.health

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * 운동 한 번의 동선·심박·페이스를 웹으로 보낼 작은 숫자 배열로 줄인다 (1.0.16, 2026-11-27).
 *
 * 동선은 위도·경도를 보내지 않는다. 시작점 기준 미터로 편 뒤, 긴 쪽이 1000 이 되게 비율만
 * 남긴다 — 지도와 합치지 않으니 어디를 달렸는지는 알 수 없고 모양만 남는다(대표 결정).
 * 웹(js/health-connect-activity.js sanitizeExercise)이 같은 모양을 읽는다.
 */
object WorkoutDetailCodec {
    const val SHAPE_SIZE = 1000
    const val MAX_ROUTE_POINTS = 150
    const val MAX_SERIES = 120
    private const val METERS_PER_DEGREE_LAT = 110_540.0
    private const val METERS_PER_DEGREE_LNG = 111_320.0

    /** [위도, 경도] 목록 → [x, y, x, y, …] (0~1000, 북쪽이 위). 점이 모자라면 빈 배열. */
    fun shapeRoute(points: List<Pair<Double, Double>>): IntArray {
        val valid = points.filter { (lat, lng) -> lat in -90.0..90.0 && lng in -180.0..180.0 }
        if (valid.size < 2) return IntArray(0)
        val (lat0, lng0) = valid.first()
        val cosLat = cos(Math.toRadians(lat0))
        val meters = valid.map { (lat, lng) ->
            doubleArrayOf((lng - lng0) * METERS_PER_DEGREE_LNG * cosLat, -(lat - lat0) * METERS_PER_DEGREE_LAT)
        }
        val minX = meters.minOf { it[0] }
        val maxX = meters.maxOf { it[0] }
        val minY = meters.minOf { it[1] }
        val maxY = meters.maxOf { it[1] }
        val span = max(maxX - minX, maxY - minY)
        if (span < 50.0) return IntArray(0) // 50m 안에서 맴돈 것(러닝머신 등)은 모양이 없다
        val scaled = meters.map { doubleArrayOf((it[0] - minX) / span * SHAPE_SIZE, (it[1] - minY) / span * SHAPE_SIZE) }
        val simplified = simplify(scaled, MAX_ROUTE_POINTS)
        val out = IntArray(simplified.size * 2)
        simplified.forEachIndexed { i, p ->
            out[i * 2] = p[0].roundToInt().coerceIn(0, SHAPE_SIZE)
            out[i * 2 + 1] = p[1].roundToInt().coerceIn(0, SHAPE_SIZE)
        }
        return out
    }

    /** Douglas-Peucker. 점이 maxPoints 이하가 될 때까지 허용 오차를 키운다. */
    private fun simplify(points: List<DoubleArray>, maxPoints: Int): List<DoubleArray> {
        if (points.size <= maxPoints) return points
        var epsilon = 1.0
        var result = points
        while (result.size > maxPoints && epsilon < SHAPE_SIZE) {
            result = douglasPeucker(points, epsilon)
            epsilon *= 1.5
        }
        return result
    }

    private fun douglasPeucker(points: List<DoubleArray>, epsilon: Double): List<DoubleArray> {
        if (points.size < 3) return points
        val keep = BooleanArray(points.size)
        keep[0] = true
        keep[points.size - 1] = true
        val stack = ArrayDeque<IntArray>()
        stack.addLast(intArrayOf(0, points.size - 1))
        while (stack.isNotEmpty()) {
            val (from, to) = stack.removeLast().let { it[0] to it[1] }
            var maxDist = 0.0
            var index = -1
            for (i in from + 1 until to) {
                val d = distanceToSegment(points[i], points[from], points[to])
                if (d > maxDist) { maxDist = d; index = i }
            }
            if (index >= 0 && maxDist > epsilon) {
                keep[index] = true
                stack.addLast(intArrayOf(from, index))
                stack.addLast(intArrayOf(index, to))
            }
        }
        return points.filterIndexed { i, _ -> keep[i] }
    }

    private fun distanceToSegment(p: DoubleArray, a: DoubleArray, b: DoubleArray): Double {
        val dx = b[0] - a[0]
        val dy = b[1] - a[1]
        val lengthSq = dx * dx + dy * dy
        if (lengthSq == 0.0) return abs(p[0] - a[0]) + abs(p[1] - a[1])
        val t = (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq).coerceIn(0.0, 1.0)
        val x = a[0] + t * dx - p[0]
        val y = a[1] + t * dy - p[1]
        return kotlin.math.sqrt(x * x + y * y)
    }

    /**
     * (시각, 값) 표본을 운동 시간을 같은 칸으로 나눈 평균으로 줄인다. 1분 칸, 운동이 길면
     * 칸을 넓혀 maxBuckets 를 넘지 않게. 표본이 없는 칸은 0(웹이 빈칸으로 그린다).
     */
    fun bucketAverage(samples: List<Pair<Long, Double>>, startMillis: Long, endMillis: Long, maxBuckets: Int = MAX_SERIES): DoubleArray {
        val span = endMillis - startMillis
        if (span <= 0 || samples.isEmpty()) return DoubleArray(0)
        val minutes = max(1L, span / 60_000L)
        val buckets = minOf(minutes, maxBuckets.toLong()).toInt()
        val width = span.toDouble() / buckets
        val sums = DoubleArray(buckets)
        val counts = IntArray(buckets)
        samples.forEach { (time, value) ->
            if (time < startMillis || time > endMillis || !value.isFinite()) return@forEach
            val i = ((time - startMillis) / width).toInt().coerceIn(0, buckets - 1)
            sums[i] += value
            counts[i] += 1
        }
        if (counts.all { it == 0 }) return DoubleArray(0)
        return DoubleArray(buckets) { if (counts[it] > 0) sums[it] / counts[it] else 0.0 }
    }

    /** 분당 심박 칸 → 정수 (30~230 밖은 0). */
    fun heartRateSeries(samples: List<Pair<Long, Double>>, startMillis: Long, endMillis: Long): IntArray =
        bucketAverage(samples, startMillis, endMillis)
            .map { bpm -> bpm.roundToInt().takeIf { it in 30..230 } ?: 0 }
            .toIntArray()
            .takeIf { series -> series.any { it > 0 } } ?: IntArray(0)

    /** 속도(m/s) 칸 → 1km 페이스(초). 거의 멈춘 칸(0.5 m/s 미만)은 0. */
    fun paceSeries(samples: List<Pair<Long, Double>>, startMillis: Long, endMillis: Long): IntArray =
        bucketAverage(samples, startMillis, endMillis)
            .map { mps -> if (mps >= 0.5) (1000.0 / mps).roundToInt().coerceAtMost(1800) else 0 }
            .toIntArray()
            .takeIf { series -> series.any { it > 0 } } ?: IntArray(0)
}
