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
});
