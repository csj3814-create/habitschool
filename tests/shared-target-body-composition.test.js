import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource, readRepoFile } from './source-helpers.js';

// 2026-09-23 제보: Fitdays "목표 달성" 화면에서 공유 → 해빛스쿨을 골랐더니
// "공유한 사진을 찾지 못했어요. 다시 공유해 주세요."
//
// 안드로이드는 인텐트를 image/* 로 받아 해빛스쿨을 목록에 띄운다. 그런데 크롬이
// 서비스 워커에 넘기는 File 의 type 은 보낸 앱의 FileProvider 가 알려 주는 값이라
// 비어 있거나 application/octet-stream 일 수 있다. 서비스 워커는 type 이 image/ 로
// 시작하지 않으면 버렸고, 그래서 빈손이었다. CSV 도 같은 자리에서 버려지고 있었다.
//
// 사진이 들어왔더라도 갈 곳이 없었다 — 공유 시트는 식단·운동·수면뿐이었다.

const SW = readRepoFile('sw.js');
const APP = readAppSource();
const HTML = readRepoFile('index.html');
const RUNTIME = readFunctionsSource();

const body = (source, start, end = '\n}\n') => source.split(start)[1].split(end)[0];

describe('서비스 워커는 이름표가 아니라 내용으로 가린다', () => {
    const handler = body(SW, 'async function handleSharedTarget(request) {');
    const sniff = body(SW, 'async function sniffSharedFileType(file) {');

    it('type 이 image/ 가 아니라는 이유만으로 버리지 않는다', () => {
        expect(handler).not.toMatch(/\.filter\(\(file\) => String\(file\.type \|\| ''\)\.startsWith\('image\/'\)\)/);
        expect(handler).toContain('await sniffSharedFileType(file)');
    });

    it('첫 바이트로 PNG·JPEG·WEBP·HEIC 를 알아본다', () => {
        expect(sniff).toContain("return 'image/png'");
        expect(sniff).toContain("return 'image/jpeg'");
        expect(sniff).toContain("return 'image/webp'");
        expect(sniff).toContain("return 'image/heic'");
    });

    it('CSV 도 통과시킨다', () => {
        expect(sniff).toContain("return 'text/csv'");
    });

    it('알아본 종류로 다시 붙여서 보관한다', () => {
        // 앱 쪽 readPendingSharedFiles 는 저장된 type 으로 사진·CSV 를 가른다.
        expect(handler).toContain('new File([file]');
        expect(handler).toContain('type: detected');
    });

    it('빈손이면 받은 것의 모양을 남긴다', () => {
        expect(handler).toContain('storeSharedTargetDiagnostics(');
        const store = body(SW, 'async function storeSharedTargetDiagnostics(diagnostics) {');
        expect(store).toContain('diagnostics');
        expect(store).toContain('items: []');
    });

    it('내용은 남기지 않는다 — 종류·크기·확장자만', () => {
        const pushed = handler.split('diagnostics.push({')[1].split('});')[0];
        expect(pushed).toMatch(/type:/);
        expect(pushed).toMatch(/size:/);
        expect(pushed).toMatch(/ext:/);
        expect(pushed).not.toMatch(/arrayBuffer|text\(\)/);
    });
});

describe('앱은 빈손일 때 무엇이 왔는지 말한다', () => {
    const describeFn = body(APP, 'function describeEmptySharedTarget(manifest = null) {');

    it('진단이 있으면 받은 형식을 말한다', () => {
        expect(describeFn).toContain('manifest?.diagnostics');
        expect(describeFn).toContain('읽지 못했어요');
    });

    it('버그 제보에 실리도록 콘솔에 남긴다', () => {
        expect(describeFn).toContain("console.warn('[shared-target]");
    });

    it('공유 진입점이 이 문장을 쓴다', () => {
        const flow = body(APP, 'async function handleSharedUploadDeepLink() {');
        expect(flow).toContain('showToast(describeEmptySharedTarget(manifest));');
    });
});

