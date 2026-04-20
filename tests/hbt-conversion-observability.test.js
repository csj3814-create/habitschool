import { describe, expect, it } from 'vitest';
import { readFunctionsSource, readRepoFile } from './source-helpers.js';

describe('HBT conversion observability', () => {
    it('records attempt ids and richer mint logs on the server', () => {
        const source = readFunctionsSource();

        expect(source).toContain('function normalizeMintAttemptId');
        expect(source).toContain('function buildMintFailureLogContext');
        expect(source).toContain('[mintHBT] onchain mint failed; restoring points');
        expect(source).toContain('[mintHBT] success');
        expect(source).toContain('attemptId,');
        expect(source).toContain('transactionId: txRecordRef.id');
    });

    it('reconciles callable ambiguity against recent conversion records on the client', () => {
        const source = readRepoFile('js/blockchain-manager.js');

        expect(source).toContain('function buildMintAttemptId');
        expect(source).toContain('async function confirmRecentConversionAttempt');
        expect(source).toContain("getDocsFromServer(query(");
        expect(source).toContain('[mintHBT] recovered success after callable error');
        expect(source).toContain("const attemptId = buildMintAttemptId(currentUser.uid);");
    });
});
