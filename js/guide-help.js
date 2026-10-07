// 사용법 연재를 앱 안에서 — 기능 옆 ⓘ 를 누르면 요약, "자세히"는 브런치 글 (2026-10-07).
//
// 사용자 결정: 저절로 뜨는 안내는 만들지 않는다. 궁금한 사람이 스스로 누르는 작은 ⓘ 만 둔다.
// 버튼 모양·간격은 바꾸지 않고, ⓘ 를 눌러도 옆(바깥) 버튼이 눌린 것으로 처리되지 않게 한다 —
// 내 기록 탭 점수 요약은 카드 전체가 버튼이다.
//
// 요약은 각 편 원고(marketing/posts/NN_*/brunch.md)의 내용 그대로다. 새 편을 브런치에 올리면
// 여기 brunchUrl 을 채우고 published 를 true 로 바꿔 배포한다. 아직 안 올린 편의 ⓘ 는 숨는다.
// 글이 한국어뿐이라 영어 앱에서는 보이지 않는다.

import { isEnglishLocale } from './i18n.js?v=493';
import { trackProductEvent } from './product-events.js?v=493';

export const GUIDE_CATALOG = Object.freeze({
    'guide-01': {
        no: 1,
        title: '해빛스쿨이 뭔가요',
        summary: [
            '먹은 것, 운동하는 모습, 수면 앱 화면을 사진으로 올리면 나머지는 AI가 읽어요.',
            '모든 기록은 "이번 주" 단위로 묶어 보여 드려요. 주 150분 운동에 얼마나 다가갔는지 막대 하나로 보여요.',
            '확실하지 않은 숫자는 보여 주지 않는다는 원칙으로 만들었어요.'
        ],
        brunchUrl: 'https://brunch.co.kr/@csj3814/2520',
        published: true
    },
    'guide-02': {
        no: 2,
        title: '식단 사진 한 장과 AI 분석',
        summary: [
            '칼로리는 일부러 뺐어요. 사진만으로는 양을 알 수 없거든요.',
            '대신 음식 하나하나가 자연식품인지, 전통 가공인지, 초가공식품인지를 봐요. 김치·된장은 초가공으로 치지 않아요.',
            '식단 탭에서 사진을 찍거나 고르면 분석이 저절로 시작돼요. 하루 네 끼까지 올릴 수 있어요.'
        ],
        brunchUrl: 'https://brunch.co.kr/@csj3814/2521',
        published: true
    },
    'guide-03': {
        no: 3,
        title: '운동 기록과 이번 주 150분',
        summary: [
            '운동은 세계보건기구 권장대로 일주일 단위, 주 150분 막대 하나로 봐요.',
            '남은 양을 남은 날로 나눠 하루 몇 분씩이면 되는지 알려 드리고, 150분을 채우면 300분 막대가 열려요.',
            '걷기처럼 걸음수와 겹치는 운동은 큰 쪽만 세고, 근력운동·수영·자전거는 따로 더해요.'
        ],
        brunchUrl: 'https://brunch.co.kr/@csj3814/2545',
        published: true
    },
    'guide-04': {
        no: 4,
        title: '수면 기록과 AI 분석',
        summary: [
            '수면 앱의 아침 요약 화면을 캡처해 올리면 AI가 수면 시간과 깊은수면·렘수면 비율을 읽어요.',
            '결과는 A~F 한 글자와 한 줄 총평, 오늘 밤 해 볼 일 하나로 보여 드려요.',
            '건강습관 점수의 수면 항목은 최근 7일 평균이 7~9시간이면 만점이고, 이틀 이상 기록이 있어야 매겨요.'
        ],
        brunchUrl: 'https://brunch.co.kr/@csj3814/2546',
        published: true
    },
    'guide-05': {
        no: 5,
        title: '체성분 기록',
        summary: [
            '인바디 결과지나 체중계 화면을 사진으로 올리면 AI가 체중·체지방률·골격근량을 읽어 칸을 채워요. 저장은 숫자를 보고 직접 눌러 주세요.',
            '점수에는 어느 기계로 재도 단위가 같은 체중·체지방률·골격근량·허리둘레만 써요. 내장지방 레벨은 회사마다 기준이 달라 뺐어요.',
            '가능하면 같은 기계로, 같은 시간(아침 공복, 화장실 다녀온 뒤)에 재 주세요.'
        ],
        brunchUrl: 'https://brunch.co.kr/@csj3814/2563',
        published: true
    },
    'guide-06': {
        no: 6,
        title: '건강 점수 보는 법',
        summary: [
            '건강습관 점수는 미국심장협회 LE8 방식으로 생활습관 4개와 체중·콜레스테롤·혈당·혈압 4개를 100점씩 매겨 평균을 내요.',
            '대사건강 점수는 체지방·근육·인슐린 저항성(공복혈당과 중성지방)·생활습관을 25점씩 봐요.',
            '고혈압약·고지혈증약을 드시면 그 항목에서 20점을 빼요. 약으로 내려간 숫자를 몸이 나은 것으로 보지 않기 때문이에요.'
        ],
        brunchUrl: 'https://brunch.co.kr/@csj3814/2564',
        published: true
    }
});

