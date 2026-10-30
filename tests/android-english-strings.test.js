import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-10-30: 플레이 앱 웹 화면은 한국어가 아닌 기기에서 영어로 열리는데(E1), 안드로이드 쪽 글자
// (앱 이름·여는 중 화면·Health Connect 창·위젯·타일)는 values/strings.xml 의 한국어뿐이었다.
// 기본(values)을 영어로, 한국어를 values-ko 로 옮겼다 — 일본어·스페인어 기기도 웹처럼 영어를 본다.
// 한국어 기기는 지금 글자 그대로다(옮기기 전 파일과 글자 단위로 대조함).

const RES = 'android/app/src/main/res';
const KO = readRepoFile(`${RES}/values-ko/strings.xml`);
const EN = readRepoFile(`${RES}/values/strings.xml`);
const HANGUL = /[가-힣]/;
// 글이 아니라 설정이라 기본 파일에만 둔다.
const NOT_TEXT = ['asset_statements', 'twa_share_target'];

function strings(xml) {
    return Object.fromEntries(
        [...xml.matchAll(/<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)].map((m) => [m[1], m[2]])
    );
}

function placeholders(text) {
    return (text.match(/%\d+\$[sd]/g) || []).sort();
}

const ko = strings(KO);
const en = strings(EN);

describe('안드로이드 앱 글자 — 한국어가 아닌 기기 (기본 = 영어)', () => {
    it('한국어와 영어의 회원용 글 키가 같고, 설정 값은 기본 파일에만 있다', () => {
        const enTextKeys = Object.keys(en).filter((k) => !NOT_TEXT.includes(k)).sort();
        expect(Object.keys(ko).sort()).toEqual(enTextKeys);
        for (const key of NOT_TEXT) {
            expect(en[key], key).toBeTruthy();
            expect(ko[key], key).toBeUndefined();
        }
    });

    it('자리표시자(%1$s 등)가 한국어와 같다', () => {
        for (const key of Object.keys(ko)) {
            expect(placeholders(en[key]), key).toEqual(placeholders(ko[key]));
        }
    });

    it('기본 글자에 한글이 없고, 작은따옴표는 모두 \\\' 로 적는다 (안 그러면 빌드가 깨진다)', () => {
        for (const [key, text] of Object.entries(en)) {
            expect(HANGUL.test(text), key).toBe(false);
            expect(/(^|[^\\])'/.test(text), key).toBe(false);
        }
    });

    it('개인정보처리방침은 한국어가 아닌 기기에서 영어판을 연다', () => {
        expect(ko.privacy_policy_path).toBe('/privacy.html');
        expect(en.privacy_policy_path).toBe('/en/privacy');
        const routes = readRepoFile('android/app/src/main/java/com/habitschool/app/AppRoutes.kt');
        expect(routes).toContain('context.getString(R.string.privacy_policy_path)');
        expect(routes).not.toContain('$WEB_ORIGIN/privacy.html');
    });
});

describe('안드로이드 앱 글자 — 한국어 기기는 그대로', () => {
    it('코드·화면에 박혀 있던 한국어를 키로 옮겼고 글자는 같다', () => {
        expect(ko.app_name).toBe('해빛스쿨');
        expect(ko.tile_label).toBe('해빛스쿨');
        expect(ko.launcher_loading_copy).toBe('앱을 여는 중입니다. 잠시만 기다려 주세요.');
        expect(ko.launcher_timeout_hint).toBe('앱 실행이 조금 늦어지고 있습니다. 조금 더 기다리거나 브라우저로 열 수 있어요.');
        expect(ko.launcher_open_browser).toBe('브라우저로 열기');
        expect(ko.native_health_sync_failed_title).toBe('Health Connect 동기화에 실패했어요');
        expect(ko.native_health_sync_failed_copy).toBe('지금은 걸음수를 가져오지 못했습니다. 잠시 후 다시 시도하거나 Health Connect 앱 상태를 확인해 주세요.');
    });

    it('화면 파일과 코드에 회원에게 보이는 한국어가 더 남아 있지 않다 (주석 빼고)', () => {
        const files = [
            `${RES}/layout/activity_launcher_loading.xml`,
            `${RES}/layout/activity_health_connect.xml`,
            `${RES}/layout/activity_health_connect_onboarding.xml`,
            `${RES}/layout/activity_permissions_rationale.xml`,
            `${RES}/layout/widget_habitschool_summary.xml`,
            'android/app/src/main/java/com/habitschool/app/HealthConnectPermissionActivity.kt',
            'android/app/src/main/java/com/habitschool/app/HabitschoolLauncherActivity.kt',
            'android/app/src/main/java/com/habitschool/app/health/HealthConnectUiText.kt',
        ];
        for (const file of files) {
            const code = readRepoFile(file)
                .split('\n')
                .filter((line) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(line))
                .join('\n');
            const literals = code.match(/"[^"\n]*"/g) || [];
            expect(literals.filter((s) => HANGUL.test(s)), file).toEqual([]);
        }
    });
});
