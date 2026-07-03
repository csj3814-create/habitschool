#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { ethers } = require("../functions/node_modules/ethers");
const contractAbi = require("../functions/contract-abi.json");

const PROJECT_ALIASES = {
    prod: "habitschool-8497b",
    production: "habitschool-8497b",
    staging: "habitschool-staging",
    "habitschool-8497b": "habitschool-8497b",
    "habitschool-staging": "habitschool-staging"
};

const PROJECT_ID = PROJECT_ALIASES[getArgValue("--project") || "prod"];
const APPLY = process.argv.includes("--apply");
const REASON = "challenge_bonus_backfill_2026_07_04";
const HBT_DECIMALS = 8;
const CHALLENGE_DAILY_MIN_POINTS = 65;
const BONUS_BPS = { weekly: 5000, master: 20000 };
const TIER_FROM_CHALLENGE_ID = {
    "challenge-7d": "weekly",
    "challenge-all-7d": "weekly",
    "challenge-diet-7d": "weekly",
    "challenge-exercise-7d": "weekly",
    "challenge-mind-7d": "weekly",
    "challenge-30d": "master",
    "challenge-all-30d": "master",
    "challenge-diet-30d": "master",
    "challenge-exercise-30d": "master",
    "challenge-mind-30d": "master"
};

if (!PROJECT_ID) {
    throw new Error("Unknown project. Use --project prod or --project staging.");
}

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const env = loadProjectEnv(PROJECT_ID);
const CHAIN_KEY = env.ONCHAIN_NETWORK === "mainnet" ? "mainnet" : "testnet";
const CHAIN = CHAIN_KEY === "mainnet"
    ? {
        networkTag: "bsc",
        chainId: 56,
        rpcUrl: "https://bsc-dataseed.binance.org/",
        habitAddress: env.HABIT_MAINNET_ADDRESS || "0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29"
    }
    : {
        networkTag: "bscTestnet",
        chainId: 97,
        rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545/",
        habitAddress: env.HABIT_TESTNET_ADDRESS || "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B"
    };

function getArgValue(name) {
    const prefix = `${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    if (match) return match.slice(prefix.length);
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : "";
}

function loadProjectEnv(projectId) {
    const envPath = path.join(__dirname, "..", "functions", `.env.${projectId}`);
    if (!fs.existsSync(envPath)) return {};
    return Object.fromEntries(
        fs.readFileSync(envPath, "utf8")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#") && line.includes("="))
            .map((line) => {
                const index = line.indexOf("=");
                return [line.slice(0, index), line.slice(index + 1)];
            })
    );
}

function getFirebaseAccessToken() {
    if (process.env.FIREBASE_ACCESS_TOKEN) return process.env.FIREBASE_ACCESS_TOKEN;
    const json = execSync("firebase login:list --json", { encoding: "utf8", shell: "powershell.exe" });
    const parsed = JSON.parse(json);
    const token = parsed?.result?.[0]?.tokens?.access_token;
    if (!token) throw new Error("Firebase CLI access token not found.");
    return token;
}

function getServerMinterKey() {
    if (process.env.SERVER_MINTER_KEY) return process.env.SERVER_MINTER_KEY.trim();
    const value = execSync(`firebase functions:secrets:access SERVER_MINTER_KEY --project ${PROJECT_ID}`, {
        encoding: "utf8",
        shell: "powershell.exe",
        stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    if (!value) throw new Error("SERVER_MINTER_KEY is empty.");
    return value;
}

function encodeValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number") {
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    if (typeof value === "object") {
        return {
            mapValue: {
                fields: Object.fromEntries(Object.entries(value).map(([key, val]) => [key, encodeValue(val)]))
            }
        };
    }
    throw new Error(`Unsupported Firestore value: ${value}`);
}

function decodeValue(value) {
    if (!value) return undefined;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("nullValue" in value) return null;
    if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
    if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
    return undefined;
}

function decodeFields(fields = {}) {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

async function fetchJson(url, token, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 800)}`);
    return text ? JSON.parse(text) : {};
}

