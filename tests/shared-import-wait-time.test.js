import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { SHARED_IMPORT_TIMING_STEPS, createSharedImportTimeline } from '../js/shared-import-timing.js';

// 2026-11-06 대표: 공유한 사진을 등록할 때 단계마다 오래 걸린다.
// 공유부터 분류까지 16.4초(운영 로그 중앙값). 앱 코드를 다시 받고, 기록을 두 번 읽고,
// 서버에 있는 사진을 폰이 또 올렸다. tasks/2026-11-05_공유_사진_등록_대기시간_계획.md

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const functionsRequire = createRequire(resolve(ROOT_DIR, 'functions/shared-upload.js'));

// ── 서버: 받기와 분류가 같은 파일을 쓴다 ────────────────────────────────
function fakeBucket(files) {
    const makeFile = (path) => ({
        async getMetadata() {
            const entry = files.get(path);
            if (!entry) throw Object.assign(new Error('not found'), { code: 404 });
            return [entry.metadata];
        },
        async download() {
            const entry = files.get(path);
            if (!entry) throw Object.assign(new Error('not found'), { code: 404 });
            return [entry.body];
        },
        async setMetadata({ metadata }) {
            const entry = files.get(path);
            if (!entry) throw Object.assign(new Error('not found'), { code: 404 });
            entry.metadata.metadata = { ...entry.metadata.metadata, ...metadata };
            return [entry.metadata];
        },
        async delete() {
            files.delete(path);
        }
    });
    return { file: makeFile };
}

