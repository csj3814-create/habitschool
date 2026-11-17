import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = readFileSync(resolve(ROOT_DIR, 'functions/runtime.js'), 'utf8');

// 2026-11-16 제보: "걷기 운동인데 중강도가 맞나? 기준은 뭔가?"
// 같은 걷기를 모델이 그때그때 다르게 봤다. 시간과 거리를 읽었으면 서버가 속도로 정한다.
const src = 'function paceIntensityBySpeed(' + runtime.split('function paceIntensityBySpeed(')[1].split('\n}\n')[0] + '\n}';
// eslint-disable-next-line no-new-func
const paceIntensityBySpeed = new Function(`${src}; return paceIntensityBySpeed;`)();
const at = (type, minutes, km) => paceIntensityBySpeed(type, minutes, km);

describe('걷기는 속도로 강도를 정한다', () => {
    it('제보한 걷기(13분·1.12km, 시속 5.1km)는 중강도', () => {
        expect(at('걷기', 13, 1.12)).toBe('중강도');
    });
    it('시속 4.8km 아래는 저강도, 7.2km 부터 고강도', () => {
        expect(at('걷기', 60, 4)).toBe('저강도');
        expect(at('산책', 60, 4.8)).toBe('중강도');
        expect(at('빠르게 걷기', 60, 7.2)).toBe('고강도');
        expect(at('walking', 60, 3)).toBe('저강도');
    });
    it('러닝머신 걷기는 달리기가 아니다', () => {
        expect(at('러닝머신 걷기', 30, 2.0)).toBe('저강도');
    });
});

describe('조깅·달리기는 시속 6.4km 가 경계다', () => {
    it('시속 6.4km 아래 느린 조깅은 중강도', () => {
        expect(at('조깅', 60, 5.5)).toBe('중강도');
        expect(at('슬로우 조깅', 30, 3)).toBe('중강도');
    });
    it('6.4km 부터는 고강도, 빨라도 초고강도로 올리지 않는다', () => {
        expect(at('달리기', 60, 6.4)).toBe('고강도');
        expect(at('러닝', 30, 5)).toBe('고강도');
        expect(at('running', 60, 15)).toBe('고강도');
    });
});

describe('속도로 정하지 않는 경우는 모델 판단에 맡긴다', () => {
    it('경사·등산·계단·트레일·인터벌', () => {
        for (const type of ['경사 걷기', '등산', '계단 오르기', '트레일 러닝', '인터벌 달리기', 'incline walking']) {
            expect(at(type, 60, 4)).toBeNull();
        }
    });
    it('시간이나 거리를 못 읽었거나, 종류에 맞지 않는 속도', () => {
        expect(at('걷기', null, 3)).toBeNull();
        expect(at('걷기', 30, null)).toBeNull();
        expect(at('걷기', 10, 3)).toBeNull(); // 시속 18km 걷기는 잘못 읽은 숫자
        expect(at('러닝머신', 30, 3)).toBeNull(); // 걷기인지 달리기인지 모른다
        expect(at('자전거', 60, 20)).toBeNull();
    });
    it('정규화가 이 판정을 모델 강도보다 먼저 쓴다', () => {
        const norm = runtime.split('function normalizeExerciseAnalysis(')[1].split('\n}\n')[0];
        expect(norm).toContain('paceIntensityBySpeed(exerciseType, durationMinutes, distanceKm)');
    });
});
