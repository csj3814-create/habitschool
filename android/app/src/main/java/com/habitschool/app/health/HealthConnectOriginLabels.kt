package com.habitschool.app.health

/**
 * Health Connect 에 값을 쓴 앱의 이름. 모르는 패키지는 "Health Connect" 로 말한다.
 * 웹의 js/health-connect-body.js ORIGIN_LABELS 와 같은 목록이다.
 */
object HealthConnectOriginLabels {
    const val HEALTH_CONNECT_LABEL = "Health Connect"

    private val LABELS: Map<String, String> = mapOf(
        "com.sec.android.app.shealth" to "Samsung Health",
        "com.google.android.apps.fitness" to "Google Fit",
        "com.fitbit.FitbitMobile" to "Fitbit",
        "com.xiaomi.wearable" to "Mi Fitness",
        "com.huawei.health" to "Huawei Health",
        "com.garmin.android.apps.connectmobile" to "Garmin Connect",
        "com.nothing.smartcenter" to "Nothing X",
        "com.nothing.cmf.watch" to "CMF Watch",
        "com.huami.watch.hmwatchmanager" to "Zepp",
        "com.withings.wiscale2" to "Withings",
        "fi.polar.polarflow" to "Polar Flow",
        "com.ouraring.oura" to "Oura",
        "com.strava" to "Strava"
    )

    fun labelFor(packageName: String?): String =
        LABELS[packageName?.trim().orEmpty()] ?: HEALTH_CONNECT_LABEL

    /**
     * 오늘 걸음수를 한 앱의 값으로 고른다 (2026-11-27 대표: 휴대폰 삼성 헬스와 낫싱
     * 워치가 겹친다). 앱별 값을 더하지 않는다 — 같은 걸음을 두 번 세게 된다.
     * 가장 큰 한 앱의 값을 쓰면 부풀지 않고, 워치를 풀어 둔 날엔 휴대폰 값이 쓰여
     * 덜 잡히지도 않는다. Health Connect 전체 합계(앱 우선순위로 겹침을 이미 뺀 값)가
     * 더 크면 그것을 쓴다 — 아침엔 휴대폰, 오후엔 워치였던 날이다.
     * 같으면 앱 이름을 보여 줄 수 있는 쪽을 고른다.
     *
     * @return (걸음수, 출처 패키지 — 전체 합계면 null)
     */
    fun pickSteps(totalSteps: Long, perOrigin: Map<String, Long>): Pair<Long, String?> {
        val best = perOrigin.filterValues { it > 0L }.maxByOrNull { it.value }
        return if (best != null && best.value >= totalSteps) {
            best.value to best.key
        } else {
            totalSteps to null
        }
    }
}
