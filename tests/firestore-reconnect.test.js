import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

describe('Firestore reconnect backoff', () => {
    it('keeps the shared reconnect scheduler and main offline warning hooks wired', () => {
        const firebaseConfigSource = readRepoFile('js/firebase-config.js');
        const appSource = readRepoFile('js/app.js');
        const authSource = readRepoFile('js/auth.js');
        const blockchainManagerSource = readRepoFile('js/blockchain-manager.js');

        expect(firebaseConfigSource).toContain('const FIRESTORE_RECONNECT_RETRY_DELAYS_MS = [1000, 3000];');
        expect(firebaseConfigSource).toContain('export function scheduleFirestoreReconnect');
        expect(firebaseConfigSource).toContain('export function noteFirestoreConnectivityFailure');
        expect(firebaseConfigSource).toContain("window.addEventListener('online'");

        expect(appSource).toContain("noteFirestoreConnectivityFailure(error, 'loadMyFriendships user cache seed');");
        expect(appSource).toContain("noteFirestoreConnectivityFailure(e, 'loadMetabolicScore');");
        expect(appSource).toContain("noteFirestoreConnectivityFailure(e, 'checkOnboarding');");
        expect(authSource).toContain("noteFirestoreConnectivityFailure(error, 'hydratePushTokenLinkState');");
        expect(blockchainManagerSource).toContain("noteFirestoreConnectivityFailure(error, 'initializeWalletState');");
    });
});
