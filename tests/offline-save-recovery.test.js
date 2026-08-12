import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 증상: 하루를 기록하고 저장을 누르면 "안전하게 저장했어요. 잠시 후 자동으로 마무리돼요."
// 가 뜨는데 실제로는 마무리되지 않았다. 식단·운동·마음 탭에는 사진이 보이지만 갤러리에는
// 아무것도 없고, 새로고침한 뒤 저장을 다시 눌러야 비로소 올라갔다.
//
// 저 문구는 오프라인 보관함 경로에서만 나온다. 즉 daily_logs 기본 저장이 두 번 다
// 서버 ACK를 못 받았다는 뜻이다. Firestore SDK 는 ACK 못 받은 쓰기를 reject 하지 않고
// 로컬 큐에 넣은 채 영영 pending 으로 두므로, 저 경로에 닿았다는 건 스트림이 멈췄다는
// 뜻이다. 원인은 셋이었고 셋 다 아래에서 고정한다.

describe('a stalled Firestore stream actually gets rebuilt', () => {
    const configSource = readRepoFile('js/firebase-config.js');

    it('bounces the connection instead of calling a no-op', () => {
        // enableNetwork 하나만 부르는 것은 네트워크를 끈 적이 없으면 즉시 resolve 하는
        // no-op 이다. 멈춘 WebChannel 은 그대로 남고, 새로고침이 유일한 해결책이 된다.
        expect(configSource).toContain('disableNetwork');
        expect(configSource).toContain('await disableNetwork(db).catch(() => {});');
        expect(configSource).toContain('await enableNetwork(db).catch(() => {});');
        // 껐다 켜는 건 import 도 되어 있어야 한다.
        const imports = configSource
            .split(/\r?\n/)
            .filter((line) => line.trim().startsWith('import '))
            .join(' ');
        expect(imports).toContain('disableNetwork');
    });

    it('only bounces after a plain probe has already failed', () => {
        // 멀쩡한 연결을 이유 없이 끊지 않는다. 한 번 실패한 뒤부터 끊고 다시 세운다.
        expect(configSource).toContain('let _firestoreReconnectProbeFailures = 0;');
        expect(configSource).toContain('if (_firestoreReconnectProbeFailures > 0) {');
        expect(configSource).toContain('_firestoreReconnectProbeFailures += 1;');
        // 성공하면 카운터를 되돌려 다음 문제는 다시 가볍게 시작한다.
        expect(configSource).toContain('_firestoreReconnectProbeFailures = 0;');
    });

    it('exposes a forced reconnect for callers that already know the stream is dead', () => {
        expect(configSource).toContain('export async function forceFirestoreReconnect(reason = \'write-timeout\')');
        expect(configSource).toContain('_firestoreReconnectProbeFailures = Math.max(1, _firestoreReconnectProbeFailures);');
    });
});

