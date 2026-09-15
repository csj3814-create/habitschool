import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdminPrescriptionDrafts } from '../js/admin-utils.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const ADMIN = read('admin.html');
const RUNTIME = read('functions/runtime.js');
const QUEUE_FN = RUNTIME.split('async function buildAdminPrescriptionQueue(todayStr) {')[1].split('\n}\n')[0];

// 2026-09-15 요청: "회원별 상세에 들어가야만 다이렉트 메세지 보낼 수 있게 하지 말고
// 한꺼번에 점검하고 보낼 수 있게 준비해 줘."
//
// 562명을 한 명씩 열어 볼 수는 없다.
describe('the queue builds its sentences with the same code as the detail modal', () => {
    it('does not rebuild the draft logic on the server', () => {
        // functions 는 js/ 를 참조하지 않고 hosting 은 functions/** 를 무시한다.
        // 서버에서 문장까지 만들면 로직이 두 벌이 되고, 문구를 고칠 때 한쪽만 고쳐진다.
        // (이름 자체는 왜 여기서 안 만드는지 적은 주석에 나온다. 정의와 호출을 본다.)
        expect(RUNTIME).not.toMatch(/function buildAdminPrescriptionDrafts/);
        expect(RUNTIME).not.toMatch(/buildAdminPrescriptionDrafts\s*\(/);
        // 회원이 읽는 문장이 서버에 조금이라도 생기면 그때부터 두 벌이다.
        expect(RUNTIME).not.toContain('늘려오셨습니다');
        expect(RUNTIME).not.toContain('withJosa');
        expect(RUNTIME).not.toContain('METRIC_VERBS');
    });

    it('lets the admin page turn the materials into drafts', () => {
        expect(ADMIN).toContain("httpsCallable(fns, 'getAdminPrescriptionQueue')");
        const fn = ADMIN.split('function topPrescriptionFor(member, todayStr, cooldownDays) {')[1].split('\n    }\n')[0];
        expect(fn).toContain('buildAdminPrescriptionDrafts({');
        expect(fn).toContain('trendMetrics: member.trendMetrics || []');
    });
});

// 서버가 보내는 것은 문서 원본이 아니라 초안이 실제로 읽는 필드만 남긴 사본이다.
// 그 사본으로 초안이 만들어지지 않으면 대기열은 통째로 비어 보인다.
describe('the slimmed-down log still produces every kind of draft', () => {
    const TODAY = '2026-09-15';
    // buildAdminPrescriptionQueue 가 만드는 모양 그대로.
    const slim = (date, extra = {}) => ({ date, ...extra });

    it('finds a reading over the line from the numeric fields alone', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나', todayStr: TODAY,
            logs: [slim('2026-09-12', { metrics: { glucose: 141 } })],
        });
        expect(drafts.find((d) => d.key.includes('alert'))).toBeTruthy();
    });

    it('reads the presence placeholders the server sends for the last seven days', () => {
        // 운동 목록은 항목이 커서 길이만 남긴 자리표시자로 온다. hasExerciseRecord 가
        // 길이만 보므로 이것으로 충분해야 한다.
        const logs = ['09-10', '09-11', '09-12', '09-13', '09-14'].map((d) => slim(`2026-${d}`, {
            diet: { breakfastUrl: true },
            exercise: { cardioList: [1, 1] },
        }));
        const drafts = buildAdminPrescriptionDrafts({ name: '루미나', logs, todayStr: TODAY });
        const gap = drafts.find((d) => d.key.includes('gap'));
        // 식단과 운동은 찼고 수면만 비었다.
        expect(gap.key).toBe('gap-sleep');
        expect(gap.message).toContain('수면');
    });

    it('averages the diet grade from the grade-only copy', () => {
        const logs = ['09-08', '09-09', '09-10'].map((d) => slim(`2026-${d}`, {
            dietAnalysis: { breakfast: { grade: 'A' }, lunch: { grade: 'B' } },
        }));
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나', logs, todayStr: TODAY,
            trendMetrics: [{
                key: 'dietGrade', label: '식단 등급', unit: '점', decimals: 0,
                summary: { recent: 95, previous: 80, delta: 15, direction: 'improved' },
            }],
        });
        expect(drafts.find((d) => d.key.includes('improved'))).toBeTruthy();
    });
});