describe('공유 시트에 체성분이 있다', () => {
    it('네 번째 선택지가 있다', () => {
        expect(HTML).toContain(`data-target="body" onclick="chooseSharedImportTarget('body')"`);
    });

    it('체성분을 고르면 사진 판독과 같은 길로 간다', () => {
        const resolve = body(APP, 'async function resolveSharedImportTarget(');
        expect(resolve).toContain("'body'");
        expect(resolve).toContain('importSharedFilesToBodyComposition(session.files)');
        const importer = body(APP, 'async function importSharedFilesToBodyComposition(files = []) {');
        expect(importer).toContain('analyzeBodyCompositionFile(image)');
    });

    it('카메라 버튼도 같은 함수를 쓴다 — 동의 확인이 한쪽에서 빠지지 않게', () => {
        const upload = body(APP, 'window.uploadBodyCompositionPhoto = async function (inputEl) {', '\n};\n');
        expect(upload).toContain('analyzeBodyCompositionFile(file)');
        const core = body(APP, 'async function analyzeBodyCompositionFile(file) {');
        expect(core).toContain('hasSensitiveDataConsent');
    });

    it('AI 분류기가 체성분을 안다', () => {
        // 모르면 수치 표를 운동 캡처로 자신 있게 보내 버린다 — 자동 배치가 걸려 있다.
        const prompt = RUNTIME.split('const SHARED_HEALTH_IMAGE_CLASSIFICATION_PROMPT = `')[1].split('`;')[0];
        expect(prompt).toContain('- body:');
        expect(prompt).toContain('exercise 가 아니라 body');
        expect(RUNTIME).toContain('["diet", "exercise", "sleep", "body", "unknown"].includes(');
    });
});

