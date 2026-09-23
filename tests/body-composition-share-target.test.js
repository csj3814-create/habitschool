import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// Fitdays -> 내보내기 -> 공유 -> 해빛스쿨. 이 길은 네 곳이 맞물려야 열린다.
//
//   manifest.json / manifest-en.json  공유 시트에 해빛스쿨이 뜨고 CSV 를 받는다
//   sw.js                             받은 파일을 종류 그대로 보관한다
//   js/app-core.js                    CSV 를 사진 시트가 아니라 체성분으로 보낸다
//
// 한 곳만 빠져도 공유는 되는데 아무 일도 일어나지 않거나, CSV 가 사진으로
// 둔갑해 조용히 버려진다. 어느 쪽이든 화면에는 아무 표시가 없다.

const MANIFEST = JSON.parse(readRepoFile('manifest.json'));
const MANIFEST_EN = JSON.parse(readRepoFile('manifest-en.json'));
const SW = readRepoFile('sw.js');
const CLIENT = readRepoFile('js/app-core.js');

describe('공유 시트가 CSV 를 받는다', () => {
    it('두 manifest 모두 CSV 를 받는다', () => {
        [MANIFEST, MANIFEST_EN].forEach((manifest) => {
            const accept = manifest.share_target?.params?.files?.[0]?.accept || [];
            expect(accept).toContain('text/csv');
            // 안드로이드 일부 공유 시트는 MIME 대신 확장자로 거른다.
            expect(accept).toContain('.csv');
            // 사진 공유는 그대로 살아 있어야 한다.
            expect(accept).toContain('image/*');
        });
    });

    it('두 manifest 의 공유 경로가 같다', () => {
        expect(MANIFEST_EN.share_target?.action).toBe(MANIFEST.share_target?.action);
    });
});

describe('서비스 워커가 CSV 를 사진으로 만들지 않는다', () => {
    it('종류를 모른다고 image/jpeg 로 우기지 않는다', () => {
        const store = SW.split('async function storePendingSharedTarget(files) {')[1].split('\n}\n')[0];
        expect(store).toContain('looksCsv');
        expect(store).toContain("'text/csv'");
        // 예전에는 여기서 무조건 image/jpeg 로 떨어뜨렸다.
        expect(store).not.toMatch(/String\(file\?\.type \|\| 'image\/jpeg'\)/);
    });

    it('CSV 모듈을 미리 받아 둔다', () => {
        expect(SW).toContain("'./js/body-composition-csv.js?v=433'");
    });
});

describe('앱이 CSV 를 체성분으로 보낸다', () => {
    it('MIME 만 믿지 않는다', () => {
        // 안드로이드 공유 시트는 CSV 를 text/plain 이나 octet-stream 으로 건넨다.
        const fn = CLIENT.split('function isSharedCsvType(type = \'\', name = \'\') {')[1].split('\n}\n')[0];
        expect(fn).toContain("'text/csv'");
        expect(fn).toContain("'text/plain'");
        expect(fn).toContain("'application/octet-stream'");
    });

    it('CSV 는 사진 고르기 시트로 가지 않는다', () => {
        const flow = CLIENT.split('async function handleSharedUploadDeepLink() {')[1].split('\n}\n')[0];
        const csvBranch = flow.indexOf('importSharedBodyCompositionCsv');
        const sheet = flow.indexOf('openSharedImportSheetFlow');
        expect(csvBranch).toBeGreaterThan(-1);
        expect(csvBranch).toBeLessThan(sheet);
    });

    it('읽기 전에 동의부터 본다', () => {
        const fn = CLIENT.split('async function importSharedBodyCompositionCsv(file) {')[1].split('\n}\n')[0];
        const consent = fn.indexOf('hasSensitiveDataConsent');
        const read = fn.indexOf('file.text()');
        expect(consent).toBeGreaterThan(-1);
        expect(consent).toBeLessThan(read);
    });
});

describe('들여오기 전에 사람에게 묻는다', () => {
    const fn = CLIENT.split('function confirmBodyCompositionImport(parsed, rows) {')[1].split('\n}\n')[0];

    it('무엇을 읽었는지 보여 준다', () => {
        expect(fn).toContain('읽은 항목');
        expect(fn).toContain('기간');
    });

    it('못 읽은 열을 숨기지 않는다', () => {
        // 못 읽은 것이 있다는 걸 알아야 값을 믿을지 정할 수 있다.
        expect(fn).toContain('못 읽은 열');
        expect(fn).toContain('parsed.unmatched');
    });

    it('계산해서 채운 값은 계산했다고 말한다', () => {
        expect(fn).toContain('체지방량은 체지방률 × 체중으로 계산했어요');
    });

    it('덮어쓴다는 것을 미리 말한다', () => {
        expect(fn).toContain('덮어씁니다');
    });
});

describe('저장', () => {
    const fn = CLIENT.split('async function writeBodyCompositionRows(uid, rows) {')[1].split('\n}\n')[0];

    it('문서 ID 가 날짜라 다시 들여와도 쌓이지 않는다', () => {
        expect(fn).toContain("doc(db, 'users', uid, 'inbodyHistory', row.date)");
    });

    it('출처를 남긴다', () => {
        // 손으로 넣은 값과 기기에서 온 값을 나중에 가릴 수 있어야 한다.
        expect(fn).toContain("source: 'fitdays_csv'");
        expect(fn).toContain("deviceModel: 'atflee_igrip_x'");
    });

    it('배치를 Firestore 한도 아래로 자른다', () => {
        const chunk = Number(fn.match(/const CHUNK = (\d+);/)[1]);
        expect(chunk).toBeLessThan(500);
    });

    it('최신 측정을 프로필 최신값으로 올린다', () => {
        // 대사건강 점수가 읽는 자리다. 여기가 안 채워지면 기록만 쌓이고
        // 근지방비 항목은 계속 "인바디 데이터 필요" 로 남는다.
        expect(fn).toContain('healthProfile');
        expect(fn).toContain('rows[rows.length - 1]');
    });
});
