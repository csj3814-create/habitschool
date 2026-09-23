import { describe, expect, it } from 'vitest';
import {
    parseBodyCompositionCsv,
    parseNumericCell,
    parseDateCell,
    splitCsvLine,
    normalizeHeader,
    mapHeaders
} from '../js/body-composition-csv.js';

describe('열 이름 맞추기', () => {
    it('단위 표기와 대소문자·공백을 무시한다', () => {
        expect(normalizeHeader('Body Fat (%)')).toBe('bodyfat');
        expect(normalizeHeader(' Skeletal Muscle Mass(kg) ')).toBe('skeletalmusclemass');
        expect(normalizeHeader('﻿Time')).toBe('time');
    });

    it('영어 헤더를 읽는다', () => {
        const { mapping } = mapHeaders(['Time', 'Weight(kg)', 'BMI', 'Body Fat(%)', 'Visceral Fat', 'BMR(kcal)']);
        expect(mapping.date).toBe(0);
        expect(mapping.weight).toBe(1);
        expect(mapping.bmi).toBe(2);
        expect(mapping.bodyFatPct).toBe(3);
        expect(mapping.visceral).toBe(4);
        expect(mapping.bmr).toBe(5);
    });

    it('한글 헤더도 읽는다', () => {
        const { mapping } = mapHeaders(['측정시간', '체중', '골격근량', '내장지방', '기초대사량']);
        expect(mapping.date).toBe(0);
        expect(mapping.weight).toBe(1);
        expect(mapping.smm).toBe(2);
        expect(mapping.visceral).toBe(3);
        expect(mapping.bmr).toBe(4);
    });

    it('제지방량을 골격근량으로 읽지 않는다', () => {
        // 제지방량은 뼈·장기·체수분을 포함한다. 그걸 골격근량으로 쓰면
        // 근지방비(smm ÷ fat) 점수가 통째로 틀어진다.
        const { mapping, unmatched } = mapHeaders(['Time', 'Lean Body Mass']);
        expect(mapping.smm).toBeUndefined();
        expect(unmatched).toContain('Lean Body Mass');
    });

    it('못 알아본 열을 숨기지 않는다', () => {
        const { unmatched } = mapHeaders(['Time', 'Weight', 'Heart Index', '체형']);
        expect(unmatched).toEqual(['Heart Index', '체형']);
    });

    it('같은 필드에 두 열이 맞으면 첫 번째만 쓴다', () => {
        const { mapping } = mapHeaders(['Time', 'Weight', 'Body Weight']);
        expect(mapping.weight).toBe(1);
    });
});

describe('칸 읽기', () => {
    it('단위가 붙어 있어도 숫자를 꺼낸다', () => {
        expect(parseNumericCell('72.4 kg')).toBe(72.4);
        expect(parseNumericCell('1,580')).toBe(1580);
        expect(parseNumericCell('23.9%')).toBe(23.9);
    });

    it('소수 쉼표를 소수점으로 읽는다', () => {
        expect(parseNumericCell('23,9')).toBe(23.9);
    });

    it('숫자가 없으면 null', () => {
        expect(parseNumericCell('')).toBeNull();
        expect(parseNumericCell('--')).toBeNull();
        expect(parseNumericCell(null)).toBeNull();
    });

    it('날짜에서 시각을 떼어 낸다', () => {
        expect(parseDateCell('2026-09-23 07:41:02')).toBe('2026-09-23');
        expect(parseDateCell('2026/9/3')).toBe('2026-09-03');
    });

    it('날짜가 아니면 null', () => {
        expect(parseDateCell('yesterday')).toBeNull();
        expect(parseDateCell('2026-13-01')).toBeNull();
    });

    it('따옴표 안의 구분자를 존중한다', () => {
        expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
        expect(splitCsvLine('"he said ""hi""",2')).toEqual(['he said "hi"', '2']);
    });
});

