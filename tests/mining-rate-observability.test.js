import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const runtimeSource = fs.readFileSync(path.join(root, 'functions', 'runtime.js'), 'utf8');
const indexes = JSON.parse(fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8'));
const adminSource = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

describe('mining rate weekly decision observability', () => {
    it('stores evaluating, no-change, and failure outcomes', () => {
        expect(runtimeSource).toContain('status: "evaluating"');
        expect(runtimeSource).toContain('"no_change"');
        expect(runtimeSource).toContain('saveRateDecisionFailure');
        expect(runtimeSource).toContain('reason: "주간 검토 실패"');
    });

    it('keeps a fallback while the network-aware composite index is building', () => {
        expect(runtimeSource).toContain('Number(queryError?.code) !== 9');
        expect(runtimeSource).toContain('txData.network !== ACTIVE_CHAIN.networkTag');
    });

    it('declares the production query composite index', () => {
        const matchingIndex = indexes.indexes.find((index) =>
            index.collectionGroup === 'blockchain_transactions' &&
            ['network', 'status', 'type', 'date'].every((fieldPath) =>
                index.fields.some((field) => field.fieldPath === fieldPath)
            )
        );
        expect(matchingIndex).toBeTruthy();
    });

    it('shows weekly decisions and failures in the control tower', () => {
        expect(adminSource).toContain('매주 월요일 00:00 KST 자동 검토');
        expect(adminSource).toContain("error: ['결정 실패', 'badge-red']");
        expect(adminSource).toContain("no_change: ['변동 없음', 'badge-gray']");
    });
});