describe('Play 앱도 CSV 공유를 받는다 (APK 1.0.6)', () => {
    // Play 앱(TWA)의 공유 대상은 웹 manifest 가 아니라 APK 에 박혀 있다. 웹만 고치면
    // 크롬으로 설치한 사람만 되고, Play 앱에는 Fitdays CSV 공유에 해빛스쿨이 아예 안 뜬다.
    const ANDROID = readRepoFile('android/app/src/main/AndroidManifest.xml');
    const STRINGS = readRepoFile('android/app/src/main/res/values/strings.xml');
    const shareTarget = JSON.parse(
        STRINGS.match(/<string name="twa_share_target">(.*?)<\/string>/)[1].replace(/\\"/g, '"')
    );

    it('SEND 인텐트가 CSV 를 받는다', () => {
        const send = ANDROID.split('android.intent.action.SEND"')[1].split('</intent-filter>')[0];
        expect(send).toContain('android:mimeType="image/*"');
        expect(send).toContain('android:mimeType="text/csv"');
        // 링크·문장 공유까지 끌어오지 않도록 text/* 로 넓히지 않는다.
        expect(send).not.toContain('android:mimeType="text/*"');
    });

    it('TWA 공유 대상이 서비스 워커가 읽는 필드로 CSV 를 넘긴다', () => {
        const files = shareTarget.params.files[0];
        expect(['sharedImages', 'dietPhotos']).toContain(files.name);
        expect(files.accept).toContain('text/csv');
        expect(files.accept).toContain('image/*');
    });
});

describe('Play 앱 런처가 공유 파일을 웹에 넘긴다', () => {
    // 2026-09-23: 직접 만든 런처라 기본 LauncherActivity 의 addShareDataIfPresent 가
    // 빠져 있었다. Play 앱으로 공유하면 파일 없이 웹만 열렸다 — 식단 사진도 마찬가지.
    const LAUNCHER = readRepoFile('android/app/src/main/java/com/habitschool/app/HabitschoolLauncherActivity.kt');

    it('공유 인텐트의 파일을 꺼내 setShareParams 로 넘긴다', () => {
        expect(LAUNCHER).toContain('SharingUtils.retrieveShareDataFromIntent(intent)');
        expect(LAUNCHER).toContain('builder.setShareParams(SharingUtils.parseShareTargetJson(shareTargetJson), shareData)');
    });

    it('TWA 를 띄우는 자리에서 부른다', () => {
        const launch = LAUNCHER.split('private fun launchTrustedSurface(targetUrl: Uri) {')[1].split('\n    }\n')[0];
        expect(launch).toContain('addShareDataIfPresent(launchBuilder)');
        // 빌더를 만든 뒤, 띄우기 전에.
        expect(launch.indexOf('addShareDataIfPresent(launchBuilder)')).toBeLessThan(launch.indexOf('twaLauncher?.launch('));
    });
});

describe('종류를 모르는 파일도 일단 받는다', () => {
    // 크롬은 공유된 파일마다 보낸 앱이 알려 준 MIME 을 accept 목록과 맞춰 보고,
    // 맞지 않으면 서비스 워커에 닿기 전에 버린다. Fitdays 처럼 image/* 인텐트로
    // 보내면서 파일에는 application/octet-stream(또는 빈 값)을 다는 앱이면,
    // sniffSharedFileType 이 볼 기회조차 없다 — 크롬 PWA 와 Play 앱 둘 다
    // "공유로는 파일이 오지 않았어요" 가 됐다. 받은 뒤에 내용으로 가린다.
    it('웹 manifest 와 Play 앱이 모두 octet-stream 을 받는다', () => {
        const STRINGS = readRepoFile('android/app/src/main/res/values/strings.xml');
        const twa = JSON.parse(STRINGS.match(/<string name="twa_share_target">(.*?)<\/string>/)[1].replace(/\\"/g, '"'));
        for (const manifest of [JSON.parse(readRepoFile('manifest.json')), JSON.parse(readRepoFile('manifest-en.json'))]) {
            expect(manifest.share_target.params.files[0].accept).toContain('application/octet-stream');
        }
        expect(twa.params.files[0].accept).toContain('application/octet-stream');
    });

    it('받은 뒤에는 내용으로 가려 사진·CSV 가 아니면 버린다', () => {
        const sniff = SW.split('async function sniffSharedFileType(file) {')[1].split('\n}\n')[0];
        expect(sniff).toMatch(/return '';\s*$/);
    });
});

describe('Play 앱은 공유 파일을 옮겨 싣고, 무엇이 왔는지 알린다', () => {
    // 2026-09-24 제보 진단: {"fields":[],"files":[]} — 크롬이 빈 요청을 보냈다.
    // 크롬은 보낸 앱이 준 MIME·주소가 맞지 않으면 서비스 워커에 닿기 전에 버린다.
    const RELAY = readRepoFile('android/app/src/main/java/com/habitschool/app/SharedFileRelay.kt');
    const LAUNCHER = readRepoFile('android/app/src/main/java/com/habitschool/app/HabitschoolLauncherActivity.kt');
    const MANIFEST = readRepoFile('android/app/src/main/AndroidManifest.xml');
    const STRINGS = readRepoFile('android/app/src/main/res/values/strings.xml');
    const twa = JSON.parse(STRINGS.match(/<string name="twa_share_target">(.*?)<\/string>/)[1].replace(/\\"/g, '"'));

    it('파일을 캐시로 복사해 우리 FileProvider 로 넘긴다', () => {
        expect(RELAY).toContain('FileProvider.getUriForFile(context, authority(context), it)');
        expect(MANIFEST).toContain('android:authorities="${applicationId}.share"');
        expect(MANIFEST).toContain('android:grantUriPermissions="true"');
        expect(MANIFEST).toMatch(/android:name="androidx\.core\.content\.FileProvider"\s*android:authorities="\$\{applicationId\}\.share"\s*android:exported="false"/);
    });

    it('EXTRA_STREAM 이 없으면 ClipData 에서도 찾는다', () => {
        expect(RELAY).toContain('intent.clipData');
    });

    it('내용으로 종류를 정한다 — 서비스 워커와 같은 기준', () => {
        for (const ext of ['"png"', '"jpg"', '"webp"', '"heic"', '"csv"']) expect(RELAY).toContain(`return ${ext}`);
    });

    it('복사는 메인 스레드 밖에서, 크롬에 넘기기 전에', () => {
        expect(LAUNCHER).toContain('withContext(Dispatchers.IO)');
        expect(LAUNCHER).toContain('SharedFileRelay.prepare(this@HabitschoolLauncherActivity, intent)');
        expect(LAUNCHER).toContain('preparedShareData ?: SharingUtils.retrieveShareDataFromIntent(intent)');
    });

    it('무엇이 왔는지 title 로 보내고, 서비스 워커가 빈손일 때 남긴다', () => {
        expect(twa.params.title).toBe('title');
        expect(RELAY).toContain('"hsdiag:v1"');
        expect(SW).toContain("relay: title.startsWith('hsdiag:')");
    });
});