describe('서버: 사진은 다 쓴 뒤에 지운다', () => {
    const admin = functionsRequire('firebase-admin');
    const genai = functionsRequire('@google/generative-ai');
    const sharedUpload = functionsRequire('./shared-upload.js');
    const ID = 'a'.repeat(32);
    const PATH = `shared_uploads/${ID}`;
    const auth = { uid: 'member' };
    let files;
    let modelParts;

    const put = ({ type = 'image/jpeg', size = 1000, body = Buffer.from('photo') } = {}) => {
        files.set(PATH, {
            body,
            metadata: { contentType: type, size: String(size), timeCreated: new Date().toISOString(), metadata: {} }
        });
    };
    const claim = (data = {}) => sharedUpload.claimSharedUpload.run({ auth, data: { id: ID, ...data } });
    const classify = (data = {}) => sharedUpload.classifySharedHealthImage.run({ auth, data: { sharedUploadId: ID, fileCount: 1, ...data } });

    beforeEach(() => {
        files = new Map();
        modelParts = null;
        process.env.GEMINI_API_KEY = 'test-key';
        vi.spyOn(admin, 'storage').mockImplementation(() => ({ bucket: () => fakeBucket(files) }));
        vi.spyOn(genai.GoogleGenerativeAI.prototype, 'getGenerativeModel').mockImplementation(() => ({
            generateContent: async (parts) => {
                modelParts = parts;
                return { response: { text: () => '{"category":"diet","confidence":0.97,"reason":"음식","exerciseMode":null}' } };
            }
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('받기가 먼저 끝나면 분류가 끝난 뒤 지운다', async () => {
        put();
        const claimed = await claim({ keepForClassify: true });
        expect(claimed.found).toBe(true);
        expect(files.has(PATH)).toBe(true);

        const classified = await classify();
        expect(classified.classification.category).toBe('diet');
        expect(files.has(PATH)).toBe(false);
    });

    it('분류가 먼저 끝나도 회원은 사진을 받는다 — 먼저 지우면 공유가 통째로 실패한다', async () => {
        put();
        await classify();
        expect(files.has(PATH)).toBe(true);

        const claimed = await claim({ keepForClassify: true });
        expect(claimed.found).toBe(true);
        expect(files.has(PATH)).toBe(false);
    });

    it('동시에 돌아도 둘 다 성공하고 파일이 남지 않는다', async () => {
        put();
        const [claimed, classified] = await Promise.all([claim({ keepForClassify: true }), classify()]);
        expect(claimed.found).toBe(true);
        expect(classified.success).toBe(true);
        expect(files.has(PATH)).toBe(false);
    });

    it('저장소가 동시 쓰기를 409 로 돌려보내면 다시 써서 지운다', async () => {
        // 스테이징 실측: 두 쪽이 같은 때 표시를 쓰면 한쪽은 늘 409 를 받는다.
        const entry = { deleted: false, metadata: { claimed: '1' } };
        let calls = 0;
        const file = {
            async setMetadata({ metadata }) {
                calls += 1;
                if (calls === 1) throw Object.assign(new Error('conflict'), { code: 409 });
                entry.metadata = { ...entry.metadata, ...metadata };
                return [{ metadata: entry.metadata }];
            },
            async delete() { entry.deleted = true; }
        };
        await sharedUpload._test.releaseSharedUpload(file, 'classified');
        expect(calls).toBe(2);
        expect(entry.deleted).toBe(true);
    });

    it('표시를 끝내 못 남겨도 회원의 공유를 막지 않는다 — 한 시간 청소가 지운다', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const file = {
            async setMetadata() { throw Object.assign(new Error('conflict'), { code: 409 }); },
            async delete() { throw new Error('should not delete'); }
        };
        await expect(sharedUpload._test.releaseSharedUpload(file, 'claimed')).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalled();
    });

    it('분류하지 않는 공유는 받자마자 지운다', async () => {
        put();
        await claim();
        expect(files.has(PATH)).toBe(false);
    });

    it('모델에 서버의 원본을 넘기고 폰이 올린 사진을 요구하지 않는다', async () => {
        put({ body: Buffer.from('original') });
        await classify();
        const part = modelParts.find((item) => item?.inlineData);
        expect(part.inlineData).toEqual({ data: Buffer.from('original').toString('base64'), mimeType: 'image/jpeg' });
    });

    it('큰 파일·GIF·없는 파일은 모델을 부르지 않고 웹에 예전 길을 알린다', async () => {
        put({ size: sharedUpload._test.SHARED_CLASSIFY_MAX_BYTES + 1 });
        expect((await classify()).fallback).toBe(true);
        files.clear();
        put({ type: 'image/gif' });
        expect((await classify()).fallback).toBe(true);
        files.clear();
        expect((await classify()).fallback).toBe(true);
        expect(modelParts).toBeNull();
    });

    it('예전 웹이 보낸 사진으로도 그대로 분류한다 — 배포 사이에 낡은 코드가 돈다', async () => {
        const result = await sharedUpload.classifySharedHealthImage.run({
            auth,
            data: { imageUrl: 'data:image/jpeg;base64,AAAA', fileCount: 1 }
        });
        expect(result.classification.category).toBe('diet');
    });

    it('로그인 없이는 분류도 기록도 못 한다', async () => {
        await expect(sharedUpload.classifySharedHealthImage.run({ data: { sharedUploadId: ID } })).rejects.toThrow();
        await expect(sharedUpload.reportSharedImportTiming.run({ data: {} })).rejects.toThrow();
    });

    it('잘못된 id 는 저장소에 묻지 않는다', async () => {
        await expect(classify({ sharedUploadId: '../../secret' })).rejects.toThrow();
    });
});

// ── 서버: 단계 기록 ────────────────────────────────────────────────────
describe('단계 기록은 시간만 남긴다', () => {
    const { _test } = functionsRequire('./shared-upload.js');

    it('웹과 서버가 같은 단계 목록을 쓴다', () => {
        expect([..._test.SHARED_IMPORT_TIMING_STEPS]).toEqual([...SHARED_IMPORT_TIMING_STEPS]);
    });

    it('목록에 없는 값은 버린다', () => {
        const line = _test.sanitizeSharedImportTiming({
            trace: 'abcd1234',
            outcome: 'placed',
            target: 'sleep',
            method: 'auto',
            uid: 'member-uid',
            email: 'a@b.c',
            steps: { sheet_open: 9000.4, weight: 72, claim_done: -1, target_set: 'x' }
        });
        expect(line).toEqual({ trace: 'abcd1234', outcome: 'placed', target: 'sleep', method: 'auto', steps: { sheet_open: 9000 } });
    });

    it('마음은 넣을 곳이 아니다 — 마음 탭 사진은 수면 기록이다', () => {
        const line = _test.sanitizeSharedImportTiming({ trace: 'abcd1234', target: 'mind', steps: { sheet_open: 1 } });
        expect(line.target).toBeUndefined();
    });

    it('시각 없는 기록과 이상한 trace 는 남기지 않는다', () => {
        expect(_test.sanitizeSharedImportTiming({ trace: 'abcd1234', steps: {} })).toBeNull();
        expect(_test.sanitizeSharedImportTiming({ trace: 'member-uid', steps: { sheet_open: 1 } })).toBeNull();
    });
});

describe('웹의 단계 기록', () => {
    it('같은 단계는 처음 시각만, 새 단계가 없으면 보내지 않는다', () => {
        let clock = 100;
        const timeline = createSharedImportTimeline({ now: () => clock, trace: 'abcd1234' });
        timeline.mark('sheet_open');
        clock = 200;
        timeline.mark('sheet_open');
        timeline.mark('아무거나');
        timeline.setInfo({ method: 'tap' });
        expect(timeline.takeReport('placed')).toEqual({ trace: 'abcd1234', outcome: 'placed', method: 'tap', steps: { sheet_open: 100 } });
        expect(timeline.takeReport('closed')).toBeNull();
        timeline.mark('save_done');
        expect(timeline.takeReport('saved').steps).toEqual({ sheet_open: 100, save_done: 200 });
    });
});

// ── 콜드 스타트 ────────────────────────────────────────────────────────
describe('공유 함수는 자기 코드만 읽고 뜬다', () => {
    const INDEX = read('functions/index.js');

    it('회원이 기다리는 네 함수가 목록에 있고, 배포 때는 전체를 내보낸다', () => {
        const list = INDEX.split('const SHARED_UPLOAD_FAST_START_FUNCTIONS = [')[1].split('];')[0];
        ['receiveSharedUpload', 'claimSharedUpload', 'classifySharedHealthImage', 'reportSharedImportTiming']
            .forEach((name) => expect(list).toContain(`"${name}"`));
        expect(INDEX.indexOf('process.env.FUNCTION_TARGET')).toBeLessThan(INDEX.indexOf('require("./runtime")'));
        const all = INDEX.split('} else {')[1];
        ['receiveSharedUpload,', 'claimSharedUpload,', 'classifySharedHealthImage,', 'reportSharedImportTiming,', 'cleanupSharedUploads,']
            .forEach((name) => expect(all).toContain(name));
    });

    // 2026-11-06 스테이징: 로그인한 호출마다 'The default Firebase app does not exist' 로 죽었다.
    // firebase-functions 가 로그인 확인용 앱을 자기 이름으로 만들어서, "앱이 하나라도 있으면 초기화 안 함"
    // 조건이 기본 앱 없이 통과했다. 가짜 저장소로는 안 보이므로 진짜 firebase-admin 을 띄운다.
    const bucketNameInFreshProcess = (setup) => execFileSync(process.execPath, ['-e', `
        const admin = require('firebase-admin');
        ${setup}
        const { _test } = require('./shared-upload.js');
        process.stdout.write(_test.sharedUploadBucket().name);
    `], {
        cwd: resolve(ROOT_DIR, 'functions'),
        encoding: 'utf8',
        env: {
            ...process.env,
            FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-test', storageBucket: 'demo-test.example' }),
            GCLOUD_PROJECT: 'demo-test',
        },
    });

    it('함수 라이브러리가 만든 앱만 있어도 기본 앱을 만들어 저장소를 쓴다', () => {
        expect(bucketNameInFreshProcess("admin.initializeApp({ projectId: 'demo-test' }, '__FIREBASE_FUNCTIONS_SDK__');"))
            .toBe('demo-test.example');
    }, 30000);

    it('아무 앱도 없을 때도, 기본 앱이 이미 있을 때도 저장소를 쓴다', () => {
        expect(bucketNameInFreshProcess('')).toBe('demo-test.example');
        expect(bucketNameInFreshProcess('admin.initializeApp();')).toBe('demo-test.example');
    }, 30000);

    it('shared-upload.js 는 runtime.js 를 부르지 않는다', () => {
        expect(read('functions/shared-upload.js')).not.toContain('require("./runtime")');
        expect(read('functions/runtime.js')).not.toContain('exports.classifySharedHealthImage');
    });
});

// ── 서비스 워커 ────────────────────────────────────────────────────────
function loadServiceWorker({ hostname = 'habitschool.web.app', fetchImpl }) {
    const listeners = {};
    const store = new Map();
    const keyOf = (input) => (typeof input === 'string' ? input : input.url);
    const cache = {
        match: async (input) => store.get(keyOf(input))?.clone(),
        put: async (input, response) => { store.set(keyOf(input), response.clone()); },
        addAll: async () => {},
        delete: async (input) => store.delete(keyOf(input))
    };
    const origin = `https://${hostname}`;
    const scope = {
        location: new URL(`${origin}/sw.js`),
        addEventListener: (type, handler) => { listeners[type] = handler; },
        registration: {},
        clients: {},
        navigator: {}
    };
    const context = {
        self: scope,
        URL,
        Response,
        Request,
        Headers,
        Promise,
        Set,
        Map,
        console: { log() {}, warn() {}, info() {}, error() {} },
        setTimeout,
        clearTimeout,
        fetch: fetchImpl,
        importScripts: () => {},
        firebase: {
            initializeApp: () => {},
            messaging: () => ({ onBackgroundMessage: () => {} })
        },
        caches: {
            open: async () => cache,
            match: async (input) => store.get(keyOf(input))?.clone(),
            keys: async () => [],
            delete: async () => true
        }
    };
    vm.runInNewContext(read('sw.js'), context);
    const dispatch = async (url, init = {}) => {
        let responded;
        const waits = [];
        const request = { url, method: 'GET', headers: new Headers(), mode: init.mode || 'cors' };
        listeners.fetch({
            request,
            respondWith: (promise) => { responded = promise; },
            waitUntil: (promise) => waits.push(promise)
        });
        return { response: responded ? await responded : undefined, waits };
    };
    return { dispatch, store, origin };
}

const jsResponse = (text) => new Response(text, { status: 200, headers: { 'content-type': 'text/javascript' } });

describe('앱 코드는 기기에 있는 것을 바로 쓴다', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('처음엔 네트워크로 받아 넣어 두고, 다음부터는 네트워크를 기다리지 않는다', async () => {
        const fetchImpl = vi.fn(async () => jsResponse('v1'));
        const { dispatch, origin } = loadServiceWorker({ fetchImpl });
        const url = `${origin}/js/app-core.js?v=578`;

        expect(await (await dispatch(url)).response.text()).toBe('v1');
        expect(fetchImpl).toHaveBeenCalledTimes(1);

        const second = await dispatch(url);
        expect(await second.response.text()).toBe('v1');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('로그인·사진 받기와 회선을 다투지 않게 잠시 뒤에 새로 받아, 다음 열기에 닿는다', async () => {
        let body = 'v1';
        const fetchImpl = vi.fn(async () => jsResponse(body));
        const { dispatch, origin } = loadServiceWorker({ fetchImpl });
        const url = `${origin}/js/app-core.js?v=578`;
        await dispatch(url);

        body = 'hotfix';
        const opened = await dispatch(url);
        expect(await opened.response.text()).toBe('v1');
        expect(fetchImpl).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(8000);
        await Promise.all(opened.waits);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(await (await dispatch(url)).response.text()).toBe('hotfix');
    });

    it('버전을 올리면 주소가 달라 곧바로 새 파일을 받는다', async () => {
        const fetchImpl = vi.fn(async (input) => jsResponse(String(input.url || input)));
        const { dispatch, origin } = loadServiceWorker({ fetchImpl });
        await dispatch(`${origin}/js/app-core.js?v=578`);
        const next = await dispatch(`${origin}/js/app-core.js?v=579`);
        expect(await next.response.text()).toContain('v=579');
    });

    it('JS 자리에 온 HTML 은 넣어 두지 않는다 — 넣어 두면 모듈 로드가 계속 실패한다', async () => {
        const fetchImpl = vi.fn(async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
        const { dispatch, origin, store } = loadServiceWorker({ fetchImpl });
        await dispatch(`${origin}/js/missing.js?v=578`);
        expect(store.size).toBe(0);
    });

    it('뒤에서 받다 실패해도 지금 쓰는 파일은 그대로다', async () => {
        const fetchImpl = vi.fn(async () => jsResponse('v1'));
        const { dispatch, origin } = loadServiceWorker({ fetchImpl });
        const url = `${origin}/js/app-core.js?v=578`;
        await dispatch(url);
        fetchImpl.mockImplementation(async () => { throw new Error('offline'); });
        const opened = await dispatch(url);
        await vi.advanceTimersByTimeAsync(8000);
        await Promise.all(opened.waits);
        expect(await (await dispatch(url)).response.text()).toBe('v1');
    });

    it('오프라인에 캐시도 없으면 503 이다', async () => {
        const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
        const { dispatch, origin } = loadServiceWorker({ fetchImpl });
        expect((await dispatch(`${origin}/js/app-core.js?v=578`)).response.status).toBe(503);
    });

    it('HTML 은 지금처럼 늘 네트워크로 받는다 — 새 버전을 알 수 있는 유일한 길이다', async () => {
        const html = () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
        const fetchImpl = vi.fn(async () => html());
        const { dispatch, origin } = loadServiceWorker({ fetchImpl });
        await dispatch(`${origin}/?v=578`, { mode: 'navigate' });
        await dispatch(`${origin}/index.html`, { mode: 'navigate' });
        await dispatch(`${origin}/index.html`, { mode: 'navigate' });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('버전 없는 파일은 지금처럼 네트워크 먼저다', async () => {
        const fetchImpl = vi.fn(async () => jsResponse('x'));
        const { dispatch, origin } = loadServiceWorker({ fetchImpl });
        await dispatch(`${origin}/js/app-core.js`);
        await dispatch(`${origin}/js/app-core.js`);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('로컬에서는 고친 파일이 바로 보인다', async () => {
        const fetchImpl = vi.fn(async () => jsResponse('x'));
        const { dispatch, origin } = loadServiceWorker({ hostname: 'localhost', fetchImpl });
        await dispatch(`${origin}/js/app-core.js?v=578`);
        await dispatch(`${origin}/js/app-core.js?v=578`);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});

// ── 기록 읽기 ──────────────────────────────────────────────────────────
describe('오늘 기록을 두 번 읽지 않는다', () => {
    const APP = read('js/app-core.js');
    const sliceFn = (start) => {
        const from = APP.indexOf(start);
        return APP.slice(from, APP.indexOf('\n}\n', from) + 3);
    };
    const harness = () => {
        const context = {
            Promise,
            Date,
            console: { warn() {} },
            auth: { currentUser: { uid: 'member' } },
            loads: [],
            result: {}
        };
        const source = `
            const DAILY_LOG_LOAD_REUSE_MS = 60000;
            let _latestDailyLogLoad = null;
            ${sliceFn('function noteDailyLogLoadStarted(')}
            ${sliceFn('async function ensureDailyLogLoaded(')}
            function loadDataForSelectedDate(date) {
                const finish = noteDailyLogLoadStarted(auth.currentUser.uid, date);
                return new Promise((resolve) => { loads.push({ date, done: () => { finish(); resolve(); } }); });
            }
            result.ensure = ensureDailyLogLoaded;
            result.load = loadDataForSelectedDate;
        `;
        vm.runInNewContext(source, context);
        return context;
    };
    const flush = () => new Promise((done) => setImmediate(done));

    it('막 시작한 읽기가 있으면 새로 읽지 않고 그것을 기다린다', async () => {
        const { result, loads } = harness();
        result.load('2026-11-06');
        let ready = false;
        result.ensure('2026-11-06').then(() => { ready = true; });
        await flush();
        expect(loads.length).toBe(1);
        expect(ready).toBe(false);
        loads[0].done();
        await flush();
        expect(ready).toBe(true);
    });

    it('시작한 읽기가 없으면 읽는다', async () => {
        const { result, loads } = harness();
        let ready = false;
        result.ensure('2026-11-06').then(() => { ready = true; });
        await flush();
        expect(loads.length).toBe(1);
        loads[0].done();
        await flush();
        expect(ready).toBe(true);
    });

    it('다른 날을 읽고 있으면 그 날을 쓰지 않는다', async () => {
        const { result, loads } = harness();
        result.load('2026-11-05');
        result.ensure('2026-11-06');
        await flush();
        expect(loads.map((load) => load.date)).toEqual(['2026-11-05', '2026-11-06']);
    });

    it('기다리는 사이에 새 읽기가 시작되면 앞 읽기는 버려지므로 새 읽기까지 기다린다', async () => {
        const { result, loads } = harness();
        result.load('2026-11-06');
        let ready = false;
        result.ensure('2026-11-06').then(() => { ready = true; });
        await flush();
        result.load('2026-11-06');
        loads[0].done();
        await flush();
        expect(ready).toBe(false);
        loads[1].done();
        await flush();
        expect(ready).toBe(true);
    });

    it('진짜 읽기 함수가 끝날 때 표시한다 — 빠뜨리면 공유가 영원히 기다린다', () => {
        const load = APP.split('async function loadDataForSelectedDate(dateStr) {')[1].split('\n}\n')[0];
        expect(load).toContain('const finishDailyLogLoad = noteDailyLogLoadStarted(user.uid, selectedDateStr);');
        const finallyBlock = load.split('} finally {')[1];
        expect(finallyBlock.indexOf('finishDailyLogLoad();')).toBeLessThan(finallyBlock.indexOf('if (thisGeneration !== _loadDataGeneration) return;'));
    });

    it('로그인 직후 공유 처리를 지체 없이 시작한다', () => {
        const auth = read('js/auth.js');
        expect(auth).toMatch(/appEntryFocus === 'shared-upload'\) \{[\s\S]{0,120}setTimeout\(runAppEntryDeepLink, 0\);/);
    });
});

// ── 분류 길 ────────────────────────────────────────────────────────────
describe('공유 흐름이 서버 분류를 쓴다', () => {
    const APP = read('js/app-core.js');
    const flow = APP.split('async function handleSharedUploadDeepLink(')[1].split('\n}\n')[0];

    it('분류·받기를 동시에 시작하고 첫 장만 분류가 끝날 때까지 남긴다', () => {
        const classify = flow.indexOf('requestSharedUploadClassification(uploadIds[0]');
        expect(classify).toBeGreaterThan(-1);
        expect(classify).toBeLessThan(flow.indexOf('await claimPromise'));
        expect(flow).toContain('claimSharedUploadFiles(uploadIds, { keepFirstForClassify: classifyOnServer })');
        const claimFn = APP.split('async function claimSharedUploadFiles(')[1].split('\n}\n')[0];
        expect(claimFn).toContain('keepForClassify: keepFirstForClassify && index === 0');
    });

    it('체성분 앱에서 온 것은 분류하지 않고 받자마자 지운다', () => {
        expect(flow).toContain('uploadIds.length > 0 && !isBodyCompositionShareSource(shareFrom)');
    });

    it('서버가 못 봤으면 예전처럼 사진을 줄여 보낸다', () => {
        const fn = APP.split('async function resolveSharedImportClassification(')[1].split('\n}\n')[0];
        expect(fn).toContain('if (server?.fallback) {');
        expect(fn).toContain('return classifySharedImportFiles(files);');
    });

    it('공유와 상관없는 저장을 공유 기록에 섞지 않는다', () => {
        // 칸에 넣은 뒤 첫 저장만 잰다. 그 뒤로는 기록이 끝난다.
        const save = APP.slice(APP.indexOf("markSharedImportStep('save_done');"));
        expect(save.slice(0, 120)).toContain("finishSharedImportTiming('saved');");
        // 저장하지 않으면 시간이 지나 끝난다.
        const placed = APP.split('async function resolveSharedImportTarget(')[1].split('\n}\n')[0];
        expect(placed).toContain('expireSharedImportTimingLater();');
        // 고르지 않고 닫거나 시트를 거치지 않은 길은 바로 끝난다.
        const close = APP.split('function closeSharedImportSheet(')[1].split('\n}\n')[0];
        expect(close).toContain("finishSharedImportTiming('closed');");
        expect(flow).toContain("finishSharedImportTiming(importedCount > 0 ? 'placed' : 'failed');");
    });

    it('재는 일이 등록을 기다리게 하지 않는다', () => {
        const report = APP.split('function reportSharedImportTiming(outcome) {')[1].split('\n}\n')[0];
        expect(report).not.toContain('await ');
        expect(report).toContain('.catch(');
    });

    it('공유 시트에 마음은 없다 — 마음 탭 사진은 수면 기록이다', () => {
        const html = read('index.html');
        expect(html).toContain(`chooseSharedImportTarget('sleep')`);
        expect(html).not.toContain(`chooseSharedImportTarget('mind')`);
    });
});