async function getDoc(token, docPath) {
    try {
        const doc = await fetchJson(`${FIRESTORE_BASE}/${docPath}`, token);
        return { id: docPath.split("/").pop(), updateTime: doc.updateTime, ...decodeFields(doc.fields || {}) };
    } catch (error) {
        if (String(error.message).startsWith("404")) return null;
        throw error;
    }
}

async function commitWritesWithToken(token, writes) {
    return fetchJson(`${FIRESTORE_BASE}:commit`, token, {
        method: "POST",
        body: JSON.stringify({ writes })
    });
}

function docName(docPath) {
    return `projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
}

function docId(name = "") {
    return String(name).split("/").pop();
}

async function runQuery(token, structuredQuery) {
    const rows = await fetchJson(`${FIRESTORE_BASE}:runQuery`, token, {
        method: "POST",
        body: JSON.stringify({ structuredQuery })
    });
    return rows
        .filter((row) => row.document)
        .map((row) => ({
            id: docId(row.document.name),
            updateTime: row.document.updateTime,
            ...decodeFields(row.document.fields || {})
        }));
}

async function batchGetDailyLogs(token, uid, dates) {
    if (!uid || dates.length === 0) return {};
    const rows = await fetchJson(`${FIRESTORE_BASE}:batchGet`, token, {
        method: "POST",
        body: JSON.stringify({
            documents: dates.map((date) => docName(`daily_logs/${uid}_${date}`))
        })
    });
    const out = {};
    for (const row of rows) {
        if (!row.found) continue;
        const date = docId(row.found.name).slice(-10);
        out[date] = decodeFields(row.found.fields || {});
    }
    return out;
}

function getTier(tx) {
    return tx.tier || TIER_FROM_CHALLENGE_ID[tx.challengeId] || "";
}

function addDays(dateStr, days) {
    const date = new Date(`${dateStr}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function getDateRange(tx, tier) {
    const totalDays = Number(tx.totalDays) || (tier === "master" ? 30 : tier === "weekly" ? 7 : 0);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(tx.startDate || "")) && totalDays > 0) {
        return Array.from({ length: totalDays }, (_, index) => addDays(tx.startDate, index));
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(tx.startDate || "")) && /^\d{4}-\d{2}-\d{2}$/.test(String(tx.endDate || ""))) {
        const out = [];
        for (let cursor = tx.startDate; cursor <= tx.endDate && out.length < 370; cursor = addDays(cursor, 1)) {
            out.push(cursor);
        }
        return out;
    }
    return Array.isArray(tx.completedDates) ? tx.completedDates.filter(Boolean) : [];
}

function getAwardedPointsTotal(log = {}) {
    const awarded = log.awardedPoints || {};
    const explicit =
        (Number(awarded.dietPoints) || 0) +
        (Number(awarded.exercisePoints) || 0) +
        (Number(awarded.mindPoints) || 0);
    if (explicit > 0 || "dietPoints" in awarded || "exercisePoints" in awarded || "mindPoints" in awarded) {
        return explicit;
    }
    return (awarded.diet ? 10 : 0) + (awarded.exercise ? 15 : 0) + (awarded.mind ? 5 : 0);
}

function reconcileCompletion(tx, tier, dates, logsByDate) {
    const completed = new Set((Array.isArray(tx.completedDates) ? tx.completedDates : []).filter(Boolean));
    for (const date of dates) {
        if (getAwardedPointsTotal(logsByDate[date]) >= CHALLENGE_DAILY_MIN_POINTS) {
            completed.add(date);
        }
    }
    const totalDays = Number(tx.totalDays) || (tier === "master" ? 30 : tier === "weekly" ? 7 : 1);
    const completedDates = dates.length ? dates.filter((date) => completed.has(date)) : [...completed].sort();
    return {
        totalDays,
        completedDates,
        completedDays: Math.min(totalDays, Math.max(Number(tx.completedDays) || 0, completedDates.length))
    };
}

function actualHbt(tx) {
    return Number(tx.hbtReceived ?? tx.amount ?? 0) || 0;
}

function groupKey(entry) {
    const tx = entry.tx;
    return [
        tx.userId,
        entry.tier,
        tx.challengeId || "",
        tx.startDate || "",
        tx.endDate || "",
        entry.dates.join("~") || tx.date || ""
    ].join("|");
}