describe('the exclusions the admin asked for are actually applied', () => {
    it('drops a member who turned coach messages off', () => {
        // settings 안에 둔다 — users/ 의 필드 화이트리스트 때문이다. 자세한 이유는
        // tests/coach-message-opt-out.test.js 에 있다.
        expect(QUEUE_FN).toContain('user.settings && user.settings.coachMessagesOptOut === true');
        expect(QUEUE_FN).toContain('skipped.optedOut += 1');
    });

    it('drops a member with no record for two weeks', () => {
        expect(RUNTIME).toContain('const PRESCRIPTION_QUEUE_INACTIVE_DAYS = 14;');
        expect(QUEUE_FN).toContain('if (latestDate < inactiveCut)');
        expect(QUEUE_FN).toContain('skipped.inactive += 1');
    });

    it('holds the same kind of draft back for four weeks', () => {
        expect(RUNTIME).toContain('const PRESCRIPTION_QUEUE_COOLDOWN_DAYS = 28;');
        // 근거는 admin_feedback 에 남는 draftKey 다. 직접 쓴 메시지는 종류가 없다.
        const reader = RUNTIME.split('async function readRecentPrescriptionFeedback(todayStr) {')[1].split('\n}\n')[0];
        expect(reader).toContain('if (!row.draftKey) return;');
        const fn = ADMIN.split('function topPrescriptionFor(member, todayStr, cooldownDays) {')[1].split('\n    }\n')[0];
        expect(fn).toContain('if (sent[draft.key] && sent[draft.key] >= cut) return false;');
    });

    it('never sends a reading over the line straight from the list', () => {
        const fn = ADMIN.split('async function sendPrescriptionFromQueue(uid, button) {')[1].split('\n    }\n')[0];
        expect(fn).toContain('if (draft.requiresHuman)');
        expect(fn).toContain('openDetail(uid)');
        // 그 분기 안에서 전송 호출로 넘어가면 안 된다.
        const beforeSend = fn.split('submitAdminFeedbackCallable')[0];
        expect(beforeSend).toContain('return;');
    });
});

describe('what was sent is remembered so it is not sent twice', () => {
    it('stores which draft the message came from', () => {
        const fn = RUNTIME.split('exports.submitAdminFeedback')[1].split('\n);\n')[0];
        expect(fn).toContain('request.data?.draftKey');
        expect(fn).toContain('draftKey,');
    });

    it('sends the draft key from both the queue and the detail modal', () => {
        expect(ADMIN).toContain('draftKey: draft.key,');
        expect(ADMIN).toContain('summary, draftKey: pendingDraftKey }');
        // 직접 쓴 메시지에 앞선 초안의 종류가 딸려 가면 안 된다.
        expect(ADMIN).toContain("pendingDraftKey = '';");
    });

    it('survives a refresh — the sent history is never served from the cache', () => {
        // 2026-09-15 보고: "보내고 다시 새로고침 하니까 그대로 뜨네?"
        // 30분 캐시된 재료에 방금 보낸 것이 없어 보내기 전 목록이 그대로 나왔다.
        // 무거운 것(63일치 로그·추이)만 캐시하고 발송 이력은 매번 새로 읽는다.
        const built = RUNTIME.split('async function buildAdminPrescriptionQueue(todayStr) {')[1].split('\n}\n')[0];
        expect(built).not.toContain('admin_feedback');
        expect(RUNTIME).toContain('async function readRecentPrescriptionFeedback(todayStr) {');

        const callable = RUNTIME.split('exports.getAdminPrescriptionQueue = onCall(')[1].split('\n);')[0];
        // 캐시를 내줄 때도 이력만은 새로 읽는다. 이 한 줄이 그 버그를 막는다.
        expect(callable).toContain('const fresh = await readRecentPrescriptionFeedback(todayStr);');
        expect(callable).toContain('...data, ...fresh');
        // 이력을 캐시에 넣으면 다시 낡는다.
        expect(callable).toContain('await cacheRef.set({ ...built,');
        expect(callable).not.toContain('cacheRef.set({ ...built, ...fresh');
    });

    it('moves what was sent into the sent box instead of just hiding it', () => {
        // 목록에서 사라진 것이 '보냈기 때문' 인지 '근거가 없어서' 인지 구분이 안 되면
        // 같은 사람에게 또 보내게 된다.
        expect(ADMIN).toContain('data-rxqf="sent"');
        expect(ADMIN).toContain('function renderPrescriptionSentBox(term) {');
        expect(ADMIN).toContain("if (prescriptionFilter === 'sent') {");

        const fn = ADMIN.split('async function sendPrescriptionFromQueue(uid, button) {')[1].split('\n    }\n')[0];
        // 화면 안 Set 으로만 가리면 새로고침에 사라진다. 서버가 새로 읽어 주는 값과
        // 같은 자리를 채워야 새로고침 뒤에도 같은 판정이 나온다.
        expect(fn).toContain('prescriptionQueue.sentKeysByUid[uid] = {');
        expect(fn).toContain('prescriptionQueue.sentLog = prescriptionQueue.sentLog || []');
        expect(ADMIN).not.toContain('prescriptionSent');
    });

    it('re-enables the button when the send fails', () => {
        const fn = ADMIN.split('async function sendPrescriptionFromQueue(uid, button) {')[1].split('\n    }\n')[0];
        const failure = fn.split('catch (e)')[1];
        expect(failure).toContain('button.disabled = false');
        expect(failure).not.toContain('prescriptionSent.add');
    });
});

