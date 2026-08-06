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
        expect(appSource).toContain("ctx.fillText('습관학교 해빛스쿨', 58, 82);");
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
        expect(appSource).toContain('{ x: 52, y: 206, w: 976, h: 682 }');
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

// 증상: 식단 네 끼에 운동·마음까지 기록한 날, 카드에는 앞의 네 장만 담겼다.
// 잘렸다는 표시도 없어서 무엇이 빠졌는지 알 방법이 없었다.
//
// 4라는 숫자가 상수 없이 여섯 군데에 흩어져 있었다. 하나라도 남으면 증상이
// 조용히 되살아난다 — 다섯 번째 사진이 시그니처에 안 잡혀 캐시가 맞아떨어지고,
// 카드는 넉 장짜리 그대로 남는다.
describe('share card holds every photo of the day', () => {
    it('routes every cut-off point through one constant', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('const SHARE_MEDIA_MAX_COUNT = 9;');
        expect(appSource).not.toContain('Math.min(count || 0, 4)');
        expect(appSource).not.toContain('preparedMedia.slice(0, 4)');
        expect(appSource).not.toContain('buildShareMediaSignature(preparedMedia, 4)');
        expect(appSource).not.toContain('items.slice(0, 4)');
        // 옛 DOM 버전 buildShareImageGrid가 사라져서 이제 4를 기본값으로 든 상한은
        // 어디에도 남아 있지 않다. 되살아나면 여기서 걸린다.
        expect(appSource).not.toContain('maxCount = 4');
        // 시그니처가 4장에서 잘리면 다섯 번째 사진은 아예 받아오지도 않는다.
        // ensurePreparedShareMedia가 인자 없이 부르므로 기본값이 곧 실질 상한이다.
        expect(appSource).toContain('function buildShareMediaSignature(mediaItems = [], maxCount = SHARE_MEDIA_MAX_COUNT) {');
        expect(appSource).toContain('async function prepareShareMediaItems(mediaItems = [], maxCount = SHARE_MEDIA_MAX_COUNT) {');
    });

    // 서버는 메모리 때문에 한 요청 안에서 순차로 처리한다. 아홉 장을 한 번에
    // 보내면 처리 시간도 응답 크기도 같이 부푼다. 나눠 보내야 조각들이 동시에 돌고,
    // 컨테이너 하나가 지는 짐이 예전과 같아진다.
    it('splits the server request instead of stretching one call', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('const SHARE_MEDIA_REQUEST_CHUNK = 5;');
        expect(appSource).toContain('const chunkResults = await Promise.all(chunks.map(chunk => requestPreparedShareMediaChunk(chunk)));');
        // 조각이 실패해도 길이를 맞춰 돌려줘야 뒤 조각의 응답이 앞으로 당겨지지 않는다.
        expect(appSource).toContain('return Array.from({ length: chunk.length }, (_, index) => items[index] || null);');
        expect(appSource).toContain('return Array.from({ length: chunk.length }, () => null);');
    });

    // 증상: 배포 직후 갤러리를 열면 운동 썸네일만 나오고 식단·마음은 회색 칸이었다.
    // 새로고침하기 전까지 그대로였다.
    //
    // 원인: 새 컨테이너가 뜨는 첫 요청이 12초 제한을 넘겨 그 묶음이 통째로
    // 자리표시자가 됐는데, 그 결과를 '완성된 답'으로 캐시에 넣어 버렸다.
    // 시그니처가 같으면 무조건 캐시를 돌려주므로 다시 시도할 길이 없었다.
    // (운동 근력 썸네일만 멀쩡했던 건 그것만 로컬 캐시에서 읽어 서버를 안 타서다.)
    it('does not let one slow moment freeze the card into grey boxes', () => {
        const appSource = readAppSource();

        // 자리표시자가 섞였는지 기억해 두고,
        expect(appSource).toContain('const incomplete = prepared.some(item => !item?.prepared);');
        expect(appSource).toContain('_latestPreparedShareIncomplete = incomplete;');
        // 그 경우에는 캐시를 최종 답으로 쓰지 않는다.
        expect(appSource).toContain('&& (!_latestPreparedShareIncomplete || Date.now() < _latestPreparedShareRetryAt);');
        // 사용자가 새로고침하지 않아도 스스로 한 번은 다시 굽는다.
        expect(appSource).toContain('function scheduleShareMediaRetryIfIncomplete() {');
        expect(appSource).toContain('scheduleShareMediaRetryIfIncomplete();');
        // 다만 무한정 반복하지는 않는다 — 느린 서버를 더 때리기만 한다.
        expect(appSource).toContain('const SHARE_MEDIA_MAX_RETRIES = 2;');
        expect(appSource).toContain('if (_shareMediaRetryCount >= SHARE_MEDIA_MAX_RETRIES) return;');
    });
});

