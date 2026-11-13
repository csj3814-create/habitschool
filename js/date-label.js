/**
 * 머리글 날짜를 "11. 13. (금)" 으로 보여 준다.
 *
 * 브라우저의 날짜 칸은 "2026. 11. 13." 처럼 연도까지 적어서 좁은 머리글에서 잘렸다
 * (2026-11-13 제보: "2026. 11." 까지만 보였다). 날짜 칸은 그대로 두고 투명하게 덮어서
 * 누르면 예전처럼 달력이 열리게 하고, 글자는 우리가 쓴다.
 *
 * 날짜는 코드 여러 곳에서 `input.value = ...` 로 바뀐다. 그때는 change 이벤트가 나지
 * 않으므로 이 칸의 value 에 직접 걸어 둔다.
 */
import { isEnglishLocale } from './i18n.js?v=601';

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} todayStr YYYY-MM-DD — 올해가 아니면 연도를 붙인다
 */
export function formatRecordDateLabel(dateStr, todayStr = '', en = false) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
    if (!match) return '';
    const [, year, month, day] = match;
    const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)).getUTCDay();
    const sameYear = String(todayStr || '').slice(0, 4) === year;
    if (en) {
        const base = `${MONTHS_EN[Number(month) - 1]} ${Number(day)}`;
        return `${sameYear ? base : `${base}, ${year}`} (${WEEKDAYS_EN[weekday]})`;
    }
    const base = `${Number(month)}. ${Number(day)}.`;
    return `${sameYear ? base : `${year.slice(2)}. ${base}`} (${WEEKDAYS_KO[weekday]})`;
}

function todayKst() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function initDateLabel() {
    const input = document.getElementById('selected-date');
    const label = document.getElementById('selected-date-label');
    if (!input || !label) return;

    const render = () => {
        label.textContent = formatRecordDateLabel(input.value, todayKst(), isEnglishLocale());
    };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor?.get && descriptor?.set) {
        Object.defineProperty(input, 'value', {
            configurable: true,
            get() { return descriptor.get.call(this); },
            set(next) {
                descriptor.set.call(this, next);
                render();
            }
        });
    }
    input.addEventListener('change', render);
    input.addEventListener('input', render);
    // 컴퓨터에서는 글자 부분을 눌러도 달력이 열리지 않는다. 직접 연다.
    input.addEventListener('click', () => {
        try { input.showPicker?.(); } catch (_) { /* 이미 열려 있거나 막힌 경우 */ }
    });
    render();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDateLabel);
    } else {
        initDateLabel();
    }
}
