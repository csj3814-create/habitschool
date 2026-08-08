import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource } from './source-helpers.js';

// 증상: 사진을 올린 직후에는 공유 카드 썸네일이 다 나오는데, 새로고침하면
// 식단·마음 자리만 플레이스홀더로 바뀐다.
//
// 원인: 업로드 직후에는 사진이 메모리에 data URL로 있어 서버를 부르지 않는다.
// 새로고침 후에는 서버(prepareShareMediaAssets)가 썸네일을 만들어 줘야 하는데,
// 클라이언트가 이미 로컬 캐시로 해결한 운동 영상까지 같은 요청에 실어 보냈다.
// 서버는 그 영상을 통째로 내려받다가 256MiB 한도를 넘겨 컨테이너째 죽었고,
// 같은 요청의 사진들도 함께 사라졌다. 운동 칸만 멀쩡했던 이유가 이것이다.
describe('share card media preparation', () => {
    it('only asks the server for media the client could not resolve locally', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('const pendingIndexes = [];');
        expect(appSource).toContain('if (!directItems[index]) pendingIndexes.push(index);');
        expect(appSource).toContain('? await requestPreparedShareMediaAssets(pendingIndexes.map(index => items[index]))');
        // 걸러 보낸 뒤에는 응답 순서가 원래 순서와 다르다. 반드시 되돌려 매핑해야
        // 식단 자리에 마음 사진이 들어가는 뒤섞임이 생기지 않는다.
        expect(appSource).toContain('const remoteByIndex = new Map();');
        expect(appSource).toContain('remoteByIndex.set(originalIndex, remoteItems[requestIndex]);');
        expect(appSource).toContain('const preparedSrc = String(remoteByIndex.get(index)?.src || \'\').trim();');
        expect(appSource).not.toContain('const remoteItems = await requestPreparedShareMediaAssets(items);');
    });

    it('keeps one failing media item from taking down the whole share request', () => {
        const functionsSource = readFunctionsSource();

        expect(functionsSource).toContain('{ region: "asia-northeast3", memory: "512MiB", timeoutSeconds: 120 }');
        expect(functionsSource).toContain('const SHARE_VIDEO_THUMB_MAX_BYTES = 60 * 1024 * 1024;');
        expect(functionsSource).toContain('if (byteSize > SHARE_VIDEO_THUMB_MAX_BYTES) {');
        // 동시 처리하면 원본 버퍼와 base64 문자열이 겹쳐 살아 메모리가 몇 배로 튄다.
        expect(functionsSource).not.toContain('const items = await Promise.all(normalizedItems.map(async (item) => {');
        expect(functionsSource).toContain('for (const item of normalizedItems) {');
        expect(functionsSource).toContain('[prepareShareMediaAssets] item failed:');
    });

    // 증상: 갤러리 피드에는 멀쩡히 보이는 식단 사진이 공유 카드에서만 회색 칸이었다.
    // 10분을 기다려도 그대로였다.
    //
    // 원인: 장수에 따라 한 장에 허용하는 크기를 줄였다(6MB / 5장 = 1.2MB).
    // 썸네일이 아직 안 올라간 사진은 원본으로 오는데, 1.63MB짜리가 그 선에 걸려
    // 통째로 버려졌다. 크기 때문에 버리는 것은 시간이 지나도 낫지 않으므로
    // 자동 재시도로도 구할 수 없었다.
    // 서버가 있었던 유일한 이유는 캔버스 오염이었다. Storage가 CORS를 주므로
    // crossOrigin으로 직접 불러오면 오염되지 않고, 왕복 자체가 없어진다.
    // 실측: 4장 기준 서버 경유 3,980ms에 base64 2.6MB, 직접 로드 2,328ms에
    // 두 번째부터는 브라우저 HTTP 캐시라 사실상 0.
    it('draws photos straight from storage instead of round-tripping the server', () => {
        const appSource = readAppSource();

        // crossOrigin을 걸고 로드에 성공했다는 것 자체가 CORS 응답을 받았다는 뜻이다.
        expect(appSource).toContain("image.crossOrigin = 'anonymous';");
        expect(appSource).toContain('async function loadCanvasImageSource(src, { crossOrigin = true } = {}) {');
        // 사진이면 서버에 보내기 전에 직접 불러본다.
        expect(appSource).toContain('const imageUrl = candidates.find(candidate => /^https?:/i.test(candidate) && !isVideoUrl(candidate));');
        expect(appSource).toContain('return { ...item, src: imageUrl, prepared: true };');
        // 막히면 조용히 기존 서버 경로로 넘어간다 — 서버는 fallback으로 남는다.
        expect(appSource).toContain('const pendingIndexes = [];');
        // 준비 때와 그릴 때 두 번 디코드하지 않는다.
        expect(appSource).toContain('const _shareImageCache = new Map();');
    });

    // 업로드 때 썸네일 생성이 한 번 실패하면 그 사진은 영원히 원본만 남았다.
    // 갤러리도 카드도 1.6MB를 매번 내려받게 된다.
    it('repairs a thumbnail that never got made', () => {
        const appSource = readAppSource();

        // 업로드 시 한 번 더 시도하고,
        expect(appSource).toContain('for (let attempt = 0; attempt < 2 && !thumbUrl; attempt++) {');
        // 이미 놓친 사진은 카드를 그리며 디코드해 둔 이미지로 만들어 채운다.
        expect(appSource).toContain('async function backfillMissingShareThumbnails(latest, preparedMedia = []) {');
        expect(appSource).toContain('backfillMissingShareThumbnails(latest, preparedMedia).catch(() => { });');
        // 파일에서 만들 때와 백필할 때가 같은 결과여야 한다.
        expect(appSource).toContain('function createSquareThumbBlobFromImage(img, size = 300, quality = 0.6) {');
        // 한 세션에 한 자리당 한 번만 시도한다.
        expect(appSource).toContain('if (_shareThumbBackfillTried.has(field)) continue;');
        // 캐시도 갱신해야 다음 카드가 원본 대신 썸네일을 쓴다.
        expect(appSource).toContain("const [group, key] = field.split('.');");
    });

    it('does not throw away a photo just because its thumbnail is missing', () => {
        const functionsSource = readFunctionsSource();

        // 장수로 나눈 한도는 사라진다. 줄여 담을 수단이 없으면 그냥 담는다.
        expect(functionsSource).not.toContain('Math.floor(SHARE_MEDIA_ITEM_MAX_BYTES / normalizedItems.length)');
        expect(functionsSource).toContain('src = await loadShareMediaDataUrl(item.candidateUrls, SHARE_MEDIA_ITEM_MAX_BYTES);');

        // 응답 한도는 담기 전에 확인해야 한다. 담은 뒤에 재면 이미 넘긴 뒤다.
        expect(functionsSource).toContain('if (src && (responseBytes + src.length) > SHARE_MEDIA_RESPONSE_BUDGET_BYTES) {');
        expect(functionsSource).not.toContain('if (responseBytes >= SHARE_MEDIA_RESPONSE_BUDGET_BYTES) {');
        // 가장 큰 한 장(6MB)이 base64로 8MB가 되므로 예산도 8MB여야 한 장이 통째로 들어간다.
        expect(functionsSource).toContain('const SHARE_MEDIA_RESPONSE_BUDGET_BYTES = 8 * 1024 * 1024;');
    });
});
