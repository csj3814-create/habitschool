import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

const APP = readAppSource();
const CSS = readRepoFile('styles-base.css');

function handler() {
    const at = APP.indexOf('window.reviewHabitGroupCheckin');
    expect(at, 'handler not found').toBeGreaterThan(-1);
    return APP.slice(at, at + 2600);
}

// 승인은 콜드 스타트가 겹치면 5~8초까지 걸린다. 그 동안 화면이 조용하면 사용자는
// 실패로 읽고 같은 버튼을 다시 누른다.
describe('leader review says something while the server is working', () => {
    it('marks the pressed row busy before awaiting the callable', () => {
        const h = handler();
        const busyAt = h.indexOf('setHabitGroupReviewRowBusy');
        const awaitAt = h.indexOf('await fn(');
        expect(busyAt).toBeGreaterThan(-1);
        expect(awaitAt).toBeGreaterThan(-1);
        expect(busyAt, 'busy state must be set before the await').toBeLessThan(awaitAt);
    });

    it('disables the buttons so a slow call is not pressed twice', () => {
        const at = APP.indexOf('function setHabitGroupReviewRowBusy');
        const fn = APP.slice(at, at + 900);
        expect(fn).toContain('btn.disabled = true');
        expect(fn).toContain('btn.disabled = false');
    });

    it('restores the buttons when the call fails', () => {
        const h = handler();
        const catchAt = h.indexOf('} catch (error)');
        expect(catchAt).toBeGreaterThan(-1);
        expect(h.slice(catchAt)).toContain('setHabitGroupReviewRowBusy(groupId, targetUid, dateStr, false)');
    });

    it('names the failure instead of a bare sentence', () => {
        expect(handler()).toMatch(/error\?\.code/);
    });

    it('clears the card without waiting for the refetch', () => {
        const h = handler();
        const okAt = h.indexOf('소모임 기록을 승인했어요');
        const refetchAt = h.indexOf('renderSocialChallenges(user)');
        const busyAfter = h.indexOf('setHabitGroupReviewRowBusy', okAt);
        expect(busyAfter).toBeGreaterThan(okAt);
        expect(busyAfter, 'card should settle before the background refetch').toBeLessThan(refetchAt);
    });

    it('gives each row an id the handler can find', () => {
        expect(APP).toContain('function habitGroupReviewRowId(');
        expect(APP).toContain('id="${habitGroupReviewRowId(checkin.groupId, checkin.uid, checkin.date)}"');
    });

    it('shows the busy row as busy', () => {
        expect(CSS).toContain('.habit-group-review-actions.is-busy');
    });
});
