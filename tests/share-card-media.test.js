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