async function findCandidates(token) {
    const settlements = await runQuery(token, {
        from: [{ collectionId: "blockchain_transactions" }],
        where: {
            fieldFilter: {
                field: { fieldPath: "type" },
                op: "EQUAL",
                value: { stringValue: "challenge_settlement" }
            }
        },
        limit: 5000
    });

    const entries = [];
    for (const tx of settlements) {
        const tier = getTier(tx);
        if (String(tx.id || "").startsWith("challenge_bonus_backfill_tx_") || String(tx.compensationReason || "").startsWith("challenge_bonus_backfill")) continue;
        if (tx.status !== "success" || tx.network !== CHAIN.networkTag || !BONUS_BPS[tier]) continue;
        const stakeBasis = Number(tx.bonusEligibleStake ?? tx.stakeBonusBasis ?? tx.staked ?? 0) || 0;
        if (!(stakeBasis > 0)) continue;

        const dates = getDateRange(tx, tier);
        const logsByDate = await batchGetDailyLogs(token, tx.userId, dates);
        const completion = reconcileCompletion(tx, tier, dates, logsByDate);
        const staked = Number(tx.staked ?? stakeBasis) || 0;
        const bonus = completion.completedDays >= completion.totalDays
            ? (stakeBasis * BONUS_BPS[tier]) / 10000
            : 0;
        const expected = completion.completedDays >= completion.totalDays
            ? (tx.principalAlreadyReturned ? 0 : staked) + bonus
            : staked;

        entries.push({
            tx,
            tier,
            dates,
            completion,
            stakeBasis,
            staked,
            expected,
            actual: actualHbt(tx)
        });
    }

    const groups = new Map();
    for (const entry of entries) {
        const key = groupKey(entry);
        const group = groups.get(key) || { key, entries: [], actual: 0, expected: 0 };
        group.entries.push(entry);
        group.actual += entry.actual;
        group.expected = Math.max(group.expected, entry.expected);
        groups.set(key, group);
    }

    const candidates = [];
    for (const group of groups.values()) {
        const missing = Math.max(0, group.expected - group.actual);
        if (missing <= 0.000001) continue;
        const source = group.entries.find((entry) => entry.expected > entry.actual) || group.entries[0];
        if (source.completion.completedDays < source.completion.totalDays) continue;
        const compensationKey = `${REASON}_${source.tx.userId}_${source.tx.id}`;
        const existing = await getDoc(token, `admin_compensations/${compensationKey}`);
        candidates.push({
            compensationKey,
            sourceTxId: source.tx.id,
            userId: source.tx.userId,
            tier: source.tier,
            challengeId: source.tx.challengeId,
            date: source.tx.date || null,
            startDate: source.tx.startDate || null,
            endDate: source.tx.endDate || null,
            completedDays: source.completion.completedDays,
            totalDays: source.completion.totalDays,
            completedDates: source.completion.completedDates,
            staked: source.staked,
            stakeBasis: source.stakeBasis,
            expectedHbt: group.expected,
            groupActualHbt: group.actual,
            missingHbt: missing,
            existingCompensation: existing ? {
                status: existing.status || null,
                compensationTxHash: existing.compensationTxHash || null
            } : null,
            sourceTx: source.tx
        });
    }

    return {
        scannedSettlements: settlements.length,
        eligibleSettlements: entries.length,
        candidates
    };
}

async function mintHbt(walletAddress, hbtAmount, privateKey) {
    const provider = new ethers.JsonRpcProvider(CHAIN.rpcUrl, CHAIN.chainId);
    const wallet = new ethers.Wallet(privateKey.trim(), provider);
    const contract = new ethers.Contract(CHAIN.habitAddress, contractAbi.HaBit, wallet);
    const currentRate = await contract.currentRate();
    const hbtRaw = ethers.parseUnits(String(hbtAmount), HBT_DECIMALS);
    const pointAmount = (hbtRaw + currentRate - 1n) / currentRate;
    if (pointAmount <= 0n) throw new Error(`Calculated zero pointAmount for ${hbtAmount} HBT`);
    const tx = await contract.mint(walletAddress, pointAmount);
    const receipt = await tx.wait();
    const mintedHbt = Number(ethers.formatUnits(pointAmount * currentRate, HBT_DECIMALS));
    return {
        txHash: receipt.hash,
        pointAmount: Number(pointAmount),
        currentRateRaw: currentRate.toString(),
        mintedHbt
    };
}