// 카드는 캔버스로 구운 그림 한 장이라 사진마다 붙일 DOM이 없다. 어디를 눌렀는지는
// 그릴 때 쓴 좌표와 직접 비교해서만 알 수 있고, 그러려면 그 좌표가 살아남아야 한다.
describe('share card lets you pick the hero photo', () => {
    it('stops destroying the frame coordinates while drawing', () => {
        const appSource = readAppSource();

        // 예전에는 회전한 칸을 그리며 frame.x/y를 제자리에서 덮어썼다.
        expect(appSource).not.toContain('frame.x = -(frame.w / 2);');
        expect(appSource).not.toContain('frame.y = -(frame.h / 2);');
        expect(appSource).toContain('const drawX = frame.rotate ? -(frame.w / 2) : frame.x;');
        expect(appSource).toContain('const drawY = frame.rotate ? -(frame.h / 2) : frame.y;');
    });

    it('commits the frames only after the build actually won', () => {
        const appSource = readAppSource();

        // 밀려난 빌드가 이긴 빌드의 좌표를 덮어쓰면 엉뚱한 사진이 잡힌다.
        const afterToken = appSource.split('if (buildToken !== _shareCardBuildToken) return;')[1] || '';
        expect(afterToken).not.toBe('');
        expect(afterToken.split('_latestShareFrames = asset.frames;')[0]).not.toContain('async function ');
    });

    it('reads the topmost photo first', () => {
        const appSource = readAppSource();

        // 겹침형은 나중에 그린 사진이 위에 있다. 앞에서부터 훑으면 눈에 보이지도 않는
        // 아래 깔린 칸이 먼저 잡힌다.
        expect(appSource).toContain('for (let i = frames.length - 1; i >= 0; i--) {');
        // 기울어진 칸은 누른 점을 거꾸로 돌려 놓고 재야 한다.
        expect(appSource).toContain('const cos = Math.cos(-frame.rotate);');
    });

    it('keeps the pick as photo keys, not positions', () => {
        const appSource = readAppSource();

        // 인덱스로 들고 있으면 식단·운동·마음 공개 설정을 껐다 켜는 순간 어긋난다.
        expect(appSource).toContain('function getShareMediaKey(item) {');
        expect(appSource).toContain('function applyShareMediaOrder(media = [], latest = null) {');
        expect(appSource).toContain('const preparedMedia = applyShareMediaOrder(naturalMedia, latest);');
        // 고른 순서가 렌더 키에 들어가지 않으면 캐시가 맞아떨어져 카드가 다시 구워지지 않는다.
        expect(appSource).toContain("_shareMediaOrder.keys.join('>'),");
    });

    // 정돈형에는 대표 사진이라는 자리가 없다. 눌러도 바꿀 것이 없다.
    it('offers the swap only where there is a hero to swap with', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("return _latestShareFramesTemplate !== 'grid' && _latestShareFrames.length >= 2;");
        // 안내 문구는 반드시 DOM이어야 한다. 카드에 새기면 받은 사람에게는 뜻 없는 문장이다.
        expect(appSource).not.toContain("ctx.fillText('작은 사진을 누르면");
    });
});

