/**
 * Fitdays 내보내기 CSV 를 체성분 기록으로 바꾼다.
 *
 * atflee iGrip X 는 전용 앱이 없고 Fitdays 로 기록한다. Fitdays 는 CSV 를 내보낼
 * 수 있고, 안드로이드에서는 그 파일을 **공유 시트로 바로** 해빛스쿨에 건넬 수 있다
 * (manifest 의 share_target). 다운로드 폴더를 뒤질 일이 없다.
 *
 * 사진 판독과 달리 여기서는 AI 를 쓰지 않는다. 숫자를 읽는 일이지 판독이 아니고,
 * 지금까지 잰 것이 한 번에 들어온다 — 변화 추이 표가 첫날부터 의미를 갖는 건 이쪽이다.
 *
 * 열 이름은 Fitdays 버전과 언어마다 다르다. 그래서 **관대하게 맞추되, 무엇을
 * 무엇으로 읽었는지 돌려준다.** 못 알아본 열도 같이 돌려준다 — 조용히 추측하면
 * 틀린 숫자가 점수에 들어가고 아무도 모른다.
 */

/** 사람 범위를 벗어난 값은 버린다. 서버 판독과 같은 기준. */
export const BODY_COMPOSITION_RANGES = Object.freeze({
    weight: { min: 20, max: 300 },
    smm: { min: 5, max: 100 },
    fat: { min: 0.5, max: 150 },
    bodyFatPct: { min: 1, max: 75 },
    visceral: { min: 1, max: 60 },
    bmr: { min: 500, max: 5000 },
    bodyWater: { min: 5, max: 150 },
    protein: { min: 1, max: 60 },
    boneMass: { min: 0.5, max: 10 },
    bmi: { min: 8, max: 80 }
});

const FIELD_LABELS = Object.freeze({
    date: '측정일',
    weight: '체중',
    smm: '골격근량',
    fat: '체지방량',
    bodyFatPct: '체지방률',
    visceral: '내장지방',
    bmr: '기초대사량',
    bodyWater: '체수분',
    protein: '단백질',
    boneMass: '무기질',
    bmi: 'BMI'
});

// 별칭은 정규화된 형태로 적는다 (소문자, 영숫자·한글만). 단위 표기는 정규화
// 단계에서 이미 떨어져 나간다.
const FIELD_ALIASES = Object.freeze({
    date: ['time', 'date', 'datetime', 'measuretime', 'measuredate', 'testtime', '측정시간', '측정일', '측정일시', '날짜', '시간'],
    weight: ['weight', 'bodyweight', '체중', '몸무게'],
    // 제지방량(leanbodymass)은 **일부러 뺐다** — 뼈·장기·체수분을 포함해서 다른
    // 값이고, 그걸 골격근량으로 쓰면 근지방비 점수가 통째로 틀어진다.
    smm: ['skeletalmuscle', 'skeletalmusclemass', 'musclemass', 'muscle', '골격근량', '근육량'],
    fat: ['fatmass', 'bodyfatmass', '체지방량'],
    bodyFatPct: ['bodyfat', 'bodyfatpercentage', 'bodyfatrate', 'fat', 'fatpercentage', '체지방률'],
    visceral: ['visceralfat', 'visceralfatindex', 'visceralfatlevel', '내장지방', '내장지방레벨', '내장지방지수'],
    bmr: ['bmr', 'basalmetabolicrate', 'basalmetabolism', 'metabolism', '기초대사량'],
    bodyWater: ['bodywater', 'water', 'moisture', 'bodymoisture', '체수분', '수분'],
    protein: ['protein', '단백질'],
    boneMass: ['bonemass', 'bone', 'bonemineral', '무기질', '골량', '뼈무게'],
    bmi: ['bmi', 'bodymassindex', '체질량지수']
});

const NUMERIC_FIELDS = Object.keys(BODY_COMPOSITION_RANGES);

