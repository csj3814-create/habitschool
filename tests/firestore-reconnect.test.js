import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('Firestore reconnect backoff', () => {
    it('keeps the shared reconnect scheduler and main offline warning hooks wired', () => {
        const firebaseConfigSource = readRepoFile('js/firebase-config.js');
        const appSource = readAppSource();
        const authSource = readRepoFile('js/auth.js');
        const blockchainManagerSource = readRepoFile('js/blockchain-manager.js');

        expect(firebaseConfigSource).toContain('const FIRESTORE_RECONNECT_RETRY_DELAYS_MS = [1000, 3000];');
        expect(firebaseConfigSource).toContain('initializeFirestore(app, {');
        expect(firebaseConfigSource).toContain('experimentalForceLongPolling: true');
        expect(firebaseConfigSource).toContain('experimentalLongPollingOptions:');
        expect(firebaseConfigSource).toContain('timeoutSeconds: 25');
        expect(firebaseConfigSource).toContain("setLogLevel('silent');");
        expect(firebaseConfigSource).toContain('export function scheduleFirestoreReconnect');
        expect(firebaseConfigSource).toContain('export function noteFirestoreConnectivityFailure');
        expect(firebaseConfigSource).toContain('export function isFirestoreConnectivityIssue');
        expect(firebaseConfigSource).toContain('reconnect probe still pending');
        expect(firebaseConfigSource).toContain("window.addEventListener('online'");

        expect(appSource).toContain("noteFirestoreConnectivityFailure(error, 'loadMyFriendships user cache seed')");
        expect(appSource).toContain("user cache seed deferred while Firestore reconnects");
        expect(appSource).toContain("noteFirestoreConnectivityFailure(e, 'loadMetabolicScore')");
        expect(appSource).toContain("noteFirestoreConnectivityFailure(e, 'checkOnboarding')");
        expect(authSource).toContain("noteFirestoreConnectivityFailure(error, 'hydratePushTokenLinkState');");
        expect(authSource).toContain("noteFirestoreConnectivityFailure(error, 'resolveLatestUserDocData');");
        expect(blockchainManagerSource).toContain("noteFirestoreConnectivityFailure(error, 'initializeWalletState')");
        expect(blockchainManagerSource).toContain('isFirestoreConnectivityIssue(error)');
        expect(blockchainManagerSource).toContain('[wallet] initialization deferred while Firestore reconnects:');
        expect(blockchainManagerSource).toContain('return getEffectiveWalletAddress() || window.__assetCachedWalletAddress || null;');
        expect(blockchainManagerSource).toContain('export function getWalletAddressForUI()');
        expect(blockchainManagerSource).toContain("noteFirestoreConnectivityFailure(error, 'settleExpiredChallenges');");
    });
});
