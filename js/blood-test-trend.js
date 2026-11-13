/**
 * 혈액검사 추이 — 검사를 옆으로 나란히 놓고 수치가 어떻게 움직였는지 본다.
 *
 * 예전 이력 표는 검사마다 등급과 혈당·중성지방·당화혈색소 세 칸뿐이었다. 콜레스테롤이나
 * 간수치가 지난번보다 올랐는지 보려면 결과지를 다시 꺼내야 했다 (2026-11-13 제보).
 *
 * 가장 최근 검사를 왼쪽에 둔다. 휴대폰에서는 옆으로 밀지 않아도 최신 값이 먼저 보인다.
 */

// better: 낮을수록 좋으면 -1, 높을수록 좋으면 1, 어느 쪽이라고 말할 수 없으면 0.
export const BLOOD_TREND_METRICS = Object.freeze([
    { key: 'glucose', ko: '공복혈당', en: 'Fasting glucose', better: -1 },
    { key: 'hba1c', ko: '당화혈색소', en: 'HbA1c', better: -1 },
    { key: 'triglyceride', ko: '중성지방', en: 'Triglycerides', better: -1 },
    { key: 'totalCholesterol', ko: '총콜레스테롤', en: 'Total cholesterol', better: -1 },
    { key: 'hdl', ko: 'HDL', en: 'HDL', better: 1 },
    { key: 'ldl', ko: 'LDL', en: 'LDL', better: -1 },
    { key: 'ast', ko: 'AST(GOT)', en: 'AST(GOT)', better: -1 },
    { key: 'alt', ko: 'ALT(GPT)', en: 'ALT(GPT)', better: -1 },
    { key: 'ggt', ko: 'GGT', en: 'GGT', better: -1 },
    { key: 'creatinine', ko: '크레아티닌', en: 'Creatinine', better: 0 },
    { key: 'gfr', ko: 'eGFR', en: 'eGFR', better: 1 },
    { key: 'uricAcid', ko: '요산', en: 'Uric acid', better: -1 },
    { key: 'hemoglobin', ko: '헤모글로빈', en: 'Hemoglobin', better: 0 },
    { key: 'vitaminD', ko: '비타민 D', en: 'Vitamin D', better: 0 },
    { key: 'tsh', ko: 'TSH', en: 'TSH', better: 0 },
    { key: 'bpSystolic', ko: '수축기혈압', en: 'Systolic BP', better: -1 },
    { key: 'bpDiastolic', ko: '이완기혈압', en: 'Diastolic BP', better: -1 },
    { key: 'bmi', ko: 'BMI', en: 'BMI', better: 0 },
    { key: 'weight', ko: '체중', en: 'Weight', better: 0 },
    { key: 'waist', ko: '허리둘레', en: 'Waist', better: -1 },
    { key: 'height', ko: '키', en: 'Height', better: 0 }
]);

export const BLOOD_TREND_MAX_TESTS = 6;

const isDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

/** 결과지에 적힌 검사일. 없으면 올린 날(문서 id). */
export function bloodTestDateOf(record) {
    if (isDateString(record?.testDate)) return record.testDate;
    return isDateString(record?.id) ? record.id : '';
}

function metricValue(record, key) {
    const raw = record?.metrics?.[key]?.value;
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

/**
 * @param {Array} records bloodTests 문서들 ({ id, testDate, metrics, ... })
 * @returns {{ dates: string[], rows: Array<{ key, ko, en, unit, cells: Array<null|{ value, status, diff, judged }> }> }}
 *   dates 와 cells 는 최신이 앞이다. diff 는 그 값이 있는 바로 앞 검사와의 차.
 *   judged 는 좋아졌으면 1, 나빠졌으면 -1, 판단하지 않으면 0.
 */
export function buildBloodTestTrend(records = [], maxTests = BLOOD_TREND_MAX_TESTS) {
    const tests = records
        .map((record) => ({ record, date: bloodTestDateOf(record) }))
        .filter((item) => item.date)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, maxTests);

    const rows = [];
    for (const metric of BLOOD_TREND_METRICS) {
        const values = tests.map((item) => metricValue(item.record, metric.key));
        if (values.every((value) => value === null)) continue;
        const unit = tests.map((item) => String(item.record.metrics?.[metric.key]?.unit || '').trim()).find(Boolean) || '';
        const cells = values.map((value, index) => {
            if (value === null) return null;
            const older = values.slice(index + 1).find((candidate) => candidate !== null);
            const diff = older === undefined ? null : Math.round((value - older) * 100) / 100;
            const judged = diff === null || diff === 0 ? 0 : Math.sign(diff) * metric.better;
            const status = String(tests[index].record.metrics?.[metric.key]?.status || '');
            return { value, status, diff, judged };
        });
        rows.push({ key: metric.key, ko: metric.ko, en: metric.en, unit, cells });
    }
    return { dates: tests.map((item) => item.date), rows };
}

const STATUS_COLORS = { normal: '#2E7D32', borderline: '#F9A825', abnormal: '#C62828' };

/** 추이 표의 HTML. 검사가 한 번뿐이어도 그린다 — 다음 검사가 옆에 붙을 자리다. */
export function renderBloodTestTrendHtml(trend, { en = false, escapeHtml }) {
    if (!trend.dates.length || !trend.rows.length) return '';
    const head = trend.dates.map((date, index) =>
        `<th class="blood-trend-date${index === 0 ? ' is-latest' : ''}">${escapeHtml(date.slice(2).replace(/-/g, '.'))}</th>`
    ).join('');
    const body = trend.rows.map((row) => {
        const cells = row.cells.map((cell, index) => {
            if (!cell) return '<td class="blood-trend-empty">-</td>';
            const color = STATUS_COLORS[cell.status] || 'inherit';
            let diffHtml = '';
            if (cell.diff !== null && cell.diff !== 0) {
                const tone = cell.judged > 0 ? 'is-better' : cell.judged < 0 ? 'is-worse' : '';
                diffHtml = `<div class="blood-trend-diff ${tone}">${cell.diff > 0 ? '▲' : '▼'}${escapeHtml(String(Math.abs(cell.diff)))}</div>`;
            }
            return `<td${index === 0 ? ' class="is-latest"' : ''}><span style="color:${color}; font-weight:700;">${escapeHtml(String(cell.value))}</span>${diffHtml}</td>`;
        }).join('');
        return `<tr><th class="blood-trend-metric">${escapeHtml(en ? row.en : row.ko)}${row.unit ? `<span>${escapeHtml(row.unit)}</span>` : ''}</th>${cells}</tr>`;
    }).join('');
    return `<div class="blood-trend-scroll"><table class="blood-trend-table">
        <thead><tr><th class="blood-trend-metric">${en ? 'Test date' : '검사일'}</th>${head}</tr></thead>
        <tbody>${body}</tbody>
    </table></div>`;
}
