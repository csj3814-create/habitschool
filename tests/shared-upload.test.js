import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const require = createRequire(import.meta.url);
const { _test } = require('../functions/shared-upload.js');

const APP = read('js/app-core.js');
const INDEX = read('functions/index.js');
const HOSTING = [JSON.parse(read('firebase.json')).hosting].flat().find((h) => h.target === 'app');
const STORAGE_RULES = read('storage.rules');
const LAUNCHER = read('android/app/src/main/java/com/habitschool/app/HabitschoolLauncherActivity.kt');
const CLIENT = read('android/app/src/main/java/com/habitschool/app/SharedUploadClient.kt');
const ROUTES = read('android/app/src/main/java/com/habitschool/app/AppRoutes.kt');

// 2026-09-24: Play 앱 1.0.7 로 Fitdays 결과 화면을 공유하면, 앱은 사진을 복사까지
// 했는데(진단 `copied:jpg`) 크롬이 웹으로 넘기며 파일만 버렸다(`files:[]`).
// 크롬 153 의 회귀라 웹 코드로는 못 고친다. 1.0.8 부터 앱이 파일을 서버에 먼저
// 올리고 id 만 웹에 넘긴다.
describe('서버는 사진과 CSV 만 받는다', () => {
    const { sniffSharedUpload } = _test;

    it('사진은 내용으로 가린다', () => {
        expect(sniffSharedUpload(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
        expect(sniffSharedUpload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png');
        const webp = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary');
        expect(sniffSharedUpload(webp)).toBe('image/webp');
    });

    it('보낸 쪽이 사진이라고 해도 내용이 아니면 받지 않는다', () => {
        expect(sniffSharedUpload(Buffer.from('<html>hi</html>'), 'image/jpeg')).toBeNull();
        expect(sniffSharedUpload(Buffer.alloc(0), 'image/jpeg')).toBeNull();
    });

    it('CSV 는 CSV 라고 했고 글자만 있을 때만', () => {
        expect(sniffSharedUpload(Buffer.from('date,weight\n2026-09-24,72.1\n'), 'text/csv')).toBe('text/csv');
        expect(sniffSharedUpload(Buffer.from('date,weight\n'), 'text/plain')).toBeNull();
        expect(sniffSharedUpload(Buffer.from([0x61, 0x00, 0x62]), 'text/csv')).toBeNull();
    });

    it('한 파일 8MB, 한 시간이 지나면 버린다', () => {
        expect(_test.SHARED_UPLOAD_MAX_BYTES).toBe(8 * 1024 * 1024);
        expect(_test.SHARED_UPLOAD_TTL_MS).toBe(60 * 60 * 1000);
    });
});

describe('서버 쪽 연결', () => {
    it('세 함수를 내보내고 시험용 객체는 내보내지 않는다', () => {
        expect(INDEX).toContain('receiveSharedUpload,');
        expect(INDEX).toContain('claimSharedUpload,');
        expect(INDEX).toContain('cleanupSharedUploads,');
        expect(INDEX).not.toContain('...require("./shared-upload")');
    });

    it('앱이 부르는 주소가 함수로 이어진다', () => {
        const rule = HOSTING.rewrites.find((r) => r.source === '/api/shared-upload');
        expect(rule?.function).toEqual({ functionId: 'receiveSharedUpload', region: 'asia-northeast3' });
        expect(CLIENT).toContain('"${AppRoutes.WEB_ORIGIN}/api/shared-upload"');
    });

    it('회원 앱은 서버에 머무는 파일을 직접 읽을 수 없다', () => {
        // 받아 가는 것은 로그인한 callable 뿐. Storage 규칙에 길을 열지 않는다.
        expect(STORAGE_RULES).not.toContain('shared_uploads');
        expect(STORAGE_RULES).toMatch(/match \/\{allPaths=\*\*\} \{\s*allow read, write: if false;/);
    });

    it('받아 가면 바로 지운다', () => {
        const src = read('functions/shared-upload.js');
        const claim = src.split('exports.claimSharedUpload = onCall(')[1].split('\n);')[0];
        expect(claim).toContain('if (!request.auth?.uid)');
        expect(claim.indexOf('file.download()')).toBeLessThan(claim.lastIndexOf('file.delete('));
    });
});

describe('앱은 크롬을 거치지 않고 넘긴다', () => {
    it('올리기에 성공하면 크롬에 파일을 넘기지 않는다', () => {
        expect(LAUNCHER).toContain('SharedUploadClient.uploadAll(files)');
        expect(LAUNCHER).toContain('launchUrlOverride = AppRoutes.sharedUploadUri(uploadIds)');
        expect(LAUNCHER).toContain('if (!isShareIntent() || shareDeliveredByUpload) return');
    });

    it('실패하면 예전 길로 연다', () => {
        // 하나라도 못 올리면 null → 크롬 share target 으로.
        expect(CLIENT).toContain('ids += upload(file) ?: return null');
        expect(LAUNCHER).toContain('withTimeoutOrNull(SHARED_UPLOAD_TIMEOUT_MS)');
    });

    it('웹 주소에 id 를 싣고 앱 버전도 함께 보낸다', () => {
        expect(ROUTES).toContain('"sharedUploads" to ids.joinToString(",")');
        expect(ROUTES).toContain('"focus" to "shared-upload"');
        const fn = ROUTES.split('fun sharedUploadUri(')[1].split('fun exerciseImportUri(')[0];
        expect(fn).toContain('withNativeVersion(');
    });
});

describe('웹은 서버에서 받아 기존 공유 흐름을 탄다', () => {
    it('주소의 id 를 읽어 넘긴다', () => {
        expect(APP).toContain("sharedUploads: String(url.searchParams.get('sharedUploads') || '').trim(),");
        expect(APP).toContain('await handleSharedUploadDeepLink({ sharedUploads: params.sharedUploads });');
    });

    it('서버가 준 모양의 id 만 받는다', () => {
        expect(APP).toContain('const SHARED_UPLOAD_ID_PATTERN = /^[a-f0-9]{32}$/;');
    });

    it('받아 온 파일이 없으면 그렇다고 말한다', () => {
        const fn = APP.split('async function handleSharedUploadDeepLink(')[1].split('\n}\n')[0];
        expect(fn).toContain('claimSharedUploadFiles(uploadIds)');
        expect(fn).toContain('공유한 파일을 받아 오지 못했어요');
    });

    it('실패를 삼키지 않고 남긴다', () => {
        const fn = APP.split('async function claimSharedUploadFiles(')[1].split('\n}\n')[0];
        expect(fn).toContain("console.warn('[shared-upload] 받아 오지 못했다:'");
    });

    it('처리한 뒤 주소에서 id 를 지운다', () => {
        const clear = APP.split('function clearAppEntryDeepLinkParams(')[1].split('\n}\n')[0];
        expect(clear).toContain("'sharedUploads'");
    });
});
