/**
 * 건강 정보 카드 접기와 저장 버튼 하나.
 *
 * 2026-11-13: 프로필의 건강 정보 묶음에 "저장하고 점수 갱신" 버튼이 카드마다 네 개 있었고,
 * 한 번 넣으면 거의 안 바뀌는 기본 정보·약물 카드가 늘 펼쳐져 자리를 차지했다.
 *
 * - 기본 정보(복용 약물 포함)는 값이 있으면 한 줄 요약으로 접는다. 누르면 펼쳐서 고친다.
 * - 저장 버튼은 기본 정보 맨 아래와 묶음 끝, 두 곳. 묶음 끝 것은 값을 건드리면 화면
 *   아래에 따라붙어서, 체성분이나 콜레스테롤을 고치고 있어도 손 닿는 곳에 있다.
 */
import { isEnglishLocale } from './i18n.js?v=604';

const SMOKING_LABELS = {
    never: ['비흡연', 'Never smoked'],
    quit_5y_plus: ['금연 5년 이상', 'Quit 5+ years'],
    quit_1_5y: ['금연 1~5년', 'Quit 1–5 years'],
    quit_under_1y: ['금연 1년 미만', 'Quit under 1 year'],
    current: ['흡연 중', 'Smoking']
};
const MED_LABELS_EN = {
    '고혈압약': 'Blood pressure',
    '당뇨약': 'Diabetes',
    '고지혈증약': 'Cholesterol',
    '비만치료제': 'Weight-loss'
};

/** 기본 정보 한 줄. 넣은 것만 적는다. 아무것도 없으면 ''. 약물은 여기 넣지 않는다(아래 joinBasicLine). */
export function describeBasicInfo({ height, sex, smoking, secondhand } = {}, en = false) {
    const parts = [];
    const cm = Number(height);
    if (Number.isFinite(cm) && cm > 0) parts.push(en ? `${cm} cm` : `키 ${cm}cm`);
    if (sex === 'male') parts.push(en ? 'Male' : '남성');
    if (sex === 'female') parts.push(en ? 'Female' : '여성');
    const smoke = SMOKING_LABELS[smoking];
    if (smoke) parts.push(smoke[en ? 1 : 0]);
    if (secondhand) parts.push(en ? 'Secondhand smoke' : '간접흡연 있음');
    return parts.join(' · ');
}

/** 약물 한 줄. 고른 것이 없으면 ''. */
export function describeMeds({ meds = [], other = '' } = {}, en = false) {
    const names = meds.map((name) => (en ? MED_LABELS_EN[name] || name : name));
    const extra = String(other || '').trim();
    if (extra) names.push(extra);
    return names.join(' · ');
}

/** 접힌 기본 정보 카드에 보이는 줄: 기본 정보 뒤에 복용 약물을 잇는다. */
export function joinBasicLine(basicText, medsText, en = false) {
    const meds = medsText ? (en ? `Meds: ${medsText}` : `약 ${medsText}`) : '';
    return [basicText, meds].filter(Boolean).join(' · ');
}

/** 콜레스테롤 한 줄. */
export function describeCholesterol({ total, hdl } = {}, en = false) {
    const parts = [];
    const t = Number(total);
    const h = Number(hdl);
    if (Number.isFinite(t) && t > 0) parts.push(en ? `Total ${t}` : `총 ${t}`);
    if (Number.isFinite(h) && h > 0) parts.push(`HDL ${h}`);
    return parts.join(' · ');
}

function readInputs() {
    const value = (id) => document.getElementById(id)?.value || '';
    return {
        basic: {
            height: value('prof-height'),
            sex: document.querySelector('input[name="prof-sex"]:checked')?.value || '',
            smoking: document.querySelector('input[name="smoking-status"]:checked')?.value || '',
            secondhand: !!document.getElementById('prof-secondhand')?.checked
        },
        meds: {
            meds: [...document.querySelectorAll('input[name="med-chk"]:checked')].map((el) => el.value),
            other: value('prof-med-other')
        },
        chol: { total: value('prof-total-chol'), hdl: value('prof-hdl') }
    };
}

function setLine(id, text, emptyText) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || emptyText;
    el.classList.toggle('is-empty', !text);
}

/** 카드 머리의 요약 줄을 지금 칸에 있는 값으로 다시 쓴다. */
export function refreshHealthCardLines() {
    const en = isEnglishLocale();
    const inputs = readInputs();
    setLine(
        'health-basic-line',
        joinBasicLine(describeBasicInfo(inputs.basic, en), describeMeds(inputs.meds, en), en),
        en ? 'Not entered yet' : '아직 입력 전'
    );
    setLine('health-chol-line', describeCholesterol(inputs.chol, en), en ? 'Not entered yet' : '아직 입력 전');
    return inputs;
}

/**
 * 저장된 값을 칸에 채운 뒤(로그인 직후)와 저장한 뒤에 부른다.
 * 값이 있는 카드는 접고, 비어 있는 기본 정보는 펴 둔다 — 처음 온 사람은 넣어야 하니까.
 */
export function applyHealthCardFoldDefaults() {
    const en = isEnglishLocale();
    const inputs = refreshHealthCardLines();
    const basic = document.getElementById('health-basic-card');
    if (basic) basic.open = !describeBasicInfo(inputs.basic, en);
}

/** 값을 건드렸으면 저장 버튼이 화면 아래에 따라붙는다. */
export function setHealthProfileDirty(dirty) {
    document.getElementById('health-save-bar')?.classList.toggle('is-dirty', !!dirty);
}

function init() {
    const cards = document.getElementById('sensitive-consent-cards');
    if (!cards) return;
    const onEdit = (event) => {
        const target = event.target;
        if (!target || target.type === 'file') return;
        if (!target.matches('input, select, textarea')) return;
        setHealthProfileDirty(true);
        refreshHealthCardLines();
    };
    cards.addEventListener('input', onEdit);
    cards.addEventListener('change', onEdit);
    refreshHealthCardLines();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.refreshHealthCardLines = refreshHealthCardLines;
    window.applyHealthCardFoldDefaults = applyHealthCardFoldDefaults;
    window.setHealthProfileDirty = setHealthProfileDirty;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
