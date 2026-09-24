package com.habitschool.app.health

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlin.reflect.KClass

enum class HealthConnectAvailabilityState {
    AVAILABLE,
    UPDATE_REQUIRED,
    UNAVAILABLE
}

data class HealthConnectSnapshot(
    val stepsCount: Long? = null,
    val allOriginsStepsCount: Long? = null,
    val syncedAtEpochMillis: Long = 0L,
    val availabilityState: HealthConnectAvailabilityState = HealthConnectAvailabilityState.UNAVAILABLE,
    val permissionGranted: Boolean = false,
    val dataOriginPackageName: String? = null,
    val dataOriginLabel: String? = null
)

/**
 * Health Connect 에서 읽은 가장 최근 체성분.
 *
 * Health Connect 의 신체 측정 기록은 체중·체지방률·기초대사량·제지방량·골량·체수분·키
 * 일곱 가지뿐이다. **골격근량과 내장지방은 규격에 없다.** 제지방량은 뼈·장기·체수분을
 * 포함한 다른 값이라 골격근량 대신 쓰지 않는다 — 웹도 그 칸을 비워 둔다.
 */
data class HealthConnectBodySnapshot(
    val weightKg: Double? = null,
    val bodyFatPercent: Double? = null,
    val basalKcalPerDay: Double? = null,
    val leanMassKg: Double? = null,
    val measuredAtEpochMillis: Long? = null,
    val originPackage: String? = null
) {
    fun hasAnyValue(): Boolean =
        weightKg != null || bodyFatPercent != null || basalKcalPerDay != null || leanMassKg != null
}

class HealthConnectManager(private val context: Context) {
    fun getAvailability(): HealthConnectAvailabilityState =
        when (HealthConnectClient.getSdkStatus(context, PROVIDER_PACKAGE_NAME)) {
            HealthConnectClient.SDK_AVAILABLE -> HealthConnectAvailabilityState.AVAILABLE
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HealthConnectAvailabilityState.UPDATE_REQUIRED
            else -> HealthConnectAvailabilityState.UNAVAILABLE
        }

    fun buildProviderInstallIntent(): Intent? {
        if (getAvailability() != HealthConnectAvailabilityState.UPDATE_REQUIRED) return null
        val uriString = "market://details?id=$PROVIDER_PACKAGE_NAME&url=healthconnect%3A%2F%2Fonboarding"
        return Intent(Intent.ACTION_VIEW).apply {
            setPackage("com.android.vending")
            data = Uri.parse(uriString)
            putExtra("overlay", true)
            putExtra("callerId", context.packageName)
        }
    }

    suspend fun hasRequiredPermissions(): Boolean {
        val client = getClientOrNull() ?: return false
        return client.permissionController.getGrantedPermissions().containsAll(requiredPermissions)
    }

    suspend fun hasAnyBodyPermission(): Boolean {
        val client = getClientOrNull() ?: return false
        return client.permissionController.getGrantedPermissions().any { it in bodyPermissions }
    }

    /**
     * 최근 180일 안에서 각 항목의 가장 최근 기록 하나씩. 측정 시각과 출처 앱은
     * 체중 기록을 기준으로 삼는다 — 체성분 저울은 한 번에 모두 쓰고, 체중이 가장
     * 흔하게 남는 값이다. 체중이 없으면 남은 것 중 가장 최근 것을 쓴다.
     */
    suspend fun readLatestBodyComposition(): HealthConnectBodySnapshot {
        val client = getClientOrNull() ?: return HealthConnectBodySnapshot()
        val granted = client.permissionController.getGrantedPermissions()
        val end = Instant.now()
        val start = end.minus(BODY_LOOKBACK_DAYS, ChronoUnit.DAYS)

        suspend fun <T : Record> latest(type: KClass<T>): T? {
            if (HealthPermission.getReadPermission(type) !in granted) return null
            return client.readRecords(
                ReadRecordsRequest(
                    recordType = type,
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                    ascendingOrder = false,
                    pageSize = 1
                )
            ).records.firstOrNull()
        }

        val weight = latest(WeightRecord::class)
        val bodyFat = latest(BodyFatRecord::class)
        val bmr = latest(BasalMetabolicRateRecord::class)
        val lean = latest(LeanBodyMassRecord::class)

        val anchor: Pair<Instant, String>? = weight?.let { it.time to it.metadata.dataOrigin.packageName }
            ?: listOfNotNull(
                bodyFat?.let { it.time to it.metadata.dataOrigin.packageName },
                bmr?.let { it.time to it.metadata.dataOrigin.packageName },
                lean?.let { it.time to it.metadata.dataOrigin.packageName }
            ).maxByOrNull { it.first }

        return HealthConnectBodySnapshot(
            weightKg = weight?.weight?.inKilograms,
            bodyFatPercent = bodyFat?.percentage?.value,
            basalKcalPerDay = bmr?.basalMetabolicRate?.inKilocaloriesPerDay,
            leanMassKg = lean?.mass?.inKilograms,
            measuredAtEpochMillis = anchor?.first?.toEpochMilli(),
            originPackage = anchor?.second
        )
    }

