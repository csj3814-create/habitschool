import { describe, expect, it } from 'vitest';
import {
    HEALTH_CONNECT_BODY_MIN_NATIVE_VERSION,
    describeHealthConnectBody,
    healthConnectOriginLabel,
    parseHealthConnectBodyPayload,
    supportsHealthConnectBody
} from '../js/health-connect-body.js';
import { readAppSource, readRepoFile } from './source-helpers.js';

const ok = (extra = {}) => ({
    focus: 'health-connect-body',
    hcStatus: 'ok',
    hcWeight: '74.90',
    hcBodyFat: '7.7',
    hcBmr: '1735',
    hcLeanMass: '69.10',
    hcMeasuredAt: String(Date.UTC(2026, 8, 23, 13, 55)), // 2026-09-23 22:55 KST
    hcOrigin: 'cn.fitdays.fitdays',
    ...extra
});

describe('Health Connect 체성분 읽기', () => {
    it('체성분 주소가 아니면 손대지 않는다', () => {
        expect(parseHealthConnectBodyPayload({ focus: 'health-connect-steps' })).toBeNull();
    });

    it('값을 읽고 체지방량은 체중 × 체지방률로 계산했다고 표시한다', () => {
        const p = parseHealthConnectBodyPayload(ok());
        expect(p.status).toBe('ok');
        expect(p.weight).toBe(74.9);
        expect(p.bodyFatPct).toBe(7.7);
        expect(p.fat).toBeCloseTo(5.8, 1);
        expect(p.fatDerived).toBe(true);
        expect(p.bmr).toBe(1735);
        expect(p.leanMass).toBe(69.1);
        expect(p.originLabel).toBe('Fitdays');
    });

    it('측정일은 한국 날짜로 읽는다', () => {
        // UTC 13:55 는 한국 22:55 — 같은 날. UTC 16:00 은 한국 다음날 01:00.
        expect(parseHealthConnectBodyPayload(ok()).measuredDate).toBe('2026-09-23');
        expect(parseHealthConnectBodyPayload(ok({ hcMeasuredAt: String(Date.UTC(2026, 8, 23, 16, 0)) })).measuredDate)
            .toBe('2026-09-24');
    });

    it('골격근량·내장지방은 만들어 내지 않는다', () => {
        // Health Connect 규격에 없다. 제지방량을 골격근량으로 쓰지 않는다.
        const p = parseHealthConnectBodyPayload(ok());
        expect(p.smm).toBeUndefined();
        expect(p.visceral).toBeUndefined();
    });

    it('사람 범위를 벗어난 값은 버린다 — 주소는 누구든 만들 수 있다', () => {
        const p = parseHealthConnectBodyPayload(ok({ hcWeight: '749', hcBodyFat: '0' }));
        expect(p.weight).toBeNull();
        expect(p.bodyFatPct).toBeNull();
        expect(p.fat).toBeNull();
        expect(p.bmr).toBe(1735);
    });

    it('쓸 만한 값이 하나도 없으면 비었다고 말한다', () => {
        expect(parseHealthConnectBodyPayload(ok({ hcWeight: '', hcBodyFat: '', hcBmr: '', hcLeanMass: '' })).status)
            .toBe('empty');
    });

    it('실패 사유를 그대로 넘기고, 없으면 실패로 본다', () => {
        expect(parseHealthConnectBodyPayload({ focus: 'health-connect-body', hcStatus: 'denied' })).toEqual({ status: 'denied' });
        expect(parseHealthConnectBodyPayload({ focus: 'health-connect-body' })).toEqual({ status: 'failed' });
    });

    it('모르는 출처 앱은 Health Connect 로 부른다', () => {
        expect(healthConnectOriginLabel('com.example.scale')).toBe('Health Connect');
        expect(healthConnectOriginLabel('com.sec.android.app.shealth')).toBe('Samsung Health');
    });

    it('상태마다 사람 말로 설명한다', () => {
        for (const status of ['empty', 'denied', 'unavailable', 'update_required', 'failed']) {
            expect(describeHealthConnectBody({ status }).length).toBeGreaterThan(10);
        }
        expect(describeHealthConnectBody(parseHealthConnectBodyPayload(ok())))
            .toContain('골격근량·내장지방은 Health Connect 에 없어서 그대로 뒀어요');
    });

    it('예전 셸에는 버튼을 보이지 않는다', () => {
        expect(supportsHealthConnectBody('9')).toBe(false);
        expect(supportsHealthConnectBody('')).toBe(false);
        expect(supportsHealthConnectBody(String(HEALTH_CONNECT_BODY_MIN_NATIVE_VERSION))).toBe(true);
    });
});

