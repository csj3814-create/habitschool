package com.habitschool.app.health

import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import org.json.JSONArray
import org.json.JSONObject

/**
 * Health Connect 에서 읽은 수면·운동 원본. 걸음수와 함께 웹으로 간다.
 *
 * 여기서는 고르지 않는다. 어느 잠이 '어젯밤'인지, 어느 운동이 걸음수와 겹치는지는
 * 웹(js/health-connect-activity.js)이 정한다 — 그쪽에 테스트가 있다. 네이티브는
 * 읽은 것을 그대로 옮긴다.
 */
data class HealthConnectSleepSession(
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val asleepMinutes: Int,
    val awakeMinutes: Int,
    val deepMinutes: Int,
    val remMinutes: Int,
    val lightMinutes: Int,
    val hasStages: Boolean,
    val originPackage: String
)

data class HealthConnectExerciseSession(
    val typeKey: String,
    val startEpochMillis: Long,
    val endEpochMillis: Long,
    val activeKcal: Int? = null,
    val distanceMeters: Int? = null,
    val originPackage: String
)

data class HealthConnectActivitySnapshot(
    val sleepSessions: List<HealthConnectSleepSession> = emptyList(),
    val exerciseSessions: List<HealthConnectExerciseSession> = emptyList(),
    val sleepGranted: Boolean = false,
    val exerciseGranted: Boolean = false,
    val syncedAtEpochMillis: Long = 0L
) {
    fun hasAnyPermission(): Boolean = sleepGranted || exerciseGranted
}

object HealthConnectActivityCodec {
    // 주소 길이를 지킨다. 하루 운동이 이보다 많을 일은 드물다.
    const val MAX_SESSIONS = 12

    /**
     * 웹이 읽는 모양. 키 이름을 바꾸면 js/health-connect-activity.js 도 같이 바꾼다
     * (tests/health-connect-activity.test.js 가 둘을 맞춰 본다).
     */
    fun toJson(snapshot: HealthConnectActivitySnapshot): String? {
        if (!snapshot.hasAnyPermission()) return null
        val root = JSONObject()
            .put("v", 1)
            .put("syncedAt", snapshot.syncedAtEpochMillis)
            .put("sleepOk", snapshot.sleepGranted)
            .put("exerciseOk", snapshot.exerciseGranted)

        val sleep = JSONArray()
        snapshot.sleepSessions.take(MAX_SESSIONS).forEach { s ->
            sleep.put(
                JSONObject()
                    .put("start", s.startEpochMillis)
                    .put("end", s.endEpochMillis)
                    .put("asleep", s.asleepMinutes)
                    .put("awake", s.awakeMinutes)
                    .put("deep", s.deepMinutes)
                    .put("rem", s.remMinutes)
                    .put("light", s.lightMinutes)
                    .put("staged", s.hasStages)
                    .put("origin", s.originPackage)
            )
        }
        root.put("sleep", sleep)

        val exercises = JSONArray()
        snapshot.exerciseSessions.take(MAX_SESSIONS).forEach { e ->
            exercises.put(
                JSONObject()
                    .put("type", e.typeKey)
                    .put("start", e.startEpochMillis)
                    .put("end", e.endEpochMillis)
                    .apply {
                        e.activeKcal?.let { put("kcal", it) }
                        e.distanceMeters?.let { put("dist", it) }
                    }
                    .put("origin", e.originPackage)
            )
        }
        root.put("exercise", exercises)
        return root.toString()
    }

