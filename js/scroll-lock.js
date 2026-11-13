/**
 * 레이어 창이 떠 있는 동안 뒤 화면이 스크롤되지 않게 한다.
 *
 * 2026-11-13 제보: 결과지 보기 창을 띄운 채 손가락을 움직이면 뒤의 회색 화면이 따라
 * 움직였다. 다른 레이어 창들도 마찬가지였다.
 *
 * 창마다 열고 닫는 코드가 따로라(스무 개가 넘는다) 하나하나에 잠금을 달면 빠뜨린다.
 * 대신 화면을 지켜보다가 "화면을 덮는 창" 이 하나라도 보이면 html 에 .layer-open 을 건다.
 * 새 창을 만들어도 아래 조건에 맞으면 따로 할 일이 없다.
 */

// 화면을 덮는 창으로 쓰는 것들. 여기 걸려도 아래 isCoveringLayer 를 통과해야 잠근다.
export const LAYER_SELECTOR = [
    '.modal-overlay',
    '.wallet-modal-overlay',
    '.record-viewer',
    '#pdf-password-modal',
    '#lightbox-modal',
    '[role="dialog"]',
    '[aria-modal="true"]'
].join(', ');

/**
 * 지금 화면을 덮고 있는 창인가. 순수 판단 — 값만 받는다.
 * 보이지 않거나, 눌리지 않거나(pointer-events: none), 화면을 덮지 않으면 창이 아니다.
 */
export function isCoveringLayer({ display, visibility, opacity, pointerEvents, position, width, height, viewportWidth, viewportHeight }) {
    if (display === 'none' || visibility === 'hidden') return false;
    if (Number(opacity) === 0 || pointerEvents === 'none') return false;
    if (position !== 'fixed') return false;
    return width >= viewportWidth * 0.9 && height >= viewportHeight * 0.9;
}

function anyLayerOpen() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    for (const el of document.querySelectorAll(LAYER_SELECTOR)) {
        const style = getComputedStyle(el);
        if (style.display === 'none') continue;
        const rect = el.getBoundingClientRect();
        if (isCoveringLayer({
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            pointerEvents: style.pointerEvents,
            position: style.position,
            width: rect.width,
            height: rect.height,
            viewportWidth,
            viewportHeight
        })) return true;
    }
    return false;
}

let scheduled = false;
function check() {
    scheduled = false;
    document.documentElement.classList.toggle('layer-open', anyLayerOpen());
}
function schedule() {
    if (scheduled) return;
    scheduled = true;
    // 창이 뜨는 애니메이션의 첫 프레임(opacity 0)을 지나서 본다.
    setTimeout(check, 60);
}

export function initScrollLock() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'open']
    });
    window.addEventListener('resize', schedule);
    schedule();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScrollLock);
    } else {
        initScrollLock();
    }
}
