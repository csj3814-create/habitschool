import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('Firestore reconnect backoff', () => {
    it('keeps the shared reconnect scheduler and main offline warning hooks wired', () => {
        const firebaseConfigSource = readRepoFile('js/firebase-config.js');
        const appSource = readAppSource();
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