describe('the queue reads only what it needs', () => {
    it('asks for eight weeks plus the partial week, not thirteen', () => {
        // 주차 키는 이번 주 시작일 기준이라 56일로는 비교 구간의 가장 오래된 주가 잘린다.
        expect(RUNTIME).toContain('const PRESCRIPTION_QUEUE_WINDOW_DAYS = 63;');
    });

    it('carries the heavy exercise lists for one week only', () => {
        expect(RUNTIME).toContain('const PRESCRIPTION_QUEUE_PRESENCE_DAYS = 7;');
        expect(RUNTIME).toContain('"exercise.cardioList", "exercise.strengthList",');
        // 8주치 조회에는 운동 목록이 없어야 한다.
        const numeric = RUNTIME.split('const PRESCRIPTION_QUEUE_NUMERIC_FIELDS = [')[1].split('];')[0];
        expect(numeric).not.toContain('exercise');
        expect(numeric).not.toContain('Url');
    });

    it('keeps the answer for a while instead of re-reading every click', () => {
        expect(RUNTIME).toContain('const PRESCRIPTION_QUEUE_CACHE_MS = 30 * 60 * 1000;');
        expect(RUNTIME).toContain('db.doc("meta/adminPrescriptionQueue")');
        expect(ADMIN).toContain('onclick="reloadPrescriptionQueue()"');
    });

    it('skips metrics that need a per-member subcollection', () => {
        // 체지방·골격근량·당화혈색소는 회원마다 따로 읽어야 해서 562명에게 쓸 수 없다.
        expect(QUEUE_FN).toContain('.filter((spec) => spec.scope === "both")');
    });
});

describe('the tab is reachable and explains itself', () => {
    it('sits next to member management', () => {
        expect(ADMIN).toContain('data-tab="prescriptions"');
        expect(ADMIN).toContain('<div id="tab-prescriptions" class="tab-panel">');
        expect(ADMIN).toContain("else if (name === 'prescriptions') await loadPrescriptionQueue(false);");
    });

    it('says out loud who was left out and why', () => {
        const fn = ADMIN.split('window.renderPrescriptionQueue = function() {')[1].split('\n    };')[0];
        expect(fn).toContain('미활동 제외');
        expect(fn).toContain('수신 거부');
        expect(fn).toContain('최근 보내서 대기');
        expect(fn).toContain('근거 부족·건너뜀');
    });
});
