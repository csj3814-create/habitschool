import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const managerSource = readRepoFile('js/blockchain-manager.js');

function loadNamedFunction(source, functionName) {
    const start = source.indexOf(`function ${functionName}(`);
    if (start < 0) throw new Error(`Missing function: ${functionName}`);
    const bodyStart = source.indexOf(') {', start) + 2;
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) {
            const functionSource = source.slice(start, index + 1);
            return Function(`${functionSource}; return ${functionName};`)();
        }
    }
    throw new Error(`Unclosed function: ${functionName}`);
}

describe('app wallet bootstrap', () => {
    it('deduplicates concurrent external-first initialization', () => {
        expect(managerSource).toContain('let externalFirstWalletInitPromise = null;');
        expect(managerSource).toContain('if (externalFirstWalletInitPromise) {\n        return externalFirstWalletInitPromise;\n    }');
        expect(managerSource).toContain('const initPromise = initializeWalletExternalFirstOnce(options);');
        expect(managerSource).toContain('if (externalFirstWalletInitPromise === initPromise) {');
        expect(managerSource).toContain('externalFirstWalletInitPromise = null;');
    });

    it('restores an external or existing app wallet before provisioning', () => {
        const restoreInitial = managerSource.indexOf(
            'const restoredAddress = await restoreExternalFirstWalletState(currentUser, userData);'
        );
        const freshRead = managerSource.indexOf('const freshUserSnap = await getDocFromServer(userRef);');
        const restoreFresh = managerSource.indexOf(
            'const freshRestoredAddress = await restoreExternalFirstWalletState(currentUser, freshUserData);'
        );
        const provision = managerSource.indexOf('const provisionedAddress = await initializeUserWallet({');

        expect(restoreInitial).toBeGreaterThan(-1);
        expect(freshRead).toBeGreaterThan(restoreInitial);
        expect(restoreFresh).toBeGreaterThan(freshRead);
        expect(provision).toBeGreaterThan(restoreFresh);
        expect(managerSource).toContain('if (userData.externalWalletAddress) {');
        expect(managerSource).toContain('const hasActiveExternalWallet = !!externalWalletAddress && !!externalWalletProvider;');
    });

    it('requires an authoritative server read before creating a missing wallet', () => {
        expect(managerSource).toContain('// Re-read from the server so an external or existing app wallet always wins.');
        expect(managerSource).toContain('forceServer: true,\n            requireFreshSnapshotForCreate: true');
        expect(managerSource).toContain('if (requireFreshSnapshotForCreate) throw error;');
        expect(managerSource).toContain('if (requireFreshSnapshotForCreate && userSnap.metadata?.fromCache) {');
        expect(managerSource).toContain('[wallet] creation deferred until a fresh server snapshot is available');
    });

    it('prepares a wallet before calling the irreversible point conversion', () => {
        const convertStart = managerSource.indexOf('export async function convertPointsToHBT(pointAmount)');
        const convertEnd = managerSource.indexOf('export async function fetchOnchainBalance', convertStart);
        const conversion = managerSource.slice(convertStart, convertEnd);
        const walletPrepare = conversion.indexOf('const walletAddress = await initializeWalletExternalFirst();');
        const callable = conversion.indexOf('const result = await mintHBTFunction({ pointAmount, attemptId });');

        expect(walletPrepare).toBeGreaterThan(-1);
        expect(callable).toBeGreaterThan(walletPrepare);
        expect(conversion).toContain('if (!walletAddress) {');
        expect(conversion).toContain('HBT 지갑을 준비하지 못했습니다');
    });

    it('classifies persisted wallet ownership before a candidate may be written', () => {
        const resolveDecision = loadNamedFunction(managerSource, 'resolveWalletPersistenceDecision');

        expect(resolveDecision({ externalWalletAddress: ' 0xexternal ' })).toEqual({
            action: 'restore',
            source: 'external'
        });
        expect(resolveDecision({ walletAddress: '0xlegacy' })).toEqual({
            action: 'restore',
            source: 'app'
        });
        expect(resolveDecision({ walletVersion: 2, encryptedKey: 'cipher', walletIv: 'iv' })).toEqual({
            action: 'restore',
            source: 'app'
        });
        expect(resolveDecision({})).toEqual({ action: 'create', source: 'none' });
    });

    it('uses a Firestore compare-and-set and restores the winning wallet on a race', () => {
        const transactionStart = managerSource.indexOf('const persistenceResult = await runTransaction(db, async (transaction) => {');
        const latestRead = managerSource.indexOf('const latestSnap = await transaction.get(userRef);', transactionStart);
        const decision = managerSource.indexOf('const decision = resolveWalletPersistenceDecision(latestUserData);', latestRead);
        const candidateWrite = managerSource.indexOf('transaction.set(userRef, candidateWalletData, { merge: true });', decision);
        const winnerRestore = managerSource.indexOf('const winnerAddress = await restoreExternalFirstWalletState(', candidateWrite);

        expect(managerSource).toContain('getDocsFromServer, runTransaction, collection');
        expect(transactionStart).toBeGreaterThan(-1);
        expect(latestRead).toBeGreaterThan(transactionStart);
        expect(decision).toBeGreaterThan(latestRead);
        expect(candidateWrite).toBeGreaterThan(decision);
        expect(winnerRestore).toBeGreaterThan(candidateWrite);
        expect(managerSource).toContain('if (!persistenceResult.created) {');
        expect(managerSource).toContain('resetExternalFirstWalletRuntimeState();');
    });
});
