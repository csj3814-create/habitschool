import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource, readRepoFile } from './source-helpers.js';

// 2026-10-20: 공유 가져오기·앱 시작 때 로그인 화면을 없애고, 공유 사진을 AI 로 알아서
// 넣게 바꾸기 전에, 바뀌면 안 되는 것을 먼저 묶는다.
// 설계: tasks/2026-10-20_공유_로그인화면_자동분류_설계.md
//
// 로그인 화면은 "보여 주는 방식" 만 바꾼다. 누가 사진을 받아 가고 어느 계정에
// 넣는지는 그대로 Firebase 로그인과 서버가 정한다.

const APP = readAppSource();
const AUTH = readRepoFile('js/auth.js');
const RUNTIME = readFunctionsSource();
const SHARED_UPLOAD = readRepoFile('functions/shared-upload.js');

const body = (source, start, end = '\n}\n') => {
    const parts = source.split(start);
    if (parts.length < 2) throw new Error(`찾지 못함: ${start}`);
    return parts[1].split(end)[0];
};

describe('사진은 로그인이 확인된 계정만 받아 가고 분류한다', () => {
    it('claimSharedUpload 는 로그인을 요구한다', () => {
        const claim = body(SHARED_UPLOAD, 'exports.claimSharedUpload = onCall(', '\n);');
        expect(claim).toMatch(/if \(!request\.auth\?\.uid\) \{\s*throw new HttpsError\("unauthenticated"/);
    });

    it('classifySharedHealthImage 는 로그인을 요구한다', () => {
        const classify = body(RUNTIME, 'exports.classifySharedHealthImage = onCall(', '\n);');
        expect(classify).toMatch(/if \(!request\.auth\) \{\s*throw new HttpsError\("unauthenticated"/);
    });

    it('받아 가면 서버에서 바로 지운다', () => {
        const claim = body(SHARED_UPLOAD, 'exports.claimSharedUpload = onCall(', '\n);');
        expect(claim.lastIndexOf('await file.delete(')).toBeGreaterThan(claim.indexOf('await file.download()'));
    });
});

describe('공유 처리는 로그인 확인 뒤에만 돈다', () => {
    const listener = body(AUTH, 'export function setupAuthListener(callbacks) {', '\n}\n');
    const signedOut = body(AUTH, 'function handleSignedOutAuthState(callbacks) {');

    it('로그인됨 갈래에서 handleAppEntryDeepLink 를 부른다', () => {
        const signedInBranch = listener.split('if (user) {')[1];
        expect(signedInBranch).toContain('window.handleAppEntryDeepLink({ initialTab: targetTab })');
    });

    it('로그아웃 갈래에서는 부르지 않는다', () => {
        expect(signedOut).not.toContain('handleAppEntryDeepLink');
    });
});

describe('로그아웃이면 지금처럼 로그인 화면(또는 체험 화면)', () => {
    const signedOut = body(AUTH, 'function handleSignedOutAuthState(callbacks) {');

    it('로그인 화면을 띄운다', () => {
        expect(signedOut).toContain("document.getElementById('login-modal').style.display = 'flex'");
    });

    it('체험 중이던 사람은 체험 화면으로 되돌린다', () => {
        expect(signedOut).toContain('window.restoreGuestDemoIfAvailable?.()');
    });

    it('리디렉트 로그인·카메라 복귀 복원은 그대로 먼저 본다', () => {
        expect(signedOut.indexOf('shouldKeepPendingGoogleRedirectRecovery(')).toBeLessThan(signedOut.indexOf("style.display = 'flex'"));
        expect(signedOut.indexOf('shouldDeferLoggedOutShellForMediaPicker()')).toBeLessThan(signedOut.indexOf("style.display = 'flex'"));
    });
});

describe('공유 사진을 넣는 순서', () => {
    const flow = body(APP, 'async function handleSharedUploadDeepLink(');

    it('칸에 넣기 전에 오늘 기록을 다 읽는다 — 어느 칸이 비었는지 알아야 한다', () => {
        const loaded = flow.indexOf('await loadDataForSelectedDate(');
        expect(loaded).toBeGreaterThan(-1);
        expect(loaded).toBeLessThan(flow.indexOf('importSharedBodyCompositionCsv('));
        expect(loaded).toBeLessThan(flow.indexOf('importSharedFilesToBodyComposition('));
        expect(loaded).toBeLessThan(flow.indexOf('openSharedImportSheetFlow('));
    });

    it('체성분 CSV 와 Fitdays 는 시트 없이 체성분으로 간다', () => {
        expect(flow.indexOf('importSharedBodyCompositionCsv(')).toBeLessThan(flow.indexOf('openSharedImportSheetFlow('));
        expect(flow.indexOf('isBodyCompositionShareSource(shareFrom)')).toBeLessThan(flow.indexOf('openSharedImportSheetFlow('));
    });

    it('회원이 먼저 고르면 AI 가 자동으로 넣지 않는다', () => {
        const sheet = body(APP, 'async function openSharedImportSheetFlow(');
        expect(sheet).toMatch(/if \(!session \|\| session\.resolving \|\| session\.manuallyPicked\) return;/);
    });

    it('자동으로 넣어도 저장 버튼을 누르기 전에는 기록 문서에 쓰지 않는다', () => {
        const resolve = body(APP, 'async function resolveSharedImportTarget(');
        expect(resolve).not.toMatch(/setDoc\(|updateDoc\(|saveDailyLog|runTransaction\(/);
    });
});

// 식단 칸은 끼니 이름이 아니라 순서다(① 첫 번째 식사 ~ ④ 네 번째 식사, 2026-03 부터).
// 그래서 공유든 고르기든 "찍은 시간순으로 다음 빈 칸" 이 맞다.
describe('식단 사진은 찍은 시간순으로 다음 빈 칸에', () => {
    it('공유와 사진 고르기 버튼이 같은 함수로 앞 칸부터 채운다', () => {
        expect(body(APP, 'async function importSharedFilesToDiet(files) {')).toContain('await importDietFilesIntoEmptySlots(files);');
        const spread = body(APP, 'function spreadMultipleDietFiles(input) {');
        expect(spread).toContain("importDietFilesIntoEmptySlots(files, { source: 'picker' })");
        const importer = body(APP, 'async function importDietFilesIntoEmptySlots(');
        expect(importer).toContain("entries.sort((a, b) => a.time.localeCompare(b.time));");
        expect(importer).toContain("const categories = ['breakfast', 'lunch', 'dinner', 'snack'];");
        expect(APP).toMatch(/function getEmptyDietSlots\(\) \{\s*return \['breakfast', 'lunch', 'dinner', 'snack'\]/);
    });
});
