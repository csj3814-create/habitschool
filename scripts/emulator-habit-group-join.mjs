// 에뮬레이터 전용: 실제 joinHabitGroup 함수로 "한 번에 한 모임"과 "보상 받은 4주가 끝나야 새로 시작"을 본다.
// 운영·스테이징 데이터는 건드리지 않는다.
//
//   firebase emulators:exec --only auth,firestore,functions --project demo-habitschool "node scripts/emulator-habit-group-join.mjs"
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-habitschool';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/asia-northeast3`;
const ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '통과' : '실패'}  ${name} ${extra}`); if (!ok) failed++; };
const kst = (o = 0) => new Date(Date.now() + 9 * 3600000 + o * 86400000).toISOString().slice(0, 10);
const val = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
const put = (p, o) => fetch(`${FS}/${p}`, { method: 'PATCH', headers: ADMIN, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }) });

async function signUp(email) {
    const r = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'emulator-only-123', returnSecureToken: true }) })).json();
    return { uid: r.localId, token: r.idToken };
}
async function join(user, groupId) {
    const r = await fetch(`${FN}/joinHabitGroup`, { method: 'POST', headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { groupId } }) });
    const j = await r.json();
    return j.error ? { ok: false, message: j.error.message } : { ok: true, ...j.result };
}

const a = await signUp(`join-a-${Date.now()}@example.test`);
await put(`users/${a.uid}`, { coins: 2000 });
let r = await join(a, 'exercise-walking-10000');
check('첫 모임 가입', r.ok, r.message || '');
r = await join(a, 'exercise-gym-checkin');
check('두 번째 모임은 막힘', !r.ok && /최대 1개/.test(r.message), r.message);

// 보상을 받은 바퀴: 오늘 끝나지 않았다
const b = await signUp(`join-b-${Date.now()}@example.test`);
await put(`users/${b.uid}`, { coins: 2000 });
await put(`exercise_group_reward_progress/exercise-walking-10000_${b.uid}`, { groupId: 'exercise-walking-10000', uid: b.uid, round: 1, startedDate: kst(-14), windowEndDate: kst(13), rewardStatus: 'paid', approvedCount: 14, finishedAt: 'x' });
await put(`habit_group_members/exercise-walking-10000_${b.uid}`, { groupId: 'exercise-walking-10000', uid: b.uid, active: false, role: 'member' });
r = await join(b, 'exercise-gym-checkin');
check('보상 받은 4주 안에는 다른 모임 막힘', !r.ok && r.message.includes(kst(13)), r.message);
r = await join(b, 'exercise-walking-10000');
check('같은 모임 다시 시작도 막힘', !r.ok && r.message.includes(kst(13)), r.message);

// 그 4주가 어제 끝났다
await put(`exercise_group_reward_progress/exercise-walking-10000_${b.uid}`, { groupId: 'exercise-walking-10000', uid: b.uid, round: 1, startedDate: kst(-28), windowEndDate: kst(-1), rewardStatus: 'paid', approvedCount: 14, finishedAt: 'x' });
r = await join(b, 'exercise-gym-checkin');
check('4주가 끝난 다음 날부터는 가입', r.ok, r.message || '');

// 채우기 전에 나가면 바로 옮길 수 있다
const c = await signUp(`join-c-${Date.now()}@example.test`);
await put(`users/${c.uid}`, { coins: 2000 });
await put(`exercise_group_reward_progress/exercise-walking-10000_${c.uid}`, { groupId: 'exercise-walking-10000', uid: c.uid, round: 1, startedDate: kst(-3), windowEndDate: kst(24), rewardStatus: 'in_progress', approvedCount: 2 });
await put(`habit_group_members/exercise-walking-10000_${c.uid}`, { groupId: 'exercise-walking-10000', uid: c.uid, active: false, role: 'member' });
r = await join(c, 'exercise-home-training');
check('채우기 전에 나가면 다른 모임 가입', r.ok, r.message || '');

console.log(`실패 ${failed}건`);
process.exit(failed ? 1 : 0);