describe('CSV 전체 읽기', () => {
    const CSV = [
        'Time,Weight(kg),BMI,Body Fat(%),Skeletal Muscle(kg),Visceral Fat,BMR(kcal),Body Water(kg)',
        '2026-09-20 07:10:00,72.8,23.8,24.5,31.0,8,1575,40.1',
        '2026-09-21 07:05:00,72.6,23.7,24.2,31.1,8,1578,40.2',
        '2026-09-23 07:41:02,72.4,23.6,23.9,31.2,8,1580,40.3'
    ].join('\n');

    it('줄마다 하나씩 날짜 오름차순으로 읽는다', () => {
        const result = parseBodyCompositionCsv(CSV);
        expect(result.error).toBe('');
        expect(result.rows.map((r) => r.date)).toEqual(['2026-09-20', '2026-09-21', '2026-09-23']);
        expect(result.rows[2].weight).toBe(72.4);
        expect(result.rows[2].smm).toBe(31.2);
        expect(result.rows[2].visceral).toBe(8);
        expect(result.rows[2].bmr).toBe(1580);
    });

    it('체지방량 열이 없으면 체지방률과 체중으로 계산하고 그렇다고 표시한다', () => {
        const result = parseBodyCompositionCsv(CSV);
        const last = result.rows[2];
        expect(last.fat).toBeCloseTo(72.4 * 23.9 / 100, 2);
        expect(last.fatDerived).toBe(true);
    });

    it('체지방량 열이 있으면 계산하지 않는다', () => {
        const withFat = [
            'Time,Weight,Body Fat,Fat Mass',
            '2026-09-23,72.4,23.9,17.0'
        ].join('\n');
        const row = parseBodyCompositionCsv(withFat).rows[0];
        expect(row.fat).toBe(17);
        expect(row.fatDerived).toBeUndefined();
    });

    it('무엇을 읽었고 무엇을 못 읽었는지 돌려준다', () => {
        const result = parseBodyCompositionCsv('Time,Weight,Heart Index\n2026-09-23,72.4,5');
        expect(result.matched.map((m) => m.field)).toContain('weight');
        expect(result.matched.find((m) => m.field === 'weight').label).toBe('체중');
        expect(result.unmatched).toEqual(['Heart Index']);
    });

    it('같은 날 여러 번 쟀으면 마지막 것을 남긴다', () => {
        const dup = [
            'Time,Weight',
            '2026-09-23 07:00,72.4',
            '2026-09-23 21:00,73.1'
        ].join('\n');
        const rows = parseBodyCompositionCsv(dup).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0].weight).toBe(73.1);
    });

    it('사람 범위를 벗어난 값은 버린다', () => {
        // OCR 도 CSV 도 소수점을 흘린다. 체중 724 가 BMI 와 점수에 들어가면
        // 화면은 멀쩡한 채로 틀린 조언을 한다.
        const bad = 'Time,Weight,Body Fat\n2026-09-23,724,23.9';
        const row = parseBodyCompositionCsv(bad).rows[0];
        expect(row.weight).toBeUndefined();
        expect(row.bodyFatPct).toBe(23.9);
    });

    it('날짜가 없는 줄은 이유와 함께 센다', () => {
        const messy = 'Time,Weight\n,72.4\nnot a date,71.0\n2026-09-23,72.4';
        const result = parseBodyCompositionCsv(messy);
        expect(result.rows).toHaveLength(1);
        expect(result.skipped.noDate).toBe(2);
    });

    it('값이 하나도 없는 줄은 버린다', () => {
        const result = parseBodyCompositionCsv('Time,Weight\n2026-09-23,\n2026-09-24,72.4');
        expect(result.rows).toHaveLength(1);
        expect(result.skipped.noValue).toBe(1);
    });

    it('세미콜론 구분과 BOM, CRLF 를 견딘다', () => {
        const csv = '﻿Time;Weight;Body Fat\r\n2026-09-23;72,4;23,9\r\n';
        const row = parseBodyCompositionCsv(csv).rows[0];
        expect(row.weight).toBe(72.4);
        expect(row.bodyFatPct).toBe(23.9);
    });

    it('날짜 열을 못 찾으면 추측하지 않고 그렇게 말한다', () => {
        const result = parseBodyCompositionCsv('Something,Weight\nx,72.4');
        expect(result.error).toBe('no_date_column');
        expect(result.rows).toEqual([]);
    });

    it('빈 파일은 빈 파일이라고 말한다', () => {
        expect(parseBodyCompositionCsv('').error).toBe('empty');
        expect(parseBodyCompositionCsv('Time,Weight').error).toBe('empty');
    });
});
