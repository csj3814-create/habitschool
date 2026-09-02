import { describe, expect, it } from 'vitest';
import {
    VIDEO_COMPRESS_MIN_BYTES,
    TARGET_UPLOAD_BYTES,
    isCompressionWorthwhile,
    shouldCompressVideoFile
} from '../js/video-compress.js';

const MB = 1024 * 1024;
const worthwhile = (sizeMB, seconds) => isCompressionWorthwhile(sizeMB * MB, seconds * 1000);

// 재인코딩은 재생 속도로 걸린다 — 60초 영상이면 60초, 그동안 한 바이트도 올라가지
// 않는다. 그래서 크기만 보고 정하면 어떤 사람은 오히려 더 오래 기다리게 된다.
describe('압축은 짧고 뚱뚱한 영상에만 값을 한다', () => {
    it('같은 10MB 라도 길이가 판단을 뒤집는다', () => {
        expect(worthwhile(10, 20)).toBe(true);    // 48초 절약 vs 20초 대기
        expect(worthwhile(10, 60)).toBe(false);   // 48초 절약 vs 60초 대기
    });

    it('길고 무거운 영상은 절약분이 커서 여전히 줄인다', () => {
        expect(worthwhile(15, 60)).toBe(true);    // 88초 절약 vs 60초 대기
    });

    it('목표 용량보다 작으면 줄일 것이 없다', () => {
        expect(TARGET_UPLOAD_BYTES).toBe(4 * MB);
        expect(worthwhile(3, 5)).toBe(false);
    });

    it('길이를 못 읽으면 크기 판단만 믿는다', () => {
        // 1차 관문(8MB)을 이미 통과한 파일이다. 길이를 모른다고 그냥 보내면
        // 예전과 같은 상태로 돌아간다.
        expect(isCompressionWorthwhile(10 * MB, 0)).toBe(true);
        expect(isCompressionWorthwhile(10 * MB, null)).toBe(true);
    });
});

describe('1차 관문은 디코딩 없이 크기만 본다', () => {
    it('5MB 로 낮췄다', () => {
        // 15MB → 8MB → 5MB. 운영 표본에서 4-8MB 구간 47개(9.4%)가 걸러지고 있었는데,
        // 그 크기에 6초면 압축이 이득이다. 판단은 길이를 아는 2차 관문에 맡긴다.
        expect(VIDEO_COMPRESS_MIN_BYTES).toBe(5 * MB);
    });

    it('5MB 를 넘는 영상만 파일을 열어 본다', () => {
        expect(shouldCompressVideoFile({ type: 'video/mp4', size: 6 * MB })).toBe(true);
        expect(shouldCompressVideoFile({ type: 'video/mp4', size: 4 * MB })).toBe(false);
    });

    it('표본의 4-8MB 구간이 이제 2차 관문까지 간다', () => {
        // 6MB · 6초 → 16초 절약 vs 6초 대기 → 압축이 이득
        expect(shouldCompressVideoFile({ type: 'video/mp4', size: 6 * MB })).toBe(true);
        expect(worthwhile(6, 6)).toBe(true);
        // 6MB · 20초 → 16초 절약 vs 20초 대기 → 그냥 올린다
        expect(worthwhile(6, 20)).toBe(false);
    });

    it('영상이 아니면 보지 않는다', () => {
        expect(shouldCompressVideoFile({ type: 'image/jpeg', size: 20 * MB })).toBe(false);
        expect(shouldCompressVideoFile(null)).toBe(false);
    });
});
