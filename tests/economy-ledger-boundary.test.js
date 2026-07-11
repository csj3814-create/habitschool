import { describe, expect, it } from 'vitest';
import { readFunctionsSource, readRepoFile } from './source-helpers.js';

describe('immutable bonus ledger boundary', () => {
    it('settles welcome bonuses atomically through one immutable entry', () => {
        const source = readFunctionsSource();

        expect(source).toContain('async function settleWelcomeBonus(uid)');
        expect(source).toContain('const ledgerEntry = ledgerRoot.collection("entries").doc("welcome_bonus")');
        expect(source).toContain('const result = await db.runTransaction(async (tx) => {');
        expect(source).toContain('if (ledgerSnap.exists || userData.welcomeBonusGiven === true)');
        expect(source).toContain('tx.create(ledgerEntry, {');
        expect(source).toContain('return settleWelcomeBonus(uid);');
        expect(source).toContain('targets.map(d => settleWelcomeBonus(d.id))');
    });

    it('deduplicates referral signup and day milestones with ledger entries', () => {
        const source = readFunctionsSource();

        expect(source).toContain('signupLedgerRoot.collection("entries").doc("referral_signup")');
        expect(source).toContain('if (userSnap.data()?.referredBy || signupLedgerSnap.exists)');
        expect(source).toContain('ledgerRoot.collection("entries").doc(`referral_day${streak}_${userId}`)');
        expect(source).toContain('if (ledgerSnap.exists || participant[flag] === true)');
        expect(source).toContain('source: "referral_milestone"');
    });

    it('keeps every client economy field server-owned', () => {
        const rules = readRepoFile('firestore.rules');

        for (const field of [
            'coins',
            'activeChallenge',
            'activeChallenges',
            'milestones',
            'currentStreak',
            'welcomeBonusGiven',
            'referredBy',
            'referralDay3BonusGiven',
            'referralDay7BonusGiven',
        ]) {
            expect(rules).toContain(`'${field}'`);
        }
        expect(rules).toContain('match /point_ledger/{ledgerId}');
        expect(rules).toContain('match /reward_evidence_ledger/{evidenceId}');
        expect(rules).toContain("logId == request.auth.uid + '_' + request.resource.data.date");
        expect(rules).toContain('allow write: if false;');
    });

    it('allows one-day offline replay but binds and claims each Storage generation once', () => {
        const source = readFunctionsSource();
        const pointsSource = readRepoFile('functions/points-utils.js');
        const stepStart = source.indexOf('exports.analyzeStepScreenshot = onCall');
        const stepEnd = source.indexOf('async function verifyDailyRewardMedia', stepStart);
        const stepSource = source.slice(stepStart, stepEnd);

        expect(source).toContain('isEvidenceCreatedWithinRewardWindow');
        expect(source).toContain('metadata?.timeCreated, context.logDate');
        expect(source).toContain('String(data.objectGeneration || "") !== objectGeneration');
        expect(stepStart).toBeGreaterThan(-1);
        expect(stepEnd).toBeGreaterThan(stepStart);
        expect(stepSource).toContain('const objectPath = parseFirebaseStorageObjectPath(imageUrl);');
        expect(stepSource).toContain('const [metadata] = await sourceFile.getMetadata();');
        expect(stepSource).toContain('bucket.file(objectPath, { generation: objectGeneration })');
        expect(stepSource).not.toContain('const imgResponse = await fetch(imageUrl);');
        expect(pointsSource).toContain('function getRewardEvidenceClaimId(userId, unit = {})');
        expect(source).toContain('db.doc(`reward_evidence_ledger/${evidenceId}`)');
        expect(source).toContain('tx.create(descriptor.reference, {');
        expect(source).toContain('|| claim.date !== logDate');
    });
});