/** 열 이름을 비교할 수 있는 형태로 줄인다. "Body Fat (%)" -> "bodyfat". */
export function normalizeHeader(value) {
    return String(value || '')
        .replace(/﻿/g, '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/[^a-z0-9가-힣]/g, '');
}

/** 구분자를 고른다. 일부 지역 설정에서는 세미콜론으로 나온다. */
function detectDelimiter(headerLine) {
    const counts = [',', ';', '\t'].map((d) => [d, headerLine.split(d).length]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 1 ? counts[0][0] : ',';
}

/** 따옴표를 존중하는 한 줄 쪼개기. 값 안에 구분자가 든 CSV 가 실제로 있다. */
export function splitCsvLine(line, delimiter = ',') {
    const cells = [];
    let current = '';
    let quoted = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                current += ch;
            }
            continue;
        }
        if (ch === '"') {
            quoted = true;
            continue;
        }
        if (ch === delimiter) {
            cells.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
}

/** 숫자 칸을 읽는다. "72.4 kg", "23,9"(소수 쉼표) 같은 표기를 견딘다. */
export function parseNumericCell(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;

    // 소수 쉼표: 쉼표가 하나뿐이고 뒤가 1~2자리면 소수점으로 본다.
    const commaDecimal = /^-?\d+,\d{1,2}$/.test(text);
    const cleaned = commaDecimal ? text.replace(',', '.') : text.replace(/,/g, '');

    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
}

/** 날짜 칸에서 YYYY-MM-DD 를 꺼낸다. 시각은 버린다 — 기록은 하루 단위다. */
export function parseDateCell(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;

    const iso = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!iso) return null;

    const [, year, rawMonth, rawDay] = iso;
    const month = Number(rawMonth);
    const day = Number(rawDay);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function clampToRange(field, value) {
    const spec = BODY_COMPOSITION_RANGES[field];
    if (!spec || value === null) return null;
    if (value < spec.min || value > spec.max) return null;
    return Math.round(value * 100) / 100;
}

/**
 * 헤더에서 열 위치를 찾는다.
 *
 * 한 필드에 여러 열이 맞으면 **첫 번째만** 쓴다. 두 번째가 같은 이름의 다른
 * 단위일 때가 있는데, 어느 쪽이 맞는지 알 방법이 없으면 고르지 않는 게 낫다.
 */
export function mapHeaders(headerCells = []) {
    const normalized = headerCells.map(normalizeHeader);
    const mapping = {};
    const usedIndexes = new Set();

    Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => {
        for (const alias of aliases) {
            const index = normalized.findIndex((header, i) => header === alias && !usedIndexes.has(i));
            if (index === -1) continue;
            mapping[field] = index;
            usedIndexes.add(index);
            return;
        }
    });

    const unmatched = headerCells
        .map((header, index) => ({ header: String(header || '').trim(), index }))
        .filter((entry) => entry.header && !usedIndexes.has(entry.index))
        .map((entry) => entry.header);

    return { mapping, unmatched };
}

/**
 * CSV 원문을 기록 목록으로 바꾼다.
 *
 * 돌려주는 것:
 *   rows       날짜 오름차순, 하루에 하나(같은 날은 마지막 측정)
 *   matched    무엇을 무엇으로 읽었는지 — 화면이 사람에게 보여 줘야 한다
 *   unmatched  못 알아본 열 이름 — 숨기지 않는다
 *   skipped    버린 줄 수와 이유
 */
export function parseBodyCompositionCsv(text = '') {
    const clean = String(text || '').replace(/^﻿/, '');
    const lines = clean.split(/\r\n|\r|\n/).filter((line) => line.trim());
    const emptyResult = (error, unmatched = []) => ({
        rows: [],
        matched: [],
        unmatched,
        skipped: { noDate: 0, noValue: 0 },
        error
    });

    if (lines.length < 2) return emptyResult('empty');

    const delimiter = detectDelimiter(lines[0]);
    const { mapping, unmatched } = mapHeaders(splitCsvLine(lines[0], delimiter));

    if (mapping.date === undefined) return emptyResult('no_date_column', unmatched);

    const byDate = new Map();
    const skipped = { noDate: 0, noValue: 0 };

    for (let i = 1; i < lines.length; i += 1) {
        const cells = splitCsvLine(lines[i], delimiter);
        const date = parseDateCell(cells[mapping.date]);
        if (!date) {
            skipped.noDate += 1;
            continue;
        }

        const row = { date };
        NUMERIC_FIELDS.forEach((field) => {
            const index = mapping[field];
            if (index === undefined) return;
            const value = clampToRange(field, parseNumericCell(cells[index]));
            if (value !== null) row[field] = value;
        });

        // 체지방량 열이 없고 체지방률만 있으면 계산한다. 추측이 아니라 산수다.
        // 계산한 값이라는 표시를 남겨 화면이 그렇게 말할 수 있게 한다.
        if (row.fat === undefined && row.bodyFatPct !== undefined && row.weight !== undefined) {
            const derived = clampToRange('fat', (row.weight * row.bodyFatPct) / 100);
            if (derived !== null) {
                row.fat = derived;
                row.fatDerived = true;
            }
        }

        if (!NUMERIC_FIELDS.some((field) => row[field] !== undefined)) {
            skipped.noValue += 1;
            continue;
        }

        // 같은 날 여러 번 쟀으면 마지막 줄을 남긴다. Fitdays 는 오래된 것부터 쓴다.
        byDate.set(date, row);
    }

    const matched = Object.keys(mapping)
        .filter((field) => field === 'date' || NUMERIC_FIELDS.includes(field))
        .map((field) => ({ field, label: FIELD_LABELS[field] || field }));

    return {
        rows: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
        matched,
        unmatched,
        skipped,
        error: ''
    };
}

export { FIELD_LABELS as BODY_COMPOSITION_FIELD_LABELS };
