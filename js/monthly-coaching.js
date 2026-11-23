// 한 달 코칭 카드 — 포인트를 쓰는 곳 ①(2026-11-23 대표: 처음 300P, 두 번째부터 500P, 한 달에 한 번).
//
// 해빛코치(AI)가 사는 즉시 최근 4주 기록을 읽어 편지를 쓰고, 해빛닥터 최석재가 3일 안에 직접
// 한마디를 붙인다. 서버: functions/monthly-coaching.js. 대표의 한마디는 관제탑(admin.html)에서
// 대표가 쓴 글만 간다 — AI 초안이 회원에게 의사 이름으로 가는 일은 없다.
//
// 자산 탭의 해빛 배지 카드 바로 위에 스크립트가 만들어 넣는다(index.html 에는 없다).
// 편지는 users/{uid}/coachingReports/{YYYY-MM} 을 회원이 직접 읽는다(서버만 쓴다).
import { auth, db, functions } from './firebase-config.js?v=615';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { collection, getDocs, limit, orderBy, query } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { showToast } from './ui-helpers.js?v=615';
import { isEnglishLocale } from './i18n.js?v=615';
import { getActiveMemberToday } from './member-time.js?v=615';
import { trackProductEvent } from './product-events.js?v=615';
import { MONTHLY_COACHING_COST, MONTHLY_COACHING_FIRST_COST, describeCoachingCard } from './monthly-coaching-core.js?v=615';

const CARD_ID = 'monthly-coaching-card';
const MODAL_ID = 'monthly-coaching-modal';

let reports = [];
let busy = false;
let loadSequence = 0;

function copy(ko, en) {
    return isEnglishLocale() ? en : ko;
}

function escapeHtml(value = '') {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ensureCard() {
    let card = document.getElementById(CARD_ID);
    if (card) return card;
    const section = document.getElementById('assets');
    if (!section) return null;
    card = document.createElement('div');
    card.className = 'card monthly-coaching-card';
    card.id = CARD_ID;
    const anchor = section.querySelector('#global-reward-card') || section.querySelector('.reward-market-card');
    if (anchor) anchor.before(card);
    else section.appendChild(card);
    return card;
}

function render() {
    const card = ensureCard();
    if (!card) return;
    const monthKey = String(getActiveMemberToday() || '').slice(0, 7);
    const state = describeCoachingCard({ reports, monthKey });
    const main = state.boughtThisMonth
        ? `<button type="button" class="monthly-coaching-btn" data-coaching-open="${escapeHtml(monthKey)}">${escapeHtml(copy('이번 달 코칭 보기', "Open this month's coaching"))}</button>`
            + (state.doctorArrived ? `<span class="monthly-coaching-tag">${escapeHtml(copy('해빛닥터 한마디 도착', "Dr. Choi's note is here"))}</span>` : '')
        : `<button type="button" class="monthly-coaching-btn is-buy" data-coaching-buy data-price="${state.price}">${escapeHtml(copy(`${state.price}P로 받기`, `Get it for ${state.price}P`))}</button>`;
    const past = state.past.length
        ? `<div class="monthly-coaching-past">${escapeHtml(copy('지난 코칭', 'Past'))}: `
            + state.past.map((report) => `<button type="button" class="monthly-coaching-past-btn" data-coaching-open="${escapeHtml(report.month)}">${escapeHtml(report.month)}</button>`).join(' ')
            + '</div>'
        : '';
    const priceLine = state.firstTime
        ? copy(`처음 ${MONTHLY_COACHING_FIRST_COST}P · 다음부터 ${MONTHLY_COACHING_COST}P`, `First time ${MONTHLY_COACHING_FIRST_COST}P · then ${MONTHLY_COACHING_COST}P`)
        : `${MONTHLY_COACHING_COST}P`;
    card.innerHTML = `<h3>🧭 ${escapeHtml(copy('한 달 코칭', 'Monthly coaching'))} · ${escapeHtml(priceLine)}</h3>`
        + `<p class="reward-market-caption">${escapeHtml(copy(
            '해빛코치(AI)가 최근 4주 기록을 바로 읽고 잘한 것 3가지, 바꿀 것 3가지를 짚어 드려요. 해빛닥터 최석재가 3일 안에 직접 한마디를 남겨요. 한 달에 한 번 받을 수 있어요.',
            'Haebit Coach (AI) reads your last 4 weeks right away: 3 things you did well and 3 to change. Dr. Choi Seokjae adds his own note within 3 days. Once a month.'
        ))}</p>`
        + `<div class="monthly-coaching-actions">${main}</div>`
        + past;
}

function formatDueBy(dueBy) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dueBy || ''));
    if (!match) return '';
    return copy(`${Number(match[2])}월 ${Number(match[3])}일`, `${match[2]}/${match[3]}`);
}

