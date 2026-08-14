import { describe, expect, it } from 'vitest';
import {
    GUEST_DEMO_STEPS,
    getGuestDemoNextAction,
    getGuestDemoCurrentStep,
    createGuestDemoSession,
    applyGuestDemoAction,
    renderGuestDemoTab
} from '../js/guest-demo.js';

// 체험 모드에서 "저장까지 눌러 보세요" 라고 말해도 어느 버튼인지는 알려주지 않는다.
// 지금 누를 버튼 하나를 실제로 가리킨다.

describe('exactly one button is marked as the next thing to press', () => {
    it('walks the whole tour marking one button at a time', () => {
        let session = createGuestDemoSession();
        const seen = [];
        for (let i = 0; i < 12; i++) {
            const next = getGuestDemoNextAction(session);
            if (!next) break;
            const step = getGuestDemoCurrentStep(session);
            const html = renderGuestDemoTab(step?.tab || 'diet', session);
            const marked = (html.match(/is-next-action/g) || []).length;
            // 그 탭에서 누를 것이 있으면 정확히 하나만 표시된다.
            expect(marked, `${next} should mark at most one button`).toBeLessThanOrEqual(1);
            seen.push(next);
            const applied = applyGuestDemoAction(session, next);
            session = applied.session || session;
        }
        // 기록 세 개를 남기는 순서가 실제로 나온다.
        expect(seen).toContain('diet_saved');
        expect(seen).toContain('exercise_saved');
        expect(seen).toContain('sleep_saved');
    });

    it('never suggests something whose prerequisites are unmet', () => {
        const session = createGuestDemoSession();
        const first = getGuestDemoNextAction(session);
        // 아무것도 안 한 상태에서 쿠폰 교환이 먼저 나오면 안 된다.
        expect(first).not.toBe('coupon_redeemed');
    });

    it('returns nothing once every action is done', () => {
        let session = createGuestDemoSession();
        for (let i = 0; i < 12; i++) {
            const next = getGuestDemoNextAction(session);
            if (!next) break;
            session = applyGuestDemoAction(session, next).session || session;
        }
        expect(getGuestDemoNextAction(session)).toBeNull();
    });

    it('marks nothing on a tab that is completed by looking, not pressing', () => {
        // 내 기록·갤러리는 방문만으로 끝난다. 거기서 버튼을 가리키면 헷갈린다.
        let session = createGuestDemoSession();
        for (const action of ['diet_sample_selected', 'diet_ai_result_viewed', 'diet_saved',
            'exercise_sample_reviewed', 'exercise_saved',
            'sleep_sample_reviewed', 'sleep_saved']) {
            session = applyGuestDemoAction(session, action).session || session;
        }
        const html = renderGuestDemoTab('dashboard', session);
        expect(html).not.toContain('is-next-action');
    });
});

describe('the guidance says what to press, not what to accomplish', () => {
    const byId = Object.fromEntries(GUEST_DEMO_STEPS.map((s) => [s.id, s]));

    it('points at the marked button where there is one to press', () => {
        for (const id of ['diet', 'exercise', 'sleep', 'assets']) {
            expect(byId[id].hint, `${id} hint should point at the cue`).toContain('👆');
        }
    });

    it('says plainly when there is nothing to press', () => {
        for (const id of ['dashboard', 'gallery']) {
            expect(byId[id].hint).toContain('보는 것만으로');
            expect(byId[id].hint).not.toContain('👆');
        }
    });

    it('marks the button for assistive tech too, not only visually', () => {
        const session = createGuestDemoSession();
        const html = renderGuestDemoTab('diet', session);
        expect(html).toContain('aria-current="step"');
    });

    it('puts the cue after the label, at the right edge of the button', () => {
        // 글자 왼쪽에 작게 붙이면 아이콘 장식으로 읽힌다.
        const session = createGuestDemoSession();
        const html = renderGuestDemoTab('diet', session);
        const labelAt = html.indexOf('예시 사진 선택');
        const cueAt = html.indexOf('guest-demo-next-cue');
        expect(labelAt).toBeGreaterThan(-1);
        expect(cueAt).toBeGreaterThan(labelAt);
    });

    it('drops the coach box buttons that had nothing left to turn off', () => {
        const session = createGuestDemoSession();
        const html = renderGuestDemoTab('diet', session, { showCoach: true });
        expect(html).not.toContain('안내 닫기');
        expect(html).not.toContain('전체 안내 끄기');
    });

    it('drops the animation for reduced-motion', () => {
        const css = readCss();
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('animation: none;');
    });
});

function readCss() {
    // eslint-disable-next-line no-undef
    return require('fs').readFileSync('styles-guest-demo.css', 'utf8');
}