async function createLock(token, candidate) {
    const now = new Date();
    await commitWritesWithToken(token, [{
        update: {
            name: docName(`admin_compensations/${candidate.compensationKey}`),
            fields: Object.fromEntries(Object.entries({
                key: candidate.compensationKey,
                userId: candidate.userId,
                sourceTxId: candidate.sourceTxId,
                status: "minting",
                reason: REASON,
                targetHbt: candidate.missingHbt,
                expectedHbt: candidate.expectedHbt,
                groupActualHbt: candidate.groupActualHbt,
                createdAt: now
            }).map(([key, value]) => [key, encodeValue(value)]))
        },
        currentDocument: { exists: false }
    }]);
}

async function markCompensationFailed(token, candidate, error) {
    await commitWritesWithToken(token, [{
        update: {
            name: docName(`admin_compensations/${candidate.compensationKey}`),
            fields: Object.fromEntries(Object.entries({
                status: "failed",
                errorMessage: String(error?.message || error).slice(0, 1000),
                failedAt: new Date()
            }).map(([key, value]) => [key, encodeValue(value)]))
        },
        updateMask: { fieldPaths: ["status", "errorMessage", "failedAt"] }
    }]);
}

async function applyCandidate(token, candidate, privateKey) {
    if (candidate.existingCompensation) {
        return { ...candidate, skipped: true, reason: "already_compensated" };
    }

    const user = await getDoc(token, `users/${candidate.userId}`);
    if (!user) throw new Error(`User not found: ${candidate.userId}`);
    const walletAddress = String(candidate.sourceTx.stakeWalletAddress || user.walletAddress || "").trim();
    if (!walletAddress) throw new Error(`Wallet not found for ${candidate.userId}`);

    await createLock(token, candidate);
    let mintResult;
    try {
        mintResult = await mintHbt(walletAddress, candidate.missingHbt, privateKey);
    } catch (error) {
        await markCompensationFailed(token, candidate, error);
        throw error;
    }

    const now = new Date();
    const txDocId = `challenge_bonus_backfill_tx_${candidate.sourceTxId}`;
    const txFields = {
        userId: candidate.userId,
        type: "challenge_settlement",
        challengeId: candidate.challengeId,
        tier: candidate.tier,
        amount: mintResult.mintedHbt,
        hbtReceived: mintResult.mintedHbt,
        principalRewardHbt: 0,
        bonusRewardHbt: mintResult.mintedHbt,
        targetBonusRewardHbt: candidate.missingHbt,
        date: now.toISOString().slice(0, 10),
        staked: candidate.staked,
        bonusEligibleStake: candidate.stakeBasis,
        successRate: 1,
        completedDays: candidate.completedDays,
        completedDates: candidate.completedDates,
        startDate: candidate.startDate,
        endDate: candidate.endDate,
        onChain: true,
        network: CHAIN.networkTag,
        status: "success",
        compensation: true,
        compensationReason: REASON,
        compensationKey: candidate.compensationKey,
        sourceSettlementTxId: candidate.sourceTxId,
        compensationTxHash: mintResult.txHash,
        compensationPointAmount: mintResult.pointAmount,
        compensationRateRaw: mintResult.currentRateRaw,
        timestamp: now
    };

    await commitWritesWithToken(token, [
        {
            update: {
                name: docName(`blockchain_transactions/${txDocId}`),
                fields: Object.fromEntries(Object.entries(txFields).map(([key, value]) => [key, encodeValue(value)]))
            },
            currentDocument: { exists: false }
        },
        {
            update: {
                name: docName(`blockchain_transactions/${candidate.sourceTxId}`),
                fields: Object.fromEntries(Object.entries({
                    bonusBackfillCompensationKey: candidate.compensationKey,
                    bonusBackfillHbt: mintResult.mintedHbt,
                    bonusBackfillTargetHbt: candidate.missingHbt,
                    bonusBackfillTxHash: mintResult.txHash,
                    bonusBackfilledAt: now,
                    recomputedCompletedDays: candidate.completedDays,
                    recomputedCompletedDates: candidate.completedDates
                }).map(([key, value]) => [key, encodeValue(value)]))
            },
            updateMask: {
                fieldPaths: [
                    "bonusBackfillCompensationKey",
                    "bonusBackfillHbt",
                    "bonusBackfillTargetHbt",
                    "bonusBackfillTxHash",
                    "bonusBackfilledAt",
                    "recomputedCompletedDays",
                    "recomputedCompletedDates"
                ]
            }
        },
        {
            transform: {
                document: docName(`users/${candidate.userId}`),
                fieldTransforms: [{
                    fieldPath: "totalHbtEarned",
                    increment: encodeValue(mintResult.mintedHbt)
                }]
            },
            currentDocument: { exists: true }
        },
        {
            update: {
                name: docName(`admin_compensations/${candidate.compensationKey}`),
                fields: Object.fromEntries(Object.entries({
                    status: "completed",
                    completedAt: now,
                    compensationHbt: mintResult.mintedHbt,
                    targetHbt: candidate.missingHbt,
                    compensationTxHash: mintResult.txHash,
                    compensationPointAmount: mintResult.pointAmount,
                    compensationRateRaw: mintResult.currentRateRaw,
                    transactionDocId: txDocId,
                    walletAddress
                }).map(([key, value]) => [key, encodeValue(value)]))
            },
            updateMask: {
                fieldPaths: [
                    "status",
                    "completedAt",
                    "compensationHbt",
                    "targetHbt",
                    "compensationTxHash",
                    "compensationPointAmount",
                    "compensationRateRaw",
                    "transactionDocId",
                    "walletAddress"
                ]
            }
        }
    ]);

    return {
        ...candidate,
        applied: true,
        mintedHbt: mintResult.mintedHbt,
        compensationTxHash: mintResult.txHash,
        transactionDocId: txDocId
    };
}

