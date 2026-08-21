import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import {
    VIDEO_COMPRESS_MIN_BYTES,
    canCompressVideoInBrowser,
    compressExerciseVideo,
    pickRecorderMimeType,
    shouldCompressVideoFile
} from '../js/video-compress.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('어떤 파일을 재인코딩할지 고르기', () => {
    it('작은 영상은 그냥 올린다', () => {
        // 재인코딩은 재생 속도로 걸린다. 몇 MB 아끼자고 그 시간을 쓸 이유가 없다.
        expect(shouldCompressVideoFile({ type: 'video/mp4', size: 1024 * 1024 })).toBe(false);
        expect(shouldCompressVideoFile({ type: 'video/mp4', size: VIDEO_COMPRESS_MIN_BYTES })).toBe(false);
    });

    it('큰 영상만 대상으로 삼는다', () => {
        expect(shouldCompressVideoFile({ type: 'video/mp4', size: 7 * 1024 * 1024 })).toBe(true);
        expect(shouldCompressVideoFile({ type: 'video/quicktime', size: 7 * 1024 * 1024 })).toBe(true);
    });

    it('영상이 아닌 것은 건드리지 않는다', () => {
        expect(shouldCompressVideoFile({ type: 'image/jpeg', size: 9 * 1024 * 1024 })).toBe(false);
        expect(shouldCompressVideoFile(null)).toBe(false);
        expect(shouldCompressVideoFile(undefined)).toBe(false);
    });

    it('임계값을 넘겨 받을 수 있다', () => {
        expect(shouldCompressVideoFile({ type: 'video/mp4', size: 1024 }, { minBytes: 0 })).toBe(true);
    });
});

describe('저장 형식', () => {
    it('mp4 로 담을 수 없으면 압축하지 않는다', () => {
        // webm 은 iOS Safari 가 재생하지 못한다. 압축을 못 하는 기기와 webm 을
        // 못 보는 기기가 같은 집합이라, webm 으로 저장하면 안드로이드에서 올린
        // 영상을 아이폰에서 못 여는 문제가 새로 생긴다.
        vi.stubGlobal('window', { MediaRecorder: { isTypeSupported: () => false } });
        expect(pickRecorderMimeType()).toBe('');
    });

    it('mp4 가 되면 그것을 쓴다', () => {
        vi.stubGlobal('window', {
            MediaRecorder: { isTypeSupported: (t) => t.startsWith('video/mp4') }
        });
        expect(pickRecorderMimeType()).toBe('video/mp4;codecs=avc1');
    });

    it('webm 은 후보에 없다', () => {
        vi.stubGlobal('window', {
            MediaRecorder: { isTypeSupported: (t) => t.includes('webm') }
        });
        expect(pickRecorderMimeType()).toBe('');
    });
});

describe('지원하지 않는 환경', () => {
    it('captureStream 이 없으면 압축하지 않는다', () => {
        // iOS Safari 가 여기에 해당한다. 이 방식 전체가 그것에 달려 있다.
        vi.stubGlobal('window', { MediaRecorder: function () {} });
        vi.stubGlobal('document', { createElement: () => ({}) });
        vi.stubGlobal('HTMLVideoElement', function () {});
        expect(canCompressVideoInBrowser()).toBe(false);
    });

    it('압축할 수 없으면 null 을 돌려준다', async () => {
        vi.stubGlobal('window', {});
        await expect(compressExerciseVideo({ type: 'video/mp4', size: 9 * 1024 * 1024 }))
            .resolves.toBeNull();
    });
});

describe('잘린 결과를 내보내지 않는다', () => {
    const source = readRepoFile('js/video-compress.js');
    // 낱말이 설명 주석에도 나온다. 무엇을 실제로 호출하는지 볼 때는 주석을 뺀다.
    const codeOnly = source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'))
        .join('\n');

    it('길이로도 확인한다', () => {
        // 크기만 보면 잘린 파일이 "가장 많이 줄어든" 결과로 통과한다.
        // 그대로 두면 사용자의 운동 영상이 빈 파일로 바뀐다.
        expect(source).toContain('function probeEncodedVideo(');
        expect(source).toContain('probed.durationMs < durationMs * MIN_DURATION_RATIO');
    });

    it('캔버스 경로를 쓰지 않는다', () => {
        // 캔버스는 화면이 그려질 때만 프레임이 흐른다. 전사 도중 앱을 벗어나면
        // 0초짜리 파일이 나왔다. video 스트림을 직접 담으면 길이가 보존된다.
        expect(codeOnly).toContain('video.captureStream()');
        expect(codeOnly).not.toContain('canvas.captureStream(');
        expect(codeOnly).not.toContain('requestAnimationFrame');
    });

    it('실패하면 원본을 쓴다고 분명히 적혀 있다', () => {
        expect(source).toContain('원본을 그대로 올립니다');
        expect(source).toContain('원본을 유지합니다');
    });
});

describe('업로드 경로에 붙어 있다', () => {
    const app = readRepoFile('js/app-core.js');

    it('영상 업로드 직전에 재인코딩을 시도한다', () => {
        expect(app).toMatch(/import \{[^}]*compressExerciseVideo[^}]*\} from '\.\/video-compress\.js/);
        expect(app).toContain('const compressedVideo = await compressExerciseVideo(fileToUpload');
        // null 은 실패가 아니라 "원본을 쓰라"는 뜻이다.
        expect(app).toContain('if (compressedVideo) fileToUpload = compressedVideo;');
    });

    it('용량 한도가 압축 가능 여부를 따른다', () => {
        // 못 하는 기기에서 한도만 넓히면 큰 파일이 그대로 올라가 더 나빠진다.
        expect(app).toContain('const canCompress = canCompressVideoInBrowser();');
        expect(app).toContain('canCompress ? MAX_VID_SIZE_WITH_COMPRESSION : MAX_VID_SIZE');
        // 고르는 경로가 둘이라 한쪽만 넓히면 방법에 따라 되고 안 되고가 갈린다.
        expect(app).toContain('canCompressVideoInBrowser() ? MAX_VID_SIZE_WITH_COMPRESSION : MAX_VID_SIZE');
    });

    it('너무 긴 영상은 고른 자리에서 거절한다', () => {
        // 재인코딩은 재생 속도로 걸린다. 나중에 용량 오류로 튕기면 왜인지 알 수 없다.
        expect(app).toContain('probed.durationMs > MAX_VIDEO_DURATION_MS');
        expect(app).toContain('분이 넘는 영상');
    });
});

describe('해상도에 맞는 비트레이트', () => {
    it('4K 에 1080p 용 비트레이트를 주지 않는다', async () => {
        // 캔버스 축소를 버려 출력 해상도는 원본을 따른다. 200MB 짜리는 대개 용량이
        // 아니라 해상도 때문에 크므로, 구분이 없으면 용량은 줄되 못 볼 영상이 된다.
        const { getTargetBitrate } = await import('../js/video-compress.js');
        expect(getTargetBitrate(3840, 2160)).toBeGreaterThan(getTargetBitrate(1920, 1080));
        expect(getTargetBitrate(1920, 1080)).toBeGreaterThan(getTargetBitrate(1280, 720));
    });

    it('알 수 없는 크기는 가장 낮은 값으로 떨어진다', async () => {
        const { getTargetBitrate } = await import('../js/video-compress.js');
        expect(getTargetBitrate(0, 0)).toBe(getTargetBitrate(640, 480));
    });
});
