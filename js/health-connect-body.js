/**
 * Health Connect 에서 넘어온 체성분을 읽는다.
 *
 * TWA 에는 JS 브리지가 없어서 네이티브는 값을 주소에 실어 보낸다
 * (android/.../AppRoutes.withHealthConnectBody). 여기서는 그 주소를 믿을 만한
 * 숫자로 바꾸기만 한다. 누구든 이 주소를 손으로 만들 수 있으므로 사람 범위를
 * 벗어난 값은 버린다 — 칸에 채우기만 하고 저장은 회원이 확인한 뒤에 하지만,
 * 그래도 말이 안 되는 숫자를 칸에 넣지는 않는다.
 *
 * Health Connect 에는 골격근량과 내장지방이 없다. 그 두 칸은 손대지 않는다 — 전에
 * 인바디로 넣은 값이 있으면 그대로 남는다. 제지방량은 뼈·장기·체수분을 포함한
 * 다른 값이라 골격근량 칸에 넣지 않는다.
 *
 * 의존성이 없는 순수 모듈이다.
 */

// 이 번호 이상의 Android 셸에만 "Health Connect 에서 가져오기" 가 있다.
// 1.0.6(9)~1.0.8(11)에는 코드만 있고 체성분 읽기 권한이 없다 — 프로덕션 액세스
// 재신청 전에 건강 권한을 늘리지 않기로 했다. 1.0.9(12)도 권한 없이 나간다(수면·운동 코드만).
// 권한을 더하는 1.0.10(13)부터 버튼을 보인다.
// (1.0.7 은 공유 대상 주소, 1.0.8 은 공유 파일을 서버로 올리는 데 먼저 썼다.)
export const HEALTH_CONNECT_BODY_MIN_NATIVE_VERSION = 13;

const RANGES = Object.freeze({
    weight: [20, 300],
    bodyFatPct: [1, 75],
    bmr: [500, 5000],
    leanMass: [10, 200]
});

// 자주 보이는 출처 앱. 모르는 패키지는 이름 대신 "Health Connect" 로 말한다.
const ORIGIN_LABELS = Object.freeze({
    'cn.fitdays.fitdays': 'Fitdays',
    'com.sec.android.app.shealth': 'Samsung Health',
    'com.google.android.apps.fitness': 'Google Fit',
    'com.fitbit.FitbitMobile': 'Fitbit',
    'com.inbody.inbodyapp': 'InBody',
    'com.xiaomi.wearable': 'Mi Fitness',
    'com.huawei.health': 'Huawei Health'
});

function inRange(key, raw) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    const [min, max] = RANGES[key];
    if (value < min || value > max) return null;
    return Math.round(value * 10) / 10;
}

function toKstDate(epochMillis) {
    const ms = Number(epochMillis);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function healthConnectOriginLabel(packageName = '') {
    const name = String(packageName || '').trim();
    return ORIGIN_LABELS[name] || 'Health Connect';
}

/** 이 셸에 Health Connect 체성분 가져오기가 있는가. */
export function supportsHealthConnectBody(nativeVersion) {
    const version = Number.parseInt(nativeVersion, 10);
    return Number.isFinite(version) && version >= HEALTH_CONNECT_BODY_MIN_NATIVE_VERSION;
}

/**
 * 주소의 hc* 값을 읽는다. focus 가 health-connect-body 가 아니면 null.
 *
 * 체지방량(kg)은 Health Connect 에 없다. 체중과 체지방률이 둘 다 있으면 곱해서
 * 채운다 — 추측이 아니라 산수라 계산했다고 표시해 둔다.
 */
export function parseHealthConnectBodyPayload(params = {}) {
    if (String(params.focus || '') !== 'health-connect-body') return null;
    const status = String(params.hcStatus || '').trim() || 'failed';
    if (status !== 'ok') return { status };

    const weight = inRange('weight', params.hcWeight);
    const bodyFatPct = inRange('bodyFatPct', params.hcBodyFat);
    const bmr = inRange('bmr', params.hcBmr);
    const leanMass = inRange('leanMass', params.hcLeanMass);
    const fat = weight !== null && bodyFatPct !== null
        ? Math.round((weight * bodyFatPct) / 100 * 10) / 10
        : null;

    if (weight === null && bodyFatPct === null && bmr === null && leanMass === null) {
        return { status: 'empty' };
    }

    return {
        status,
        weight,
        bodyFatPct,
        fat,
        fatDerived: fat !== null,
        bmr: bmr === null ? null : Math.round(bmr),
        leanMass,
        measuredDate: toKstDate(params.hcMeasuredAt),
        originLabel: healthConnectOriginLabel(params.hcOrigin)
    };
}

/** 가져오기 결과를 한 줄로. 못 가져온 이유도 사람 말로 한다. */
export function describeHealthConnectBody(payload) {
    if (!payload) return '';
    switch (payload.status) {
        case 'ok': {
            const when = payload.measuredDate ? ` · ${payload.measuredDate} 측정` : '';
            return `${payload.originLabel}에서 가져왔어요${when}. 골격근량·내장지방은 Health Connect 에 없어서 그대로 뒀어요. 확인하고 저장을 눌러 주세요.`;
        }
        case 'empty':
            return 'Health Connect 에 최근 180일 체성분 기록이 없어요. 체중계 앱에서 Health Connect 연동을 켰는지 확인해 주세요.';
        case 'denied':
            return '체성분을 읽을 권한이 없어요. Health Connect 에서 해빛스쿨에 체중·체지방 읽기를 허용해 주세요.';
        case 'unavailable':
            return '이 폰에서는 Health Connect 를 쓸 수 없어요.';
        case 'update_required':
            return 'Health Connect 를 설치하거나 업데이트한 뒤 다시 눌러 주세요.';
        default:
            return 'Health Connect 에서 체성분을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.';
    }
}
