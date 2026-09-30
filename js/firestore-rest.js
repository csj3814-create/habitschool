// Firestore 를 SDK 의 실시간 연결 없이, 보통의 HTTP 요청 한 번으로 읽는다.
//
// 2026-09-30 제보(PC 크롬): 30일 결과지가 15~30초씩 멈췄다. 같은 조회를 서버에
// 직접 보내면 0.5초에 끝났다 — 서버도 자료 크기(기록 30개, 0.8MB)도 아니었다.
// SDK 의 실시간 연결(WebChannel 롱폴링)은 응답을 한 요청 안에 흘려 보내는데,
// 그 흐름을 끝까지 모았다가 넘겨주는 보안 프로그램이나 망 장비가 있으면 요청이
// 닫히는 25초 뒤에야 자료가 도착한다. 연결을 새로 세워도 같은 길로 가서 같았다.
// 보통 요청은 응답이 끝나면 바로 닫히므로 그 영향을 받지 않는다.
//
// 보안 규칙은 SDK 와 똑같이 적용된다 — 로그인한 사람의 ID 토큰을 싣는다.

const FIRESTORE_REST_BASE = 'https://firestore.googleapis.com/v1';

/** REST 의 Value 모양을 SDK 가 돌려주는 평범한 값으로 바꾼다. */
export function decodeFirestoreValue(value) {
    if (!value || typeof value !== 'object') return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return !!value.booleanValue;
    if ('nullValue' in value) return null;
    // 결과지는 시각을 쓰지 않는다. 문자열로 두면 적어도 잃지는 않는다.
    if ('timestampValue' in value) return value.timestampValue;
    if ('referenceValue' in value) return value.referenceValue;
    if ('geoPointValue' in value) return { ...value.geoPointValue };
    if ('bytesValue' in value) return value.bytesValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
    if ('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields || {});
    return null;
}

export function decodeFirestoreFields(fields = {}) {
    return Object.fromEntries(Object.entries(fields).map(([key, v]) => [key, decodeFirestoreValue(v)]));
}

/**
 * structuredQuery 를 한 번 보내고 문서 데이터 배열을 돌려준다.
 * 시간을 넘기면 요청을 끊고 실패한다 — 이것까지 멈추면 안 된다.
 */
export async function runFirestoreQueryViaRest({
    projectId,
    idToken,
    structuredQuery,
    timeoutMs = 10000,
    fetchImpl = globalThis.fetch
}) {
    if (!projectId || !idToken) throw new Error('REST 조회에 필요한 값이 없습니다.');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetchImpl(
            `${FIRESTORE_REST_BASE}/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ structuredQuery }),
                signal: controller?.signal
            }
        );
        if (!response.ok) {
            const error = new Error(`Firestore REST ${response.status}`);
            error.code = response.status === 403 ? 'permission-denied' : 'unavailable';
            throw error;
        }
        const rows = await response.json();
        return (Array.isArray(rows) ? rows : [])
            .filter((row) => row && row.document)
            .map((row) => decodeFirestoreFields(row.document.fields || {}));
    } finally {
        if (timer) clearTimeout(timer);
    }
}
