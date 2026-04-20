import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource, readRepoFile } from './source-helpers.js';

function extractFunction(source, name) {
    const signature = `function ${name}`;
    const start = source.indexOf(signature);
    if (start === -1) {
        throw new Error(`Function not found: ${name}`);
    }
    const nextFunction = source.indexOf('\nfunction ', start + signature.length);
    if (nextFunction === -1) {
        return source.slice(start).trim();
    }
    return source.slice(start, nextFunction).trim();
}

function loadFunctions(relativePath, names) {
    const source = relativePath === 'js/app.js'
        ? readAppSource()
        : relativePath === 'functions/index.js'
            ? readFunctionsSource()
            : readRepoFile(relativePath);
    const snippets = names.map((name) => extractFunction(source, name));
    const factory = new Function(`${snippets.join('\n\n')}\nreturn { ${names.join(', ')} };`);
    return {
        source,
        functions: factory()
    };
}

function fakeTimestamp(isoString) {
    return {
        toDate() {
            return new Date(isoString);
        }
    };
}

describe('mint reset window alignment', () => {
    it('counts the pre-9am KST limit against the previous reset window in app helpers', () => {
        const { functions } = loadFunctions('js/app.js', [
            'getMintResetWindowInfo',
            'normalizeFirestoreTimestampLike',
            'summarizeMintWindowUsage'
        ]);
        const { summarizeMintWindowUsage } = functions;

        const summary = summarizeMintWindowUsage([
            {
                type: 'conversion',
                status: 'success',
                network: 'bsc',
                hbtReceived: 12000,
                timestamp: fakeTimestamp('2026-04-15T01:30:00.000Z')
            },
            {
                type: 'conversion',
                status: 'success',
                network: 'bsc',
                hbtReceived: 4000,
                timestamp: fakeTimestamp('2026-04-16T01:05:00.000Z')
            },
            {
                type: 'challenge_settlement',
                status: 'success',
                network: 'bsc',
                amount: 300,
                timestamp: fakeTimestamp('2026-04-15T02:00:00.000Z')
            }
        ], {
            networkTag: 'bsc',
            now: new Date('2026-04-15T23:30:00.000Z'),
            dailyMax: 12000
        });

        expect(summary.convertedHbt).toBe(12000);
        expect(summary.remainingHbt).toBe(0);
        expect(summary.totalEarnedHbt).toBe(12300);
        expect(summary.resetCopy).toContain('9');
        expect(summary.resetCopy).toContain('reset');
    });

    it('starts a fresh conversion window after 9am KST in app helpers', () => {
        const { functions } = loadFunctions('js/app.js', [
            'getMintResetWindowInfo',
            'normalizeFirestoreTimestampLike',
            'summarizeMintWindowUsage'
        ]);
        const { summarizeMintWindowUsage } = functions;

        const summary = summarizeMintWindowUsage([
            {
                type: 'conversion',
                status: 'success',
                network: 'bsc',
                hbtReceived: 12000,
                timestamp: fakeTimestamp('2026-04-15T01:30:00.000Z')
            },
            {
                type: 'conversion',
                status: 'success',
                network: 'bsc',
                hbtReceived: 4000,
                timestamp: fakeTimestamp('2026-04-16T01:05:00.000Z')
            }
        ], {
            networkTag: 'bsc',
            now: new Date('2026-04-16T00:10:00.000Z'),
            dailyMax: 12000
        });

        expect(summary.convertedHbt).toBe(4000);
        expect(summary.remainingHbt).toBe(8000);
    });

    it('keeps server-side daily limit checks on the same reset window and exposes reset copy', () => {
        const { source, functions } = loadFunctions('functions/index.js', [
            'getMintResetWindowInfo',
            'normalizeFirestoreTimestampLike',
            'sumSuccessfulConversionHbtInWindow',
            'buildMintDailyLimitMessage'
        ]);
        const {
            getMintResetWindowInfo,
            sumSuccessfulConversionHbtInWindow,
            buildMintDailyLimitMessage
        } = functions;

        const windowInfo = getMintResetWindowInfo(new Date('2026-04-15T23:30:00.000Z'));
        const usedHbt = sumSuccessfulConversionHbtInWindow([
            {
                data() {
                    return {
                        type: 'conversion',
                        status: 'success',
                        network: 'bsc',
                        hbtReceived: 12000,
                        timestamp: fakeTimestamp('2026-04-15T01:30:00.000Z')
                    };
                }
            },
            {
                data() {
                    return {
                        type: 'conversion',
                        status: 'success',
                        network: 'bsc',
                        hbtReceived: 4000,
                        timestamp: fakeTimestamp('2026-04-16T01:05:00.000Z')
                    };
                }
            }
        ], {
            networkTag: 'bsc',
            cycleStart: windowInfo.cycleStart,
            cycleEnd: windowInfo.cycleEnd
        });

        expect(usedHbt).toBe(12000);
        expect(buildMintDailyLimitMessage(12000, 12000)).toContain('9');
        expect(buildMintDailyLimitMessage(12000, 12000)).toContain('reset');
        expect(source).toContain('failureContext.errorName === "ExceedsUserDailyCap"');
    });
});