function renderLetter(report) {
    const doctor = report.doctor || {};
    const doctorHtml = doctor.status === 'sent'
        ? `<p class="monthly-coaching-doctor-note">${escapeHtml(doctor.note || '').replace(/\n/g, '<br>')}</p>`
        : `<p class="monthly-coaching-doctor-wait">${escapeHtml(copy(
            `${formatDueBy(doctor.dueBy) || '3일 안'}까지 해빛닥터 최석재가 이 기록을 직접 보고 한마디를 남겨요. 오면 대시보드에도 보여요.`,
            `Dr. Choi will read these records himself and leave a note by ${formatDueBy(doctor.dueBy) || 'within 3 days'}. It also shows on your dashboard.`
        ))}</p>`;
    return `<div class="monthly-coaching-letter">
        <div class="monthly-coaching-month">${escapeHtml(report.month || '')}</div>
        <section>
            <h4>🤖 ${escapeHtml(copy('해빛코치', 'Haebit Coach'))} <small>AI</small></h4>
            <p class="monthly-coaching-headline">${escapeHtml(report.headline || '')}</p>
            <p>${escapeHtml(report.summary || '')}</p>
            <h5>👍 ${escapeHtml(copy('잘한 것', 'What went well'))}</h5>
            <ul>${(report.wins || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            <h5>➡️ ${escapeHtml(copy('다음 4주에 바꿀 것', 'For the next 4 weeks'))}</h5>
            <ol>${(report.nextSteps || []).map((item) => `<li><b>${escapeHtml(item.title)}</b> — ${escapeHtml(item.how)}</li>`).join('')}</ol>
            ${report.caution ? `<p class="monthly-coaching-caution">⚠️ ${escapeHtml(report.caution)}</p>` : ''}
        </section>
        <section class="monthly-coaching-doctor">
            <h4>👨‍⚕️ ${escapeHtml(copy('해빛닥터 최석재', 'Dr. Choi Seokjae'))}</h4>
            ${doctorHtml}
        </section>
    </div>`;
}

function openLetter(monthKey) {
    const report = reports.find((item) => item.month === monthKey);
    if (!report) return;
    document.getElementById(MODAL_ID)?.remove();
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'monthly-coaching-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `<div class="monthly-coaching-sheet">
        <button type="button" class="monthly-coaching-close" data-coaching-close aria-label="${escapeHtml(copy('닫기', 'Close'))}">✕</button>
        ${renderLetter(report)}
    </div>`;
    document.body.appendChild(modal);
}

function serverMessage(error) {
    const text = String(error?.message || '').trim();
    return text && !/^internal$/i.test(text) ? text : copy('코칭을 받지 못했어요. 잠시 뒤 다시 눌러 주세요.', 'Could not get your coaching. Please try again.');
}

async function buy() {
    if (busy) return;
    const price = Number(document.querySelector(`#${CARD_ID} [data-coaching-buy]`)?.dataset.price) || MONTHLY_COACHING_FIRST_COST;
    if (!window.confirm(copy(
        `${price}P로 이번 달 코칭을 받을까요?\n해빛코치 편지는 바로 오고, 해빛닥터 최석재의 한마디는 3일 안에 와요.`,
        `Spend ${price}P on this month's coaching?\nThe coach letter comes now; Dr. Choi's note within 3 days.`
    ))) return;
    busy = true;
    const button = document.querySelector(`#${CARD_ID} [data-coaching-buy]`);
    if (button) {
        button.disabled = true;
        button.textContent = copy('해빛코치가 4주 기록을 읽는 중…', 'Reading your 4 weeks…');
    }
    try {
        const result = await httpsCallable(functions, 'buyMonthlyCoaching')({ locale: isEnglishLocale() ? 'en' : 'ko' });
        const data = result?.data || {};
        if (data.report) {
            reports = [{ ...data.report, month: data.month }, ...reports.filter((item) => item.month !== data.month)];
        }
        const coins = Number(data.coins);
        if (Number.isFinite(coins)) {
            const balanceEl = document.getElementById('point-balance');
            if (balanceEl) balanceEl.innerText = coins;
        }
        if (!data.alreadyBought) trackProductEvent('monthly_coaching_bought', {});
        render();
        openLetter(data.month);
        if (!data.alreadyBought) window.updateAssetDisplay?.(true)?.catch?.(() => {});
    } catch (error) {
        console.error('[한 달 코칭] 받기 실패:', error);
        showToast(`⚠️ ${serverMessage(error)}`);
        render();
    } finally {
        busy = false;
    }
}

function installClickHandler() {
    if (document.body.dataset.monthlyCoachingClicks === '1') return;
    document.body.dataset.monthlyCoachingClicks = '1';
    document.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[data-coaching-buy]')) {
            buy();
            return;
        }
        const open = target.closest('[data-coaching-open]');
        if (open) {
            openLetter(open.getAttribute('data-coaching-open'));
            return;
        }
        if (target.closest('[data-coaching-close]') || target.id === MODAL_ID) {
            document.getElementById(MODAL_ID)?.remove();
        }
    });
}

export async function loadMonthlyCoaching() {
    const uid = auth.currentUser?.uid;
    if (!uid) {
        document.getElementById(CARD_ID)?.remove();
        reports = [];
        return;
    }
    installClickHandler();
    const sequence = ++loadSequence;
    render();
    try {
        const snap = await getDocs(query(collection(db, 'users', uid, 'coachingReports'), orderBy('month', 'desc'), limit(6)));
        if (sequence !== loadSequence || auth.currentUser?.uid !== uid) return;
        reports = snap.docs.map((docSnap) => ({ month: docSnap.id, ...(docSnap.data() || {}) }));
        render();
    } catch (error) {
        // 읽기가 막혀도 사는 버튼은 남긴다. 서버가 이미 산 달이면 그 편지를 돌려준다.
        console.warn('[한 달 코칭] 지난 편지 읽기 실패:', error?.message || error);
    }
}
