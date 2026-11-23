import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
    deleteDoc,
    deleteField,
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc,
} from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const shouldRun = /^.+:\d+$/.test(emulatorHost);
const [host, rawPort] = emulatorHost.split(':');
let testEnv;

describe.skipIf(!shouldRun)('Firestore privacy and economy boundaries', () => {
    beforeAll(async () => {
        testEnv = await initializeTestEnvironment({
            projectId: 'habitschool-rules-test',
            firestore: {
                host,
                port: Number(rawPort),
                rules: readFileSync(resolve('firestore.rules'), 'utf8'),
            },
        });

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await setDoc(doc(db, 'users/owner'), {
                displayName: 'Owner',
                coins: 300,
                activeChallenges: {},
                milestones: {},
            });
            await setDoc(doc(db, 'daily_logs/owner_2026-07-11'), {
                userId: 'owner',
                date: '2026-07-11',
                diet: {},
                awardedPoints: {
                    diet: true,
                    exercise: false,
                    mind: false,
                    dietPoints: 10,
                    exercisePoints: 0,
                    mindPoints: 0,
                },
                rewardLedgerVersion: 2,
            });
            await setDoc(doc(db, 'gallery_posts/owner_2026-07-11'), {
                userId: 'owner',
                sourceLogId: 'owner_2026-07-11',
                schemaVersion: 1,
                diet: { breakfastUrl: 'https://firebasestorage.googleapis.com/example' },
            });
            await setDoc(doc(db, 'public_stats/guest_activity'), {
                windowDays: 7,
                recordCountBucket: '100+',
                activeUserCountBucket: '25+',
                updatedAt: new Date(),
            });
            await setDoc(doc(db, 'reaction_point_ledger/post_owner'), {
                reactorUserId: 'other',
                postOwnerId: 'owner',
                pointsPerUser: 1,
            });
            await setDoc(doc(db, 'point_ledger/owner_2026-07-11'), {
                userId: 'owner',
                date: '2026-07-11',
                version: 2,
            });
            await setDoc(doc(db, 'point_ledger/owner_2026-07-11/entries/earned_diet_30'), {
                userId: 'owner',
                date: '2026-07-11',
                category: 'diet',
                points: 30,
            });
            await setDoc(doc(db, 'reward_evidence_ledger/evidence-1'), {
                userId: 'owner',
                sourceLogId: 'owner_2026-07-11',
                category: 'diet',
                objectGeneration: '12345',
            });
        });
    });

    afterAll(async () => {
        await testEnv?.clearFirestore();
        await testEnv?.cleanup();
    });

    it('keeps private daily logs owner-only', async () => {
        const anonymousDb = testEnv.unauthenticatedContext().firestore();
        const ownerDb = testEnv.authenticatedContext('owner').firestore();
        const otherDb = testEnv.authenticatedContext('other').firestore();

        await assertFails(getDoc(doc(anonymousDb, 'daily_logs/owner_2026-07-11')));
        await assertSucceeds(getDoc(doc(ownerDb, 'daily_logs/owner_2026-07-11')));
        await assertFails(getDoc(doc(otherDb, 'daily_logs/owner_2026-07-11')));
    });

    it('allows only public activity stats to signed-out visitors', async () => {
        const anonymousDb = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(getDoc(doc(anonymousDb, 'public_stats/guest_activity')));
        await assertFails(getDoc(doc(anonymousDb, 'gallery_posts/owner_2026-07-11')));
    });

    it('allows signed-in gallery reads but keeps writes server-owned', async () => {
        const ownerDb = testEnv.authenticatedContext('owner').firestore();
        const otherDb = testEnv.authenticatedContext('other').firestore();
        await assertSucceeds(getDoc(doc(otherDb, 'gallery_posts/owner_2026-07-11')));
        await assertFails(updateDoc(doc(ownerDb, 'gallery_posts/owner_2026-07-11'), {
            userName: 'forged',
        }));
        await assertFails(deleteDoc(doc(ownerDb, 'gallery_posts/owner_2026-07-11')));
        await assertSucceeds(updateDoc(doc(ownerDb, 'daily_logs/owner_2026-07-11'), {
            shareSettings: {
                hideIdentity: false,
                hideDate: false,
                hideDiet: true,
                hideExercise: true,
                hidePoints: false,
                hideMind: true,
                hideMindText: true,
            },
        }));
    });

    it('rejects client-authored point and streak fields on daily logs', async () => {
        const ownerDb = testEnv.authenticatedContext('owner').firestore();
        await assertSucceeds(setDoc(doc(ownerDb, 'daily_logs/owner_2026-07-10'), {
            userId: 'owner',
            date: '2026-07-10',
            diet: {},
            shareSettings: { hideIdentity: true },
        }));
        await assertFails(setDoc(doc(ownerDb, 'daily_logs/owner_2026-07-09'), {
            userId: 'owner',
            date: '2026-07-09',
            awardedPoints: { dietPoints: 30 },
        }));
        await assertFails(setDoc(doc(ownerDb, 'daily_logs/noncanonical-id'), {
            userId: 'owner',
            date: '2026-07-09',
            diet: {},
        }));
        await assertFails(updateDoc(doc(ownerDb, 'daily_logs/owner_2026-07-11'), {
            date: '2026-07-12',
        }));
        await assertFails(updateDoc(doc(ownerDb, 'daily_logs/owner_2026-07-11'), {
            currentStreak: 999,
        }));
    });

    it('blocks client economy/challenge/milestone writes while allowing settings', async () => {
        const ownerDb = testEnv.authenticatedContext('owner').firestore();
        const userRef = doc(ownerDb, 'users/owner');
        await assertFails(updateDoc(userRef, { coins: 999999 }));
        await assertFails(updateDoc(userRef, { activeChallenges: { weekly: { status: 'claimable' } } }));
        await assertFails(updateDoc(userRef, { milestones: { streak1: { bonusClaimed: true } } }));
        await assertFails(updateDoc(userRef, { currentStreak: 999 }));
        await assertFails(updateDoc(userRef, { welcomeBonusGiven: true }));
        await assertFails(updateDoc(userRef, { referredBy: 'attacker' }));
        await assertFails(updateDoc(userRef, { referralDay3BonusGiven: true }));
        await assertFails(updateDoc(userRef, { referralDay7BonusGiven: true }));
        // 해빛 배지는 서버(claimFeatureBadge)만 준다. 회원이 직접 적어 기능을 열 수 없다.
        await assertFails(updateDoc(userRef, { featureBadges: { first: { cost: 0 } } }));
        await assertFails(updateDoc(userRef, { 'featureBadges.haebit': { cost: 0 } }));
        await assertFails(setDoc(doc(ownerDb, 'meta/featureUnlock'), { enabled: false }));
        await assertSucceeds(updateDoc(userRef, {
            settings: { primaryHabit: 'diet' },
        }));
    });

    // 2026-11-23 설계 4-0: 첫 기록 결과 창의 선택(js/app-core.js recordFirstRecordReturn)이 규칙에 막히지 않는다.
    // 2026-08 consents 처럼 화이트리스트에 없으면 화면은 멀쩡하고 쓰기만 조용히 거부된다.
    it('lets a member record the first-record result choice under settings', async () => {
        const ownerDb = testEnv.authenticatedContext('owner').firestore();
        const userRef = doc(ownerDb, 'users/owner');
        await assertSucceeds(setDoc(userRef, {
            settings: { firstRecordReturn: { path: 'notify', choice: '', result: '', at: serverTimestamp() } },
        }, { merge: true }));
        await assertSucceeds(setDoc(userRef, { settings: { firstRecordReturn: { choice: 'accept' } } }, { merge: true }));
        await assertSucceeds(setDoc(userRef, { settings: { firstRecordReturn: { result: 'granted' } } }, { merge: true }));
        const saved = (await getDoc(userRef)).data().settings.firstRecordReturn;
        if (saved.path !== 'notify' || saved.choice !== 'accept' || saved.result !== 'granted' || !saved.at) {
            throw new Error(`merge lost a field: ${JSON.stringify(saved)}`);
        }
    });

    describe('clinic pilot link (2026-11-17)', () => {
        beforeAll(async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const db = context.firestore();
                await setDoc(doc(db, 'clinics/joseph'), { name: '요셉의원', directorName: '고영초', active: true });
                await setDoc(doc(db, 'clinics/simon'), { name: '내과의사 사이먼', directorName: '오기창', active: true });
                await setDoc(doc(db, 'admins/admin'), { role: 'admin' });
                await setDoc(doc(db, 'users/patient'), { displayName: 'Patient', settings: {} });
            });
        });

        it('lets anyone read a clinic but only an admin write one', async () => {
            const guestDb = testEnv.unauthenticatedContext().firestore();
            const memberDb = testEnv.authenticatedContext('patient').firestore();
            const adminDb = testEnv.authenticatedContext('admin').firestore();
            await assertSucceeds(getDoc(doc(guestDb, 'clinics/joseph')));
            await assertFails(setDoc(doc(guestDb, 'clinics/fake'), { name: 'x' }));
            await assertFails(setDoc(doc(memberDb, 'clinics/joseph'), { name: '바꾼 이름' }, { merge: true }));
            await assertSucceeds(setDoc(doc(adminDb, 'clinics/joseph'), { greeting: '' }, { merge: true }));
        });

        it('links a member to an existing clinic with a server timestamp only', async () => {
            const memberDb = testEnv.authenticatedContext('patient').firestore();
            const userRef = doc(memberDb, 'users/patient');
            await assertFails(setDoc(userRef, { clinicId: 'nowhere', clinicLinkedAt: serverTimestamp() }, { merge: true }));
            await assertFails(setDoc(userRef, { clinicId: 'Joseph!', clinicLinkedAt: serverTimestamp() }, { merge: true }));
            await assertFails(setDoc(userRef, { clinicId: 'joseph', clinicLinkedAt: new Date('2020-01-01') }, { merge: true }));
            await assertFails(setDoc(userRef, { clinicId: 'joseph' }, { merge: true }));
            await assertSucceeds(setDoc(userRef, { clinicId: 'joseph', clinicLinkedAt: serverTimestamp() }, { merge: true }));
            // 다른 병원으로 바꾸기(앱이 먼저 확인을 받는다)와 연결 해제
            await assertSucceeds(setDoc(userRef, { clinicId: 'simon', clinicLinkedAt: serverTimestamp() }, { merge: true }));
            await assertFails(updateDoc(userRef, { clinicLinkedAt: deleteField() }));
            await assertSucceeds(updateDoc(userRef, { clinicId: deleteField(), clinicLinkedAt: deleteField() }));
            // 다른 필드 저장은 병원 검사와 무관하게 그대로 된다
            await assertSucceeds(updateDoc(userRef, { settings: { primaryHabit: 'diet' } }));
        });

        it('lets a brand-new member doc carry the clinic link', async () => {
            const newDb = testEnv.authenticatedContext('newcomer').firestore();
            await assertFails(setDoc(doc(newDb, 'users/newcomer'), { displayName: 'N', clinicId: 'nowhere', clinicLinkedAt: serverTimestamp() }));
            await assertSucceeds(setDoc(doc(newDb, 'users/newcomer'), { displayName: 'N', clinicId: 'joseph', clinicLinkedAt: serverTimestamp() }));
        });

        it('never lets another member read the patient doc', async () => {
            const otherDb = testEnv.authenticatedContext('someone-else').firestore();
            await assertFails(getDoc(doc(otherDb, 'users/patient')));
            await assertFails(setDoc(doc(otherDb, 'users/patient'), { clinicId: 'joseph', clinicLinkedAt: serverTimestamp() }, { merge: true }));
        });
    });

    it('keeps the point ledger immutable and owner-readable', async () => {
        const ownerDb = testEnv.authenticatedContext('owner').firestore();
        const outsiderDb = testEnv.authenticatedContext('outsider').firestore();
        const entryPath = 'point_ledger/owner_2026-07-11/entries/earned_diet_30';

        await assertSucceeds(getDoc(doc(ownerDb, 'point_ledger/owner_2026-07-11')));
        await assertSucceeds(getDoc(doc(ownerDb, entryPath)));
        await assertFails(getDoc(doc(outsiderDb, entryPath)));
        await assertFails(updateDoc(doc(ownerDb, entryPath), { points: 3000 }));
        await assertSucceeds(getDoc(doc(ownerDb, 'reward_evidence_ledger/evidence-1')));
        await assertFails(getDoc(doc(outsiderDb, 'reward_evidence_ledger/evidence-1')));
        await assertFails(updateDoc(doc(ownerDb, 'reward_evidence_ledger/evidence-1'), {
            objectGeneration: '99999',
        }));
    });

    it('accepts a typed sleep duration but rejects impossible values', async () => {
        // sleepAndMind 는 healthProfile 과 달리 키 화이트리스트가 엄격하다.
        // 규칙에 sleepHours 를 넣지 않으면 수면 시간 쓰기가 통째로 거부된다.
        const ownerDb = testEnv.authenticatedContext('owner').firestore();
        const logRef = doc(ownerDb, 'daily_logs/owner_2026-07-11');

        await assertSucceeds(updateDoc(logRef, { sleepAndMind: { sleepHours: 7.5 } }));
        await assertSucceeds(updateDoc(logRef, { sleepAndMind: { sleepHours: 0 } }));
        await assertSucceeds(updateDoc(logRef, { sleepAndMind: { sleepHours: 24 } }));
        await assertSucceeds(updateDoc(logRef, { sleepAndMind: { sleepHours: null } }));

        // 범위를 벗어나거나 타입이 틀리면 막는다.
        await assertFails(updateDoc(logRef, { sleepAndMind: { sleepHours: 25 } }));
        await assertFails(updateDoc(logRef, { sleepAndMind: { sleepHours: -1 } }));
        await assertFails(updateDoc(logRef, { sleepAndMind: { sleepHours: '7시간' } }));

        // 화이트리스트에 없는 키는 여전히 거부되어야 한다.
        await assertFails(updateDoc(logRef, { sleepAndMind: { sleepMinutes: 450 } }));
    });

    it('accepts the Health Connect night alongside the typed hours', async () => {
        const ownerDb = testEnv.authenticatedContext('owner').firestore();
        const logRef = doc(ownerDb, 'daily_logs/owner_2026-07-11');

        await assertSucceeds(updateDoc(logRef, {
            sleepAndMind: {
                sleepHours: 7.2,
                sleepSync: { source: 'health_connect', asleepMinutes: 432, wakeDate: '2026-07-11' }
            }
        }));
        await assertSucceeds(updateDoc(logRef, { sleepAndMind: { sleepSync: null } }));
        await assertFails(updateDoc(logRef, { sleepAndMind: { sleepSync: '7시간' } }));
    });

    it('lets only participants read their reaction reward ledger entry', async () => {
        const ownerDb = testEnv.authenticatedContext('owner').firestore();
        const outsiderDb = testEnv.authenticatedContext('outsider').firestore();
        await assertSucceeds(getDoc(doc(ownerDb, 'reaction_point_ledger/post_owner')));
        await assertFails(getDoc(doc(outsiderDb, 'reaction_point_ledger/post_owner')));
    });

    // 2026-06-12 부터 일반 회원 인증이 한 건도 들어가지 않았다. 앱은 쓰기 전에 오늘 인증을 읽는데,
    // 아직 없는 문서는 resource 가 null 이라 관리자만 읽기를 통과했다.
    describe('habit group check-ins for ordinary members', () => {
        const groupId = 'exercise-running-club';
        const date = '2026-11-06';
        const checkinPath = (uid) => `habit_group_checkins/${groupId}_${date}_${uid}`;
        // 앱이 처음 보내는 내용과 같다(js/app-core.js syncHabitGroupCheckinsForDailyLog).
        const firstCheckin = (uid) => ({
            groupId,
            groupType: 'exercise',
            groupTitle: '러닝 클럽',
            uid,
            displayName: '회원',
            photoURL: null,
            date,
            dailyLogId: `${uid}_${date}`,
            source: 'exercise',
            recordTab: 'exercise',
            recordSource: 'exercise',
            mediaThumbUrl: '',
            exerciseSummary: '유산소 1건',
            exerciseSnapshot: { cardioList: [], strengthList: [] },
            stepsSnapshot: { count: 0, minSteps: null, source: 'exercise' },
            reviewStatus: 'pending',
            countsTowardReward: true,
            rewardProgressId: `${groupId}_${uid}`,
            updatedAt: new Date(),
            createdAt: new Date(),
            reviewedBy: deleteField(),
            reviewedAt: deleteField(),
            reviewNote: deleteField(),
            approvedAt: deleteField(),
            rejectedAt: deleteField(),
        });

        beforeAll(async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
                const db = context.firestore();
                await setDoc(doc(db, `habit_group_members/${groupId}_runner`), { groupId, uid: 'runner', active: true, role: 'member' });
                await setDoc(doc(db, `habit_group_members/${groupId}_captain`), { groupId, uid: 'captain', active: true, role: 'leader' });
            });
        });

        it('lets a member read their own check-in before it exists, then write it', async () => {
            const db = testEnv.authenticatedContext('runner').firestore();
            const ref = doc(db, checkinPath('runner'));
            await assertSucceeds(getDoc(ref));
            await assertSucceeds(setDoc(ref, firstCheckin('runner'), { merge: true }));
            await assertSucceeds(getDoc(ref));
        });

        it('lets a leader who is not an admin do the same', async () => {
            const db = testEnv.authenticatedContext('captain').firestore();
            const ref = doc(db, checkinPath('captain'));
            await assertSucceeds(getDoc(ref));
            await assertSucceeds(setDoc(ref, firstCheckin('captain'), { merge: true }));
        });

        it('does not let a member probe or read another check-in', async () => {
            const db = testEnv.authenticatedContext('outsider').firestore();
            await assertFails(getDoc(doc(db, checkinPath('nobody-yet'))));
            await assertFails(getDoc(doc(db, checkinPath('runner'))));
        });

        it('does not treat an id that merely ends with the uid as their own', async () => {
            const db = testEnv.authenticatedContext('runner').firestore();
            await assertFails(getDoc(doc(db, 'habit_group_checkins/anything_runner')));
            await assertFails(getDoc(doc(db, `habit_group_checkins/${groupId}_${date}_x_runner`)));
        });
    });
});
