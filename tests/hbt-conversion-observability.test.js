import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

describe('HBT conversion observability', () => {
    it('records attempt ids and richer mint logs on the server', () => {
        const source = readRepoFile('functions/index.js');

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