describe('Android 셸과 웹이 같은 약속을 쓴다', () => {
    const ROUTES = readRepoFile('android/app/src/main/java/com/habitschool/app/AppRoutes.kt');
    const MANIFEST = readRepoFile('android/app/src/main/AndroidManifest.xml');
    const ENTRY = readRepoFile('android/app/src/main/java/com/habitschool/app/NativeEntryActivity.kt');
    const GRADLE = readRepoFile('android/app/build.gradle.kts');
    const APP = readAppSource();

    it('주소에 싣는 이름이 웹이 읽는 이름과 같다', () => {
        // 한쪽 이름만 바뀌면 값은 주소에 실려 오는데 웹은 빈칸으로 본다.
        const webKeys = APP.split('const HEALTH_CONNECT_BODY_PARAM_KEYS = [')[1].split(']')[0]
            .match(/'([^']+)'/g).map((k) => k.replace(/'/g, ''));
        for (const key of webKeys) expect(ROUTES).toContain(`"${key}" to`);
        expect(ROUTES).toContain('"focus" to "health-connect-body"');
    });

    it('웹이 부르는 주소를 셸이 받는다', () => {
        expect(APP).toContain("new URL('habitschool://health-connect/body')");
        expect(MANIFEST).toMatch(/android:host="health-connect"\s*android:path="\/body"/);
        expect(ENTRY).toContain('data.path == "/body"');
    });

    it('건강 권한은 읽기만 쓴다', () => {
        expect(MANIFEST).not.toMatch(/android\.permission\.health\.WRITE_/);
    });

    it('권한이 없는 셸에는 웹이 버튼을 보이지 않는다', () => {
        // 권한 선언 없이 버튼이 보이면 누를 때마다 "권한이 없어요" 만 뜬다.
        // 체성분 읽기 권한이 manifest 에 들어간 빌드부터 문턱을 넘어야 한다.
        expect(ROUTES).toContain('"nativeVersion"');
        const versionCode = Number(GRADLE.match(/versionCode = (\d+)/)[1]);
        const hasBodyPermission = /<uses-permission\s+android:name="android\.permission\.health\.READ_WEIGHT"/.test(MANIFEST);
        if (hasBodyPermission) {
            expect(versionCode).toBeGreaterThanOrEqual(HEALTH_CONNECT_BODY_MIN_NATIVE_VERSION);
        } else {
            expect(versionCode).toBeLessThan(HEALTH_CONNECT_BODY_MIN_NATIVE_VERSION);
        }
    });
});

describe('저장에 출처와 측정일이 남는다', () => {
    const APP = readAppSource();
    const save = APP.split('window.saveHealthProfile = async function () {')[1].split('\n};\n')[0];

    it('출처를 남기고, 손으로 넣었으면 manual', () => {
        expect(save).toContain("source: extras?.source || 'manual'");
    });

    it('측정일이 있으면 그날 문서로 — 미래 날짜는 받지 않는다', () => {
        expect(save).toContain('extras.measuredDate <= dateStr');
        expect(save).toContain('"inbodyHistory", recordDate');
    });

    it('로그인 뒤 저장된 프로필이 가져온 값을 덮지 않는다', () => {
        const auth = readRepoFile('js/auth.js');
        const block = auth.split("if (el('prof-bmr')) el('prof-bmr').value = prof.bmr || '';")[1].slice(0, 200);
        expect(block).toContain('window.applyPendingBodyCompositionImport?.()');
    });
});