describe('the daily log save stops retrying down the same dead stream', () => {
    const appSource = readAppSource();

    it('rebuilds the connection before the second attempt', () => {
        expect(appSource).toContain("await forceFirestoreReconnect('daily-log-primary-save').catch(() => false);");
        expect(appSource).toContain('forceFirestoreReconnect');
        const imports = appSource
            .split(/\r?\n/)
            .filter((line) => line.trim().startsWith('import '))
            .join(' ');
        expect(imports).toContain('forceFirestoreReconnect');
    });

    it('cuts the first attempt short so nobody waits fifty seconds for an answer', () => {
        // 연결이 멀쩡하면 쓰기는 1초 안에 ACK된다. 첫 시도에서 오래 기다리는 건
        // 이미 멈춘 스트림뿐이므로, 25초를 두 번 다 쓸 이유가 없다.
        expect(appSource).toContain('const DAILY_LOG_PRIMARY_SAVE_STALL_TIMEOUT_MS = 12000;');
        expect(appSource).toContain('await doSetDoc(DAILY_LOG_PRIMARY_SAVE_STALL_TIMEOUT_MS);');
        // 재시도는 넉넉하게 — 진짜 느린 회선을 성급하게 포기하면 안 된다.
        expect(appSource).toContain('await doSetDoc(DAILY_LOG_PRIMARY_SAVE_TIMEOUT_MS);');
        expect(appSource).toContain('const doSetDoc = (timeoutMs = DAILY_LOG_PRIMARY_SAVE_TIMEOUT_MS) => withRejectingTimeout(');
    });

    it('leaves the whole failure path inside the 40s save-button watchdog', () => {
        // 12s + 1.5s + 25s = 38.5s. 워치독이 40s 라 이제 오답 토스트가 끼어들지 않는다.
        const stall = Number(appSource.match(/DAILY_LOG_PRIMARY_SAVE_STALL_TIMEOUT_MS = (\d+)/)[1]);
        const full = Number(appSource.match(/DAILY_LOG_PRIMARY_SAVE_TIMEOUT_MS = (\d+)/)[1]);
        const watchdog = Number(appSource.match(/showToast\('✅ 기록은 안전하게 저장 중이에요[^)]*\);\s*\}, (\d+)\)/)[1]);
        expect(stall + 1500 + full).toBeLessThan(watchdog);
    });
});

describe('"잠시 후 자동으로 마무리돼요" is a promise the code now keeps', () => {
    const appSource = readAppSource();

    it('schedules its own retry when the save is queued', () => {
        // online/focus/visibilitychange 만으로는 화면을 계속 보고 있는 사람에게 한 번도
        // 걸리지 않는다. 그래서 큐에 넣은 그 자리에서 재시도를 예약한다.
        expect(appSource).toContain("scheduleOfflineOutboxFlush('primary-save-failed');");
        expect(appSource).toContain('function scheduleOfflineOutboxFlush(reason = \'queued\')');
        expect(appSource).toContain('const OFFLINE_OUTBOX_RETRY_DELAYS_MS = [4000, 10000, 25000, 60000, 120000];');
    });

    it('revives the connection before replaying, since the queue jams in the same place', () => {
        expect(appSource).toContain('await forceFirestoreReconnect(`offline-outbox-${reason}`).catch(() => false);');
    });

    it('keeps retrying while anything is still pending, and stops when nothing is', () => {
        expect(appSource).toContain('if (hasPendingOfflineOutboxEntries()) {');
        expect(appSource).toContain('scheduleOfflineOutboxFlush(reason);');
        expect(appSource).toContain('cancelOfflineOutboxRetry();');
        expect(appSource).toContain("if (flushed > 0) showToast('✅ 저장을 마무리했어요. 갤러리에도 올라갔어요.');");
    });

    it('does not burn its attempts while offline', () => {
        // 오프라인이면 재시도해봐야 소용없다. 횟수를 되돌려 복귀 후 다시 밀어붙인다.
        expect(appSource).toContain('_offlineOutboxRetryAttempt = Math.max(0, _offlineOutboxRetryAttempt - 1);');
    });

    it('counts only this user\'s entries as pending', () => {
        expect(appSource).toContain('function hasPendingOfflineOutboxEntries()');
        expect(appSource).toContain("return readOfflineOutboxEntries().some((entry) => String(entry?.userId || '').trim() === uid);");
    });
});

describe('a queued save survives the reload it used to need', () => {
    const appSource = readAppSource();
    const authSource = readRepoFile('js/auth.js');

    it('picks the queue back up after sign-in', () => {
        // 새로고침해도 보관함을 아무도 비워주지 않아서, 저장을 다시 누르는 것 말고는
        // 밀린 기록이 올라갈 길이 없었다.
        expect(appSource).toContain('window.resumePendingOfflineSaves = function resumePendingOfflineSaves()');
        expect(appSource).toContain("scheduleOfflineOutboxFlush('app-start');");
        expect(authSource).toContain('window.resumePendingOfflineSaves?.();');
    });

    it('does nothing when there is nothing waiting', () => {
        const fn = appSource
            .split('window.resumePendingOfflineSaves = function resumePendingOfflineSaves() {')[1]
            ?.split('\n};')[0] || '';
        expect(fn).not.toBe('');
        expect(fn).toContain('if (!hasPendingOfflineOutboxEntries()) return;');
    });
});