// 실제 계산이 프레임을 남김없이 채우는지는 문자열 검사로 알 수 없어 직접 재현해 확인한다.
describe('share card grid geometry', () => {
    const gap = 10;
    const bounds = { x: 52, y: 206, w: 976, h: 682 };

    // 5장부터는 행마다 칸 수를 달리해 가로를 남김없이 쓴다.
    const rowPlans = { 5: [2, 3], 6: [3, 3], 7: [3, 4], 8: [4, 4], 9: [3, 3, 3] };

    const planFrames = (plan) => {
        const rowHeight = (bounds.h - (gap * (plan.length - 1))) / plan.length;
        const frames = [];
        plan.forEach((cols, rowIndex) => {
            const cellWidth = (bounds.w - (gap * (cols - 1))) / cols;
            const y = bounds.y + (rowIndex * (rowHeight + gap));
            for (let i = 0; i < cols; i++) {
                frames.push({ x: bounds.x + (i * (cellWidth + gap)), y, w: cellWidth, h: rowHeight });
            }
        });
        return frames;
    };

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
        if (count === 4) {
            return [
                { x: bounds.x, y: bounds.y, w: colWidth, h: rowHeight },
                { x: bounds.x + colWidth + gap, y: bounds.y, w: colWidth, h: rowHeight },
                { x: bounds.x, y: bounds.y + rowHeight + gap, w: colWidth, h: rowHeight },
                { x: bounds.x + colWidth + gap, y: bounds.y + rowHeight + gap, w: colWidth, h: rowHeight }
            ];
        }
        return planFrames(rowPlans[count]);
    };

    // 상한이 9로 올라갔으므로 9장까지 전부 사진 영역을 꽉 채워야 한다.
    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('reaches both edges with %i photo(s)', (count) => {
        const frames = gridFrames(count);
        expect(frames).toHaveLength(count);
        expect(Math.min(...frames.map((f) => f.x))).toBe(bounds.x);
        expect(Math.max(...frames.map((f) => f.x + f.w))).toBeCloseTo(bounds.x + bounds.w, 6);
        expect(Math.min(...frames.map((f) => f.y))).toBe(bounds.y);
        expect(Math.max(...frames.map((f) => f.y + f.h))).toBeCloseTo(bounds.y + bounds.h, 6);
    });

    // 행마다 칸 수가 다르므로 '한 줄이 가로를 다 쓰는가'를 줄 단위로도 확인한다.
    // 한 줄이라도 짧으면 그 자리에 크림색 여백이 남는다.
    it.each([5, 6, 7, 8, 9])('fills every row edge to edge with %i photos', (count) => {
        const frames = gridFrames(count);
        const rows = new Map();
        frames.forEach((f) => {
            const row = rows.get(f.y) || [];
            row.push(f);
            rows.set(f.y, row);
        });
        expect(rows.size).toBe(rowPlans[count].length);
        rows.forEach((row) => {
            expect(Math.min(...row.map((f) => f.x))).toBe(bounds.x);
            expect(Math.max(...row.map((f) => f.x + f.w))).toBeCloseTo(bounds.x + bounds.w, 6);
        });
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
        expect(framesFn).toContain('// 포커스형: 왼쪽 아래에 가지런한 줄. 여섯 장부터는 두 줄이 된다.');
    });

    // 사진이 늘면 작은 사진도 같이 줄어야 사진 영역 밖으로 흘러나가지 않는다.
    // 다섯 장까지는 예전 값 그대로여서 지금 나가 있는 카드는 하나도 변하지 않는다.
    describe('thumbnail sizing as the extras pile up', () => {
        const bounds = { x: 52, y: 206, w: 976, h: 682 };
        const inset = 26;

        const metrics = (extras, baseSize, gapThumb, bandRatio, minSize, overlapRatio = 0) => {
            const rows = extras >= 6 ? 2 : 1;
            const perRow = Math.ceil(extras / rows);
            const availableWidth = bounds.w - (inset * 2);
            const widthFit = overlapRatio > 0
                ? availableWidth / (1 + ((1 - overlapRatio) * (perRow - 1)))
                : (availableWidth - (gapThumb * (perRow - 1))) / perRow;
            const heightFit = rows === 1 ? baseSize : ((bounds.h * bandRatio) - gapThumb) / rows;
            return { rows, perRow, size: Math.max(minSize, Math.min(baseSize, widthFit, heightFit)) };
        };

        const spotlight = (extras) => metrics(extras, 158, 14, 0.40, 100);
        const overlap = (extras) => metrics(extras, 190, 14, 0.42, 110, 46 / 190);

        it.each([1, 2, 3, 4, 5])('leaves the %i-extra layouts exactly as they were', (extras) => {
            expect(spotlight(extras).size).toBe(158);
            expect(spotlight(extras).rows).toBe(1);
            expect(overlap(extras).size).toBe(190);
            expect(overlap(extras).rows).toBe(1);
        });

        it.each([6, 7, 8])('splits %i extras into two rows and shrinks them', (extras) => {
            expect(spotlight(extras).rows).toBe(2);
            expect(overlap(extras).rows).toBe(2);
            expect(spotlight(extras).size).toBeLessThan(158);
            expect(overlap(extras).size).toBeLessThan(190);
        });

        // 카톡 대화창에서 1/3로 줄어도 무엇을 찍었는지는 알아볼 수 있어야 한다.
        it.each([1, 2, 3, 4, 5, 6, 7, 8])('never shrinks %i extras below the readable floor', (extras) => {
            expect(spotlight(extras).size).toBeGreaterThanOrEqual(100);
            expect(overlap(extras).size).toBeGreaterThanOrEqual(110);
        });

        it.each([1, 2, 3, 4, 5, 6, 7, 8])('keeps the %i-extra row inside the photo area', (extras) => {
            const s = spotlight(extras);
            const spotlightRun = (s.size * s.perRow) + (14 * (s.perRow - 1));
            expect(spotlightRun).toBeLessThanOrEqual(bounds.w - (inset * 2) + 0.001);

            const o = overlap(extras);
            const step = o.size - (o.size * (46 / 190));
            const overlapRun = o.size + (step * (o.perRow - 1));
            expect(overlapRun).toBeLessThanOrEqual(bounds.w - (inset * 2) + 0.001);
        });

        // 두 줄이 되어도 대표 사진의 절반 이상을 덮으면 '포커스형'이라 부를 수 없다.
        it.each([6, 7, 8])('keeps the %i-extra band from swallowing the hero', (extras) => {
            const s = spotlight(extras);
            const band = (s.size * s.rows) + (14 * (s.rows - 1));
            expect(band / bounds.h).toBeLessThan(0.45);
        });
    });

    // 빠지는 면적이 '칸 사이 간격뿐'인지를 비율이 아니라 정확한 값으로 확인한다.
    // 비율로 두면 장수가 늘 때마다 기준을 느슨하게 고치게 되고, 그러면
    // 어딘가 빈 칸이 생겨도 눈치채지 못한다.
    it.each([4, 5, 6, 7, 8, 9])('loses exactly the gap area and nothing else with %i photos', (count) => {
        const frames = gridFrames(count);
        const plan = rowPlans[count] || [2, 2];
        const rowHeight = (bounds.h - (gap * (plan.length - 1))) / plan.length;
        const gapArea = (bounds.w * (plan.length - 1) * gap)
            + plan.reduce((sum, cols) => sum + (rowHeight * (cols - 1) * gap), 0);

        const painted = frames.reduce((sum, f) => sum + (f.w * f.h), 0);
        expect(painted).toBeCloseTo((bounds.w * bounds.h) - gapArea, 6);
        // 예전 정사각형 배치는 같은 자리에서 약 65%밖에 쓰지 못했다.
        expect(painted / (bounds.w * bounds.h)).toBeGreaterThan((327 * 327 * 4) / (bounds.w * bounds.h));
    });
});
