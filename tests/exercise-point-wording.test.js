import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const INDEX = readRepoFile('index.html');
const EN_INDEX = readRepoFile('en/index.html');
const APP = readRepoFile('js/app-core.js');
const POINTS = readRepoFile('functions/points-utils.js');

// 입력 버튼은 '걸음수 입력 / 운동 이미지 / 운동 영상' 인데 포인트 안내만 '유산소·근력'
// 으로 말했다. 점수가 갈리는 기준은 운동 종류가 아니라 올린 것의 종류다 — PT 사진을
// 아무리 올려도 근력으로 세지 않는다는 제보가 이 어긋남에서 나왔다.
describe('포인트 안내가 버튼과 같은 말을 쓴다', () => {
    it('안내가 올리는 것의 종류로 적혀 있다', () => {
        expect(INDEX).toContain('🏃 <strong>걸음수·운동 이미지 10+5P, 운동 영상 10+5P</strong>');
        expect(EN_INDEX).toContain('🏃 <strong>걸음수·운동 이미지 10+5P, 운동 영상 10+5P</strong>');
    });

    it('안내에 쓰인 말이 버튼에 그대로 있다', () => {
        expect(INDEX).toContain('>운동 이미지</button>');
        expect(INDEX).toContain('>운동 영상</button>');
        expect(INDEX).toContain('>걸음수 입력</button>');
    });

    it('화면에서 유산소·근력이라는 말을 쓰지 않는다', () => {
        expect(INDEX).not.toContain('유산소');
        expect(INDEX).not.toContain('근력 운동 10+5P');
        expect(APP).not.toContain("idleSub: '유산소 + 근력 · 30점'");
        expect(APP).not.toContain('8,000보부터 유산소');
    });
});

// 안내가 코드와 어긋나면 다시 같은 혼동이 생긴다. 두 자리를 나누는 실제 기준을 못박는다.
describe('안내가 실제 계산과 맞는다', () => {
    it('이미지와 걸음수는 같은 자리를 쓴다', () => {
        // getCardioCandidates 가 이미지와 8,000보를 한 목록에 담고 2개까지만 센다.
        const fn = POINTS.split('function getCardioCandidates(log) {')[1].split('\n}')[0];
        expect(fn).toContain('item.imageUrl');
        expect(fn).toContain('Number(steps.count) >= 8000');
    });

    it('영상 자리는 영상만 받는다', () => {
        const fn = POINTS.split('function getStrengthCandidates(log) {')[1].split('\n}')[0];
        expect(fn).toContain('item.videoUrl');
        expect(fn).not.toContain('imageUrl,');
    });

    it('두 자리 모두 첫 건 10점, 둘째 건 5점', () => {
        expect(POINTS).toContain("cardioIndex === 1 ? 10 : 5");
        expect(POINTS).toContain("strengthIndex === 1 ? 10 : 5");
    });
});
