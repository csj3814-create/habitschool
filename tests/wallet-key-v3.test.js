import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { createRequire } from 'node:module';

const managerSource = readRepoFile('js/blockchain-manager.js');
const require = createRequire(import.meta.url);
const { _test: pepperFn } = require('../functions/wallet-key-pepper.js');

function extractFunctionSource(source, functionName) {
    let start = source.indexOf(`function ${functionName}(`);
    if (start < 0) throw new Error(`Missing function: ${functionName}`);
    // async를 빼고 잘라내면 안에 있는 await가 문법 오류가 된다.
    if (source.slice(start - 6, start) === 'async ') start -= 6;
    const bodyStart = source.indexOf(') {', start) + 2;
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unclosed function: ${functionName}`);
}

function load(names, target) {
    const parts = names.map((name) => extractFunctionSource(managerSource, name));
    return Function(parts.join(';') + '; return ' + target + ';')();
}

const deriveEncryptionKeyV3 = load(['deriveEncryptionKeyV3'], 'deriveEncryptionKeyV3');
const deriveEncryptionKey = load(['deriveEncryptionKey'], 'deriveEncryptionKey');
const encryptWithKey = load(['encryptWithKey'], 'encryptWithKey');

async function decryptWithKey(payload, key) {
    const ivArray = new Uint8Array(atob(payload.iv).split('').map((c) => c.charCodeAt(0)));
    const data = new Uint8Array(atob(payload.encrypted).split('').map((c) => c.charCodeAt(0)));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivArray }, key, data);
    return new TextDecoder().decode(plain);
}

const UID = 'abcUID123';
const EMAIL = 'member@example.com';
const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

describe('지갑 키 v3', () => {
    it('서버 비밀 조각으로 암호화하고 같은 조각으로 다시 푼다', async () => {
        const pepper = 'a'.repeat(64);
        const key = await deriveEncryptionKeyV3(pepper, UID, EMAIL);
        const payload = await encryptWithKey(PRIVATE_KEY, key);
        expect(await decryptWithKey(payload, key)).toBe(PRIVATE_KEY);
    });

    it('조각이 다르면 열리지 않는다 — 이것이 이번 수정의 핵심이다', async () => {
        const good = await deriveEncryptionKeyV3('a'.repeat(64), UID, EMAIL);
        const payload = await encryptWithKey(PRIVATE_KEY, good);
        const wrong = await deriveEncryptionKeyV3('b'.repeat(64), UID, EMAIL);
        await expect(decryptWithKey(payload, wrong)).rejects.toThrow();
    });

    it('uid와 email만 아는 쪽은 열 수 없다', async () => {
        // v2는 이 두 가지만으로 키가 나왔다. v3는 나오면 안 된다.
        const v3 = await deriveEncryptionKeyV3('c'.repeat(64), UID, EMAIL);
        const payload = await encryptWithKey(PRIVATE_KEY, v3);
        const v2 = await deriveEncryptionKey(UID, EMAIL);
        await expect(decryptWithKey(payload, v2)).rejects.toThrow();
    });

    it('v3 파생은 uid를 비밀번호로 쓰지 않는다', () => {
        const source = extractFunctionSource(managerSource, 'deriveEncryptionKeyV3');
        expect(source).toContain('encoder.encode(pepper)');
        expect(source).not.toContain('encoder.encode(uid)');
    });

    it('조각을 Firestore에 저장하지 않는다', () => {
        // 저장하면 v2와 똑같아진다. 문서 옆에 열쇠를 두는 셈이다.
        expect(managerSource).not.toMatch(/pepper\s*:\s*pepper/);
        expect(managerSource).not.toContain('walletKeyPepper:');
    });

    it('v2를 v3로 올릴 때 주소를 건드리지 않는다', () => {
        const source = extractFunctionSource(managerSource, 'upgradeWalletKeyToV3');
        expect(source).toContain('walletVersion: WALLET_VERSION_PEPPERED');
        // 주소를 다시 쓰면 그 지갑의 HBT를 잃는다.
        expect(source).not.toContain('walletAddress:');
        // v2 암호문을 남겨 두면 그것만으로 예전처럼 열 수 있어 수정이 무의미해진다.
        expect(source).not.toContain('walletKeyV2Backup');
    });

    it('지갑을 복원하는 두 길 모두에서 전환을 시도한다', () => {
        // 2026-11-10 배포 직후 확인. 앱이 실제로 타는 길은 외부지갑 우선 복원이고,
        // initializeUserWallet까지 가지 않는다. 한쪽에만 걸어 두면 아무도 올라가지 않는다.
        const restore = extractFunctionSource(managerSource, 'restoreExternalFirstWalletState');
        expect(restore).toContain('upgradeWalletKeyToV3(');
        const initialize = extractFunctionSource(managerSource, 'initializeUserWallet');
        expect(initialize).toContain('upgradeWalletKeyToV3(');
    });

    it('조각을 못 받으면 v2 지갑은 그대로 열리고 새 지갑은 v2로 만든다', () => {
        const source = extractFunctionSource(managerSource, 'encryptUserPrivateKey');
        expect(source).toContain('walletVersion: WALLET_VERSION_LEGACY');
    });
});

describe('서버에서 앱까지 한 바퀴', () => {
    it('서버가 만든 조각으로 암호화한 개인키를 같은 조각으로 되찾는다', async () => {
        // 함수가 내려주는 값과 앱이 쓰는 파생을 실제로 이어 본다.
        const secret = 'production-like-secret-0123456789abcdef';
        const pepper = pepperFn.derivePepper(secret, UID);
        const key = await deriveEncryptionKeyV3(pepper, UID, EMAIL);
        const payload = await encryptWithKey(PRIVATE_KEY, key);

        const again = await deriveEncryptionKeyV3(pepperFn.derivePepper(secret, UID), UID, EMAIL);
        expect(await decryptWithKey(payload, again)).toBe(PRIVATE_KEY);

        // 비밀이 바뀌면(= 비밀을 잃으면) 되찾을 수 없다. 이 점을 운영에서 기억해야 한다.
        const otherSecret = pepperFn.derivePepper('a-different-secret-9876543210', UID);
        const otherKey = await deriveEncryptionKeyV3(otherSecret, UID, EMAIL);
        await expect(decryptWithKey(payload, otherKey)).rejects.toThrow();
    });
});

describe('서버 비밀 조각 함수', () => {
    it('같은 비밀과 uid면 항상 같은 값이 나온다', () => {
        const a = pepperFn.derivePepper('secret-value-1234567890123456', UID);
        const b = pepperFn.derivePepper('secret-value-1234567890123456', UID);
        expect(a).toBe(b);
        expect(a).toHaveLength(64);
    });

    it('사용자가 다르면 값이 다르다', () => {
        const a = pepperFn.derivePepper('secret-value-1234567890123456', 'uid-one');
        const b = pepperFn.derivePepper('secret-value-1234567890123456', 'uid-two');
        expect(a).not.toBe(b);
    });

    it('비밀이 바뀌면 값이 바뀐다', () => {
        const a = pepperFn.derivePepper('secret-value-1234567890123456', UID);
        const b = pepperFn.derivePepper('another-secret-098765432109876', UID);
        expect(a).not.toBe(b);
    });
});
