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
    doc,
    getDoc,
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
        await assertSucceeds(updateDoc(userRef, {
            settings: { primaryHabit: 'diet' },
        }));
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

    it('lets only participants read their reaction reward ledger entry', async () => {
        const ownerDb = testEnv.authenticatedContext('owner').firestore();
        const outsiderDb = testEnv.authenticatedContext('outsider').firestore();
        await assertSucceeds(getDoc(doc(ownerDb, 'reaction_point_ledger/post_owner')));
        await assertFails(getDoc(doc(outsiderDb, 'reaction_point_ledger/post_owner')));
    });
});
