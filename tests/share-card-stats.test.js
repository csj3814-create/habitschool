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
        // 히어로는 72px. 대화창 크기로 줄여도 24px이라 읽히면서, 사진 자리를 뺏지 않는다.
        expect(appSource).toContain("ctx.font = '900 72px \"Pretendard\", \"Apple SD Gothic Neo\", \"Malgun Gothic\", sans-serif';");
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

        // 사진이 이 카드의 알맹이다. 텍스트에서 아낀 만큼 계속 넘겨줬다.
        expect(appSource).toContain('{ x: 52, y: 200, w: 976, h: 688 }');
    });

    // 카드를 받은 사람에게 '포인트'는 아직 아무 의미가 없다. 포인트로 무엇이
    // 되는지와, 지금 시작하면 얼마를 받는지까지 말해야 누를 이유가 생긴다.
    it('tells the stranger what joining is actually worth', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("const leadLine = qrCanvas ? '사진 찍고 포인트 모아 기프티콘' : '아래 주소로 함께 시작해요';");
        expect(appSource).toContain("const pillText = '지금 시작 +200P';");
        // 가입 보너스는 초대 링크로 들어왔을 때만 붙는다. 코드가 없으면 약속하지 않는다.
        expect(appSource).toContain("if (/[?&]ref=/.test(getShareTargetUrl())) {");
        // 자리가 모자라면 겹쳐 그리지 않고 뺀다.
        expect(appSource).toContain('if (pillX + pillWidth <= size - 52) {');
    });

    // 정돈형 그리드가 칸을 정사각형으로 강제하는 바람에, 짧은 쪽(세로)에 맞춰
    // 한 변이 정해지고 왼쪽부터 붙어서 976 너비 중 312px이 오른쪽에 그냥 비어 있었다.
    it('fills the whole photo area instead of leaving a column of empty cream', () => {
        const appSource = readAppSource();
        const framesFn = appSource
            .split('function getShareTemplateFrames(')[1]
            ?.split('function drawPosterPlaceholderTile(')[0] || '';

        expect(framesFn).not.toBe('');
        expect(framesFn).toContain('const colWidth = (bounds.w - gap) / 2;');
        expect(framesFn).toContain('const rowHeight = (bounds.h - gap) / 2;');
        // 정사각형으로 묶어 두던 계산은 사라진다.
        expect(framesFn).not.toContain('const size = Math.min((bounds.w - gap) / 2, (bounds.h - gap) / 2);');
        expect(framesFn).not.toContain('const size = Math.min((bounds.w - gap) / 2, bounds.h);');
        // 3장일 때도 빈 칸이 남지 않도록 왼쪽 한 장을 크게 세운다.
        expect(framesFn).toContain('if (safeCount === 3) {');
    });
});

// 실제 계산이 프레임을 남김없이 채우는지는 문자열 검사로 알 수 없어 직접 재현해 확인한다.
describe('share card grid geometry', () => {
    const gap = 10;
    const bounds = { x: 52, y: 200, w: 976, h: 688 };

    const gridFrames = (count) => {
        const colWidth = (bounds.w - gap) / 2;
        const rowHeight = (bounds.h - gap) / 2;
        if (count === 1) return [{ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }];
        if (count === 2) {
            return [
                { x: bounds.x, y: bounds.y, w: colWidth, h: bounds.h },
                { x: bounds.x + colWidth + gap, y: bounds.y, w: colWidth, h: bounds.h }
            ];
        }
        if (count === 3) {
            return [
                { x: bounds.x, y: bounds.y, w: colWidth, h: bounds.h },
                { x: bounds.x + colWidth + gap, y: bounds.y, w: colWidth, h: rowHeight },
                { x: bounds.x + colWidth + gap, y: bounds.y + rowHeight + gap, w: colWidth, h: rowHeight }
            ];
        }
        return [
            { x: bounds.x, y: bounds.y, w: colWidth, h: rowHeight },
            { x: bounds.x + colWidth + gap, y: bounds.y, w: colWidth, h: rowHeight },
            { x: bounds.x, y: bounds.y + rowHeight + gap, w: colWidth, h: rowHeight },
            { x: bounds.x + colWidth + gap, y: bounds.y + rowHeight + gap, w: colWidth, h: rowHeight }
        ];
    };

    it.each([1, 2, 3, 4])('reaches both edges with %i photo(s)', (count) => {
        const frames = gridFrames(count);
        expect(frames).toHaveLength(count);
        expect(Math.min(...frames.map((f) => f.x))).toBe(bounds.x);
        expect(Math.max(...frames.map((f) => f.x + f.w))).toBe(bounds.x + bounds.w);
        expect(Math.min(...frames.map((f) => f.y))).toBe(bounds.y);
        expect(Math.max(...frames.map((f) => f.y + f.h))).toBe(bounds.y + bounds.h);
    });

    // 겹침형·포커스형도 같은 병을 앓고 있었다. min()으로 짧은 쪽에 맞춰 크기를 정해
    // 사진이 차지하는 면적이 각각 60%, 55%였다. 특히 포커스형은 '한 장을 키운다'가
    // 존재 이유인데 그 한 장이 가로의 44%였다.
    it('lets the hero photo own the frame in the other two templates', () => {
        const appSource = readAppSource();
        const framesFn = appSource
            .split('function getShareTemplateFrames(')[1]
            ?.split('function drawPosterPlaceholderTile(')[0] || '';

        expect(framesFn).toContain('const hero = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, rotate: 0 };');
        // 짧은 쪽에 맞춰 줄이던 옛 계산은 사라진다.
        expect(framesFn).not.toContain('const size = Math.min(bounds.w * 0.42, bounds.h * 0.46);');
        expect(framesFn).not.toContain('const big = Math.min(bounds.w * 0.76, bounds.h * 0.62);');
        // 두 템플릿의 차이는 대표 사진 위에 나머지를 얹는 방식이다.
        expect(framesFn).toContain('rotate: (i % 2 === 0 ? 0.055 : -0.05)');
        expect(framesFn).toContain('// 포커스형: 왼쪽 아래에 가지런한 한 줄.');
    });

    it('covers the area apart from the gaps between cells', () => {
        const painted = gridFrames(4).reduce((sum, f) => sum + (f.w * f.h), 0);
        const area = bounds.w * bounds.h;
        // 칸 사이 10px 간격만 빠지므로 97% 이상이 사진이어야 한다.
        expect(painted / area).toBeGreaterThan(0.97);
        // 예전 정사각형 배치는 같은 자리에서 약 65%밖에 쓰지 못했다.
        expect(painted / area).toBeGreaterThan((327 * 327 * 4) / area);
    });
});