    /**
     * 이 빌드의 매니페스트에 선언된 수면·운동 권한. 선언하지 않은 권한은 요청해도
     * 받을 수 없고, 권한 창에 이상한 빈 항목만 남긴다. 1.0.9(12)까지는 비어 있다 —
     * 프로덕션 액세스 재신청 전에 건강 권한을 늘리지 않기로 했다.
     */
    fun declaredActivityPermissions(): Set<String> {
        val declared = runCatching {
            @Suppress("DEPRECATION")
            context.packageManager
                .getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
                .requestedPermissions
                ?.toSet()
        }.getOrNull() ?: emptySet()
        return activityPermissions.filterTo(mutableSetOf()) { it in declared }
    }

    suspend fun hasAllDeclaredActivityPermissions(): Boolean {
        val declared = declaredActivityPermissions()
        if (declared.isEmpty()) return true
        val client = getClientOrNull() ?: return false
        return client.permissionController.getGrantedPermissions().containsAll(declared)
    }

    /**
     * 오늘 기록에 쓸 수면·운동을 읽는다. 허락된 것만 읽고, 하나가 실패해도 다른
     * 하나는 보낸다 — 운동을 못 읽었다고 수면까지 버리지 않는다.
     *
     * 수면은 어제 정오부터 지금까지 끝난 세션을 전부 보낸다. 어느 것이 어젯밤인지는
     * 웹이 고른다(깬 날짜 기준). 운동은 오늘 0시 이후 시작한 세션이다.
     */
    suspend fun readTodayActivity(): HealthConnectActivitySnapshot {
        val client = getClientOrNull() ?: return HealthConnectActivitySnapshot()
        val granted = client.permissionController.getGrantedPermissions()
        val sleepGranted = HealthPermission.getReadPermission(SleepSessionRecord::class) in granted
        val exerciseGranted = HealthPermission.getReadPermission(ExerciseSessionRecord::class) in granted
        val caloriesGranted = HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class) in granted
        val distanceGranted = HealthPermission.getReadPermission(DistanceRecord::class) in granted

        val zoneId = ZoneId.systemDefault()
        val today = LocalDate.now(zoneId)
        val startOfToday = today.atStartOfDay(zoneId).toInstant()
        val yesterdayNoon = today.minusDays(1).atTime(12, 0).atZone(zoneId).toInstant()
        val now = Instant.now()