async function main() {
    const token = getFirebaseAccessToken();
    const audit = await findCandidates(token);
    const pending = audit.candidates.filter((candidate) => !candidate.existingCompensation);

    if (!APPLY) {
        console.log(JSON.stringify({
            apply: false,
            projectId: PROJECT_ID,
            chainKey: CHAIN_KEY,
            network: CHAIN.networkTag,
            scannedSettlements: audit.scannedSettlements,
            eligibleSettlements: audit.eligibleSettlements,
            candidateCount: audit.candidates.length,
            pendingCount: pending.length,
            missingHbtTotal: pending.reduce((sum, candidate) => sum + candidate.missingHbt, 0),
            candidates: audit.candidates.map((candidate) => ({
                compensationKey: candidate.compensationKey,
                sourceTxId: candidate.sourceTxId,
                userId: candidate.userId,
                date: candidate.date,
                tier: candidate.tier,
                expectedHbt: candidate.expectedHbt,
                groupActualHbt: candidate.groupActualHbt,
                missingHbt: candidate.missingHbt,
                existingCompensation: candidate.existingCompensation
            }))
        }, null, 2));
        return;
    }

    const privateKey = getServerMinterKey();
    const results = [];
    for (const candidate of audit.candidates) {
        results.push(await applyCandidate(token, candidate, privateKey));
    }
    console.log(JSON.stringify({
        apply: true,
        projectId: PROJECT_ID,
        chainKey: CHAIN_KEY,
        network: CHAIN.networkTag,
        appliedCount: results.filter((result) => result.applied).length,
        skippedCount: results.filter((result) => result.skipped).length,
        mintedHbtTotal: results.reduce((sum, result) => sum + (Number(result.mintedHbt) || 0), 0),
        results: results.map((result) => ({
            compensationKey: result.compensationKey,
            sourceTxId: result.sourceTxId,
            userId: result.userId,
            applied: !!result.applied,
            skipped: !!result.skipped,
            reason: result.reason || null,
            targetHbt: result.missingHbt,
            mintedHbt: result.mintedHbt || 0,
            compensationTxHash: result.compensationTxHash || null,
            transactionDocId: result.transactionDocId || null
        }))
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
