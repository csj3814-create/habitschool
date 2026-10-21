import { getActiveMemberTimeZone, getDateStringInZone } from './member-time.js?v=538';
import { t } from './i18n.js?v=538';

/**
 * Health Connect 에서 넘어온 체성분을 읽는다.
 *
 * TWA 에는 JS 브리지가 없어서 네이티브는 값을 주소에 실어 보낸다
 * (android/.../AppRoutes.withHealthConnectBody). 여기서는 그 주소를 믿을 만한
 * 숫자로 바꾸기만 한다. 누구든 이 주소를 손으로 만들 수 있으므로 사람 범위를
 * 벗어난 값은 버린다 — 칸에 채우기만 하고 저장은 회원이 확인한 뒤에 하지만,
 * 그래도 말이 안 되는 숫자를 칸에 넣지는 않는다.
 *
 * Health Connect 에서 받는 것: 체중 · 체지방률 · 기초대사량 · 제지방량 · 골량 · 체수분 · 키.
 * 골량·체수분은 Fitdays CSV 와 같은 `boneMass`·`bodyWater`(kg) 자리로 저장한다.
 * 키는 프로필 키 칸이 비어 있을 때만 채운다 — 측정이 아니라 한 번 넣어 두는 값이다.
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
    leanMass: [10, 200],
    // body-composition-csv.js 와 같은 범위 (같은 inbodyHistory 자리에 들어간다)
    boneMass: [0.5, 10],
    bodyWater: [5, 150],
    height: [100, 250]
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

// 측정일은 회원 시간대(없으면 한국)의 날짜다. 이름은 한국 시간만 쓰던 때의 것이다.
function toKstDate(epochMillis) {
    const ms = Number(epochMillis);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return getDateStringInZone(ms, getActiveMemberTimeZone());
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
    const boneMass = inRange('boneMass', params.hcBoneMass);
    const bodyWater = inRange('bodyWater', params.hcBodyWater);
    const height = inRange('height', params.hcHeight);
    const fat = weight !== null && bodyFatPct !== null
        ? Math.round((weight * bodyFatPct) / 100 * 10) / 10
        : null;

    // 키만 왔으면 측정이 없는 것이다 (셸도 같은 기준으로 empty 를 보낸다).
    if ([weight, bodyFatPct, bmr, leanMass, boneMass, bodyWater].every((value) => value === null)) {
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
        boneMass,
        bodyWater,
        height,
        measuredDate: toKstDate(params.hcMeasuredAt),
        originLabel: healthConnectOriginLabel(params.hcOrigin)
    };
}

/** 가져오기 결과를 한 줄로. 못 가져온 이유도 사람 말로 한다. */
export function describeHealthConnectBody(payload) {
    if (!payload) return '';
    switch (payload.status) {
        case 'ok': {
            const when = payload.measuredDate ? t('hcBody.measuredOn', { date: payload.measuredDate }) : '';
            return t('hcBody.ok', { origin: payload.originLabel, when });
        }
        case 'empty':
            return t('hcBody.none');
        case 'denied':
            return t('hcBody.permission');
        case 'unavailable':
            return t('hcBody.unavailable');
        case 'update_required':
            return t('hcBody.install');
        default:
            return t('hcBody.failed');
    }
}