    /**
     * 수면 단계로 잔 시간을 나눈다. 깸·침대 밖·침대에서 깸은 잔 시간이 아니다.
     * 단계가 없는 기록(시작·끝만 있는 것)은 전체를 잔 시간으로 본다.
     */
    fun summarizeSleep(record: SleepSessionRecord): HealthConnectSleepSession {
        var asleep = 0L
        var awake = 0L
        var deep = 0L
        var rem = 0L
        var light = 0L
        record.stages.forEach { stage ->
            val millis = (stage.endTime.toEpochMilli() - stage.startTime.toEpochMilli()).coerceAtLeast(0L)
            when (stage.stage) {
                SleepSessionRecord.STAGE_TYPE_AWAKE,
                SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
                SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> awake += millis
                SleepSessionRecord.STAGE_TYPE_DEEP -> { deep += millis; asleep += millis }
                SleepSessionRecord.STAGE_TYPE_REM -> { rem += millis; asleep += millis }
                SleepSessionRecord.STAGE_TYPE_LIGHT -> { light += millis; asleep += millis }
                else -> asleep += millis
            }
        }
        val start = record.startTime.toEpochMilli()
        val end = record.endTime.toEpochMilli()
        val hasStages = record.stages.isNotEmpty()
        if (!hasStages) asleep = (end - start).coerceAtLeast(0L)
        return HealthConnectSleepSession(
            startEpochMillis = start,
            endEpochMillis = end,
            asleepMinutes = toMinutes(asleep),
            awakeMinutes = toMinutes(awake),
            deepMinutes = toMinutes(deep),
            remMinutes = toMinutes(rem),
            lightMinutes = toMinutes(light),
            hasStages = hasStages,
            originPackage = record.metadata.dataOrigin.packageName
        )
    }

    /**
     * 운동 종류는 숫자 대신 이름으로 보낸다. 숫자는 라이브러리 상수라 웹에서 외워
     * 두면 어긋나도 모른다. 여기 없는 종류는 "other" 로 가고 웹은 '운동'이라 부른다.
     */
    fun exerciseTypeKey(type: Int): String = EXERCISE_TYPE_KEYS[type] ?: "other"

    private fun toMinutes(millis: Long): Int = ((millis + 30_000L) / 60_000L).toInt()

    private val EXERCISE_TYPE_KEYS: Map<Int, String> = mapOf(
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING to "walking",
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING to "running",
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL to "running_treadmill",
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING to "hiking",
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING to "stair_climbing",
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE to "stair_climbing_machine",
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING to "biking",
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY to "biking_stationary",
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL to "elliptical",
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE to "rowing_machine",
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL to "swimming_pool",
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER to "swimming_open_water",
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING to "strength_training",
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING to "weightlifting",
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS to "calisthenics",
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING to "hiit",
        ExerciseSessionRecord.EXERCISE_TYPE_BOOT_CAMP to "boot_camp",
        ExerciseSessionRecord.EXERCISE_TYPE_EXERCISE_CLASS to "exercise_class",
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES to "pilates",
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA to "yoga",
        ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING to "stretching",
        ExerciseSessionRecord.EXERCISE_TYPE_DANCING to "dancing",
        ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS to "martial_arts",
        ExerciseSessionRecord.EXERCISE_TYPE_BOXING to "boxing",
        ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON to "badminton",
        ExerciseSessionRecord.EXERCISE_TYPE_TENNIS to "tennis",
        ExerciseSessionRecord.EXERCISE_TYPE_TABLE_TENNIS to "table_tennis",
        ExerciseSessionRecord.EXERCISE_TYPE_SQUASH to "squash",
        ExerciseSessionRecord.EXERCISE_TYPE_GOLF to "golf",
        ExerciseSessionRecord.EXERCISE_TYPE_SOCCER to "soccer",
        ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL to "basketball",
        ExerciseSessionRecord.EXERCISE_TYPE_VOLLEYBALL to "volleyball",
        ExerciseSessionRecord.EXERCISE_TYPE_BASEBALL to "baseball",
        ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING to "rock_climbing",
        ExerciseSessionRecord.EXERCISE_TYPE_SKIING to "skiing",
        ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING to "snowboarding",
        ExerciseSessionRecord.EXERCISE_TYPE_SKATING to "skating",
        ExerciseSessionRecord.EXERCISE_TYPE_GUIDED_BREATHING to "guided_breathing",
        ExerciseSessionRecord.EXERCISE_TYPE_WHEELCHAIR to "wheelchair",
        ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT to "other"
    )
}