        val sleepSessions = if (!sleepGranted) emptyList() else runCatching {
            client.readRecords(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(yesterdayNoon, now),
                    pageSize = HealthConnectActivityCodec.MAX_SESSIONS
                )
            ).records
                .filter { !it.endTime.isAfter(now) }
                .map(HealthConnectActivityCodec::summarizeSleep)
        }.onFailure { Log.w(TAG, "sleep read failed", it) }.getOrDefault(emptyList())

        val exerciseSessions = if (!exerciseGranted) emptyList() else runCatching {
            client.readRecords(
                ReadRecordsRequest(
                    recordType = ExerciseSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(startOfToday, now),
                    pageSize = HealthConnectActivityCodec.MAX_SESSIONS
                )
            ).records
                .filter { !it.startTime.isBefore(startOfToday) }
                .map { record ->
                    val origin = setOf(record.metadata.dataOrigin)
                    val range = TimeRangeFilter.between(record.startTime, record.endTime)
                    val totals = if (!caloriesGranted && !distanceGranted) null else runCatching {
                        client.aggregate(
                            AggregateRequest(
                                metrics = buildSet {
                                    if (caloriesGranted) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
                                    if (distanceGranted) add(DistanceRecord.DISTANCE_TOTAL)
                                },
                                timeRangeFilter = range,
                                dataOriginFilter = origin
                            )
                        )
                    }.getOrNull()
                    HealthConnectExerciseSession(
                        typeKey = HealthConnectActivityCodec.exerciseTypeKey(record.exerciseType),
                        startEpochMillis = record.startTime.toEpochMilli(),
                        endEpochMillis = record.endTime.toEpochMilli(),
                        activeKcal = totals?.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
                            ?.inKilocalories?.let { Math.round(it).toInt() },
                        distanceMeters = totals?.get(DistanceRecord.DISTANCE_TOTAL)
                            ?.inMeters?.let { Math.round(it).toInt() },
                        originPackage = record.metadata.dataOrigin.packageName
                    )
                }
        }.onFailure { Log.w(TAG, "exercise read failed", it) }.getOrDefault(emptyList())

        return HealthConnectActivitySnapshot(
            sleepSessions = sleepSessions,
            exerciseSessions = exerciseSessions,
            sleepGranted = sleepGranted,
            exerciseGranted = exerciseGranted,
            syncedAtEpochMillis = System.currentTimeMillis()
        )
    }

    suspend fun syncTodaySteps(): HealthConnectSnapshot {
        val availability = getAvailability()
        if (availability != HealthConnectAvailabilityState.AVAILABLE) {
            return HealthConnectSnapshot(availabilityState = availability)
        }

        val client = getClientOrNull() ?: return HealthConnectSnapshot(availabilityState = availability)
        val permissionGranted = client.permissionController.getGrantedPermissions().containsAll(requiredPermissions)
        if (!permissionGranted) {
            return HealthConnectSnapshot(
                availabilityState = availability,
                permissionGranted = false
            )
        }

        val zoneId = ZoneId.systemDefault()
        val startTime = LocalDate.now(zoneId).atStartOfDay(zoneId).toInstant()
        val endTime = Instant.now()
        val totalStepsCount = aggregateSteps(
            client = client,
            startTime = startTime,
            endTime = endTime
        ) ?: 0L
        val samsungHealthAggregateStepsCount = aggregateSteps(
            client = client,
            startTime = startTime,
            endTime = endTime,
            dataOriginFilter = setOf(DataOrigin(SAMSUNG_HEALTH_PACKAGE_NAME))
        )
        val samsungHealthRawStepsCount = readStepsSum(
            client = client,
            startTime = startTime,
            endTime = endTime,
            dataOriginFilter = setOf(DataOrigin(SAMSUNG_HEALTH_PACKAGE_NAME))
        )
        val samsungHealthStepsCount = listOfNotNull(
            samsungHealthAggregateStepsCount,
            samsungHealthRawStepsCount
        ).maxOrNull()

        val resolvedStepsCount = if ((samsungHealthStepsCount ?: 0L) >= totalStepsCount && (samsungHealthStepsCount ?: 0L) > 0L) {
            samsungHealthStepsCount
        } else {
            totalStepsCount
        }
        val resolvedOriginPackage = if ((samsungHealthStepsCount ?: 0L) >= totalStepsCount && (samsungHealthStepsCount ?: 0L) > 0L) {
            SAMSUNG_HEALTH_PACKAGE_NAME
        } else {
            null
        }
        val resolvedOriginLabel = if ((samsungHealthStepsCount ?: 0L) >= totalStepsCount && (samsungHealthStepsCount ?: 0L) > 0L) {
            SAMSUNG_HEALTH_LABEL
        } else {
            HEALTH_CONNECT_LABEL
        }

        return HealthConnectSnapshot(
            stepsCount = resolvedStepsCount,
            allOriginsStepsCount = totalStepsCount,
            syncedAtEpochMillis = System.currentTimeMillis(),
            availabilityState = availability,
            permissionGranted = true,
            dataOriginPackageName = resolvedOriginPackage,
            dataOriginLabel = resolvedOriginLabel
        )
    }

    private suspend fun aggregateSteps(
        client: HealthConnectClient,
        startTime: Instant,
        endTime: Instant,
        dataOriginFilter: Set<DataOrigin> = emptySet()
    ): Long? {
        val response = client.aggregate(
            AggregateRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                dataOriginFilter = dataOriginFilter
            )
        )
        return response[StepsRecord.COUNT_TOTAL]
    }

    private suspend fun readStepsSum(
        client: HealthConnectClient,
        startTime: Instant,
        endTime: Instant,
        dataOriginFilter: Set<DataOrigin> = emptySet()
    ): Long? {
        var pageToken: String? = null
        var totalCount = 0L
        var foundAnyRecord = false

        do {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = StepsRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                    dataOriginFilter = dataOriginFilter,
                    pageToken = pageToken
                )
            )

            response.records.forEach { record ->
                foundAnyRecord = true
                totalCount += record.count
            }
            pageToken = response.pageToken
        } while (!pageToken.isNullOrBlank())

        return if (foundAnyRecord) totalCount else null
    }

    private fun getClientOrNull(): HealthConnectClient? {
        if (getAvailability() != HealthConnectAvailabilityState.AVAILABLE) return null
        return HealthConnectClient.getOrCreate(context)
    }

    companion object {
        const val PROVIDER_PACKAGE_NAME = "com.google.android.apps.healthdata"
        const val SAMSUNG_HEALTH_PACKAGE_NAME = "com.sec.android.app.shealth"
        const val SAMSUNG_HEALTH_LABEL = "Samsung Health"
        const val HEALTH_CONNECT_LABEL = "Health Connect"

        val requiredPermissions: Set<String> = setOf(
            HealthPermission.getReadPermission(StepsRecord::class)
        )

        // 체성분은 걸음수와 따로 묻는다. 하나라도 허락되면 그만큼만 읽는다.
        val bodyPermissions: Set<String> = setOf(
            HealthPermission.getReadPermission(WeightRecord::class),
            HealthPermission.getReadPermission(BodyFatRecord::class),
            HealthPermission.getReadPermission(BasalMetabolicRateRecord::class),
            HealthPermission.getReadPermission(LeanBodyMassRecord::class)
        )

        // 수면·운동도 걸음수와 따로 묻는다. 걸음수만 허락한 사람의 동기화는 그대로 돈다.
        // 매니페스트에 없으면 declaredActivityPermissions() 가 걸러낸다.
        val activityPermissions: Set<String> = setOf(
            HealthPermission.getReadPermission(SleepSessionRecord::class),
            HealthPermission.getReadPermission(ExerciseSessionRecord::class),
            HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(DistanceRecord::class)
        )

        private const val TAG = "HealthConnectManager"
        private const val BODY_LOOKBACK_DAYS = 180L
    }
}