const BUTTON_CLASS = 'guide-help-btn';
const SHEET_ID = 'guide-help-sheet';

export function isGuidePublished(guideId) {
    const guide = GUIDE_CATALOG[guideId];
    return Boolean(guide && guide.published && guide.brunchUrl);
}

/**
 * 점수 카드처럼 innerHTML 로 그리는 곳에서 쓰는 ⓘ 마크업.
 * <button> 안에 들어가도 되도록 span 으로 만든다(버튼 안의 버튼은 잘못된 HTML).
 */
export function guideHelpButtonHtml(guideId) {
    if (!isGuidePublished(guideId)) return '';
    const guide = GUIDE_CATALOG[guideId];
    return `<span class="${BUTTON_CLASS}" role="button" tabindex="0" data-guide-id="${guideId}"`
        + ` aria-label="사용법 ${guide.no}편 요약 보기">?</span>`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function closeGuideSheet() {
    const sheet = document.getElementById(SHEET_ID);
    if (sheet) sheet.hidden = true;
}

export function openGuideSheet(guideId) {
    if (!isGuidePublished(guideId)) return;
    const guide = GUIDE_CATALOG[guideId];
    let sheet = document.getElementById(SHEET_ID);
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = SHEET_ID;
        sheet.className = 'guide-help-sheet';
        sheet.addEventListener('click', (event) => {
            if (event.target === sheet || event.target.closest('[data-guide-close]')) closeGuideSheet();
        });
        document.body.appendChild(sheet);
    }
    sheet.innerHTML = `
        <div class="guide-help-panel" role="dialog" aria-modal="true" aria-labelledby="guide-help-title">
            <div class="guide-help-kicker">해빛스쿨 사용법 ${guide.no}편</div>
            <h3 id="guide-help-title">${escapeHtml(guide.title)}</h3>
            <ul class="guide-help-summary">
                ${guide.summary.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
            </ul>
            <div class="guide-help-actions">
                <a class="guide-help-more" href="${escapeHtml(guide.brunchUrl)}" target="_blank" rel="noopener"
                    data-guide-more="${guideId}">자세히 — 브런치에서 읽기</a>
                <button type="button" class="guide-help-close" data-guide-close>닫기</button>
            </div>
        </div>`;
    const more = sheet.querySelector('[data-guide-more]');
    more?.addEventListener('click', () => {
        trackProductEvent('guide_help_full_read', { guide: guideId });
    });
    sheet.hidden = false;
    sheet.querySelector('.guide-help-close')?.focus();
    trackProductEvent('guide_help_open', { guide: guideId });
}

function findHelpButton(event) {
    const target = event.target;
    return target && typeof target.closest === 'function' ? target.closest(`.${BUTTON_CLASS}`) : null;
}

// 캡처 단계에서 받아 바깥 버튼(onclick)까지 가지 않게 막는다.
function onHelpClick(event) {
    const button = findHelpButton(event);
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openGuideSheet(button.dataset.guideId);
}

function onHelpKeydown(event) {
    if (event.key === 'Escape') {
        closeGuideSheet();
        return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const button = findHelpButton(event);
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openGuideSheet(button.dataset.guideId);
}

/** HTML 에 미리 넣어 둔 ⓘ 중 아직 안 올린 편의 것을 숨긴다. */
export function pruneUnpublishedGuideButtons(root = document) {
    root.querySelectorAll(`.${BUTTON_CLASS}[data-guide-id]`).forEach((button) => {
        if (!isGuidePublished(button.dataset.guideId)) button.remove();
    });
}

let initialized = false;

export function initGuideHelp() {
    if (initialized || typeof document === 'undefined') return;
    initialized = true;
    if (isEnglishLocale()) {
        document.documentElement.classList.add('guide-help-off');
        return;
    }
    pruneUnpublishedGuideButtons();
    document.addEventListener('click', onHelpClick, true);
    document.addEventListener('keydown', onHelpKeydown, true);
}

if (typeof window !== 'undefined') {
    window.guideHelpButtonHtml = guideHelpButtonHtml;
}
