import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

// 카드는 1080px로 만들지만 카톡 대화창에서는 350px 안팎으로 보인다(약 1/3).
// 그 크기에서 30px 아래 글자는 뭉개져 노이즈가 된다. 실제로 재보면
// 부제 18px→5.8px, 성취 라벨 14px→4.5px, 헤더 칩 13px→4.2px였다.
// 그래서 안 읽히는 요소를 걷어내고 성취 하나만 크게 넣는다.
describe('share card readability at chat-thumbnail size', () => {
    it('gives the achievement one big number instead of three small ones', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('function buildSharePosterHeadline(');
        expect(appSource).toContain('drawSharePosterHeadline(ctx, latest, settings, size);');
        // 히어로는 96px. 대화창 크기로 줄여도 31px이라 확실히 읽힌다.
        expect(appSource).toContain("ctx.font = '900 96px \"Pretendard\", \"Apple SD Gothic Neo\", \"Malgun Gothic\", sans-serif';");
        // 세 칸으로 나눠 34px씩 쓰던 방식은 사라진다.
        expect(appSource).not.toContain('function collectSharePosterStats(');
        expect(appSource).not.toContain('function drawSharePosterStatBand(');
    });

    it('picks the streak first because it is the number worth showing off', () => {
        const appSource = readAppSource();
        const headlineFn = appSource
            .split('function buildSharePosterHeadline(')[1]
            ?.split('function drawSharePosterHeadline(')[0] || '';

        expect(headlineFn).not.toBe('');
        // 하루치 점수는 내일이면 사라지지만 연속일은 쌓아 온 시간이다.
        expect(headlineFn).toContain('if (streak >= 2) {');
        expect(headlineFn).toContain("hero = `${streak}일 연속`;");
        // 연속이 없으면 풀 루틴 → 채운 항목 → 포인트 순으로 내려간다.
        expect(headlineFn).toContain("} else if (isFullRoutine) {");
        expect(headlineFn).toContain("hero = '풀 루틴 달성';");
        expect(headlineFn).toContain("} else if (doneCount > 0) {");
        expect(headlineFn).toContain("} else if (points > 0) {");
        // 히어로가 이미 말한 걸 배지가 반복하면 같은 숫자가 두 번 나온다.
        expect(headlineFn).toContain("if (isFullRoutine && !used.has('full')) badgeParts.push('풀 루틴');");
        expect(headlineFn).toContain("if (points > 0 && !used.has('points')) badgeParts.push(`${points}P`);");
    });

    it('drops the elements that only became noise at reading size', () => {
        const appSource = readAppSource();

        // 부제("오늘 식단·운동·마음 흐름을 담았어요") — 18px, 정보도 없었다.
        expect(appSource).not.toContain('function buildShareSubtitle(');
        expect(appSource).not.toContain('function getShareCategoryTags(');
        // 타일마다 붙던 카테고리 라벨 — 사진을 보면 안다.
        expect(appSource).not.toContain("drawCanvasChip(ctx, frame.x + 14, frame.y + frame.h - 48");
        // 푸터의 초대코드 텍스트와 마무리 문구 — QR이 이미 코드를 담고 있다.
        expect(appSource).not.toContain('`초대코드 ${inviteCode}`');
        expect(appSource).not.toContain("ctx.fillText('좋은 습관, 같이 이어가요'");
        // 헤더 칩(13px) 대신 이름과 날짜를 그대로 크게 쓴다.
        expect(appSource).not.toContain("drawCanvasChip(ctx, chipX, 50, 'HABIT SCHOOL'");
        expect(appSource).toContain("ctx.font = '800 36px \"Pretendard\", \"Apple SD Gothic Neo\", \"Malgun Gothic\", sans-serif';");
    });

    it('keeps the card intact when there is nothing to boast about', () => {
        const appSource = readAppSource();
        const drawFn = appSource
            .split('function drawSharePosterHeadline(')[1]
            ?.split('\nasync function ')[0] || '';

        expect(drawFn).not.toBe('');
        // 성취가 없으면 히어로 줄 자체를 안 그린다. 0을 크게 박으면 실패 보고가 된다.
        expect(drawFn).toContain('if (!hero) return;');
        // 히어로가 길면(세 자리 연속일) 배지를 통째로 뺀다. 겹쳐 그리느니 없는 게 낫다.
        expect(drawFn).toContain('if (pillX + pillWidth <= size - 58) {');
    });

    it('grows the photos with the space the text gave back', () => {
        const appSource = readAppSource();

        // 사진이 이 카드의 알맹이다. 654 -> 664, 시작도 234 -> 224로 올렸다.
        expect(appSource).toContain('{ x: 52, y: 224, w: 976, h: 664 }');
    });
});
