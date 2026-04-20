#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { ethers } = require("../functions/node_modules/ethers");
const contractAbi = require("../functions/contract-abi.json");

const PROJECT_ID = "habitschool-8497b";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FIREBASE_TOKEN = process.env.FIREBASE_ACCESS_TOKEN || "";
const SERVER_MINTER_KEY = String(process.env.SERVER_MINTER_KEY || "").trim();
const APPLY = process.argv.includes("--apply");
const COMPENSATION_REASON = "challenge_false_failure_fix_2026_04_20";
const HBT_DECIMALS = 8n;
const MAINNET_RPC_URL = "https://bsc-dataseed.binance.org/";
const MAINNET_CHAIN_ID = 56;
const HABIT_ADDRESS = "0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29";

if (!FIREBASE_TOKEN) {
    console.error("Missing FIREBASE_ACCESS_TOKEN");
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(MAINNET_RPC_URL, MAINNET_CHAIN_ID);
const habitContract = new ethers.Contract(HABIT_ADDRESS, contractAbi.HaBit, provider);

const COMPENSATIONS = [
    {
        key: "challenge_false_failure_2026_04_20_kwrw_weekly",
        uid: "KwrwGEa2qoOljcAQkrpuk9MRS6G3",
        displayName: "최석재",
        challengeId: "challenge-7d",
        tier: "weekly",
        rewardPoints: 100,
        compensationHbt: 5000,
        successRate: 1,
        completedDays: 7,
        staked: 5000,
        walletAddress: "0xa3f5961306b19BC45cd80407D0A932FcA8Ef81d2",
        originalFailureTxIds: ["LaMEoM14q6vQ13ee7YAo", "Snwl0klAEAsmrpcdrMv4", "6UQW1VvskAlIn64PWTJ7"]
    },
    {
        key: "challenge_false_failure_2026_04_20_usb72_mini",
        uid: "USB72AB7z5Pan26I1aQF8emKoHh1",
        displayName: "정현수",
        challengeId: "challenge-3d",
        tier: "mini",
        rewardPoints: 30,
        compensationHbt: 0,
        successRate: 1,
        completedDays: 3,
        staked: 0,
        walletAddress: "",
        originalFailureTxIds: ["LY11PsBSCLnkeinfQoao"]
    }
];

function encodeValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number") {
        if (Number.isInteger(value)) return { integerValue: String(value) };
        return { doubleValue: value };
    }
    if (typeof value === "bigint") return { integerValue: value.toString() };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(encodeValue) } };
    }
    if (typeof value === "object") {
        return {
            mapValue: {
                fields: Object.fromEntries(
                    Object.entries(value).map(([k, v]) => [k, encodeValue(v)])
                )
            }
        };
    }
    throw new Error(`Unsupported Firestore value: ${value}`);
}

function decodeFields(fields = {}) {
    const out = {};
    for (const [key, value] of Object.entries(fields)) {
        if ("stringValue" in value) out[key] = value.stringValue;
        else if ("integerValue" in value) out[key] = Number(value.integerValue);
        else if ("doubleValue" in value) out[key] = Number(value.doubleValue);
        else if ("booleanValue" in value) out[key] = value.booleanValue;
        else if ("timestampValue" in value) out[key] = value.timestampValue;
        else if ("nullValue" in value) out[key] = null;
        else if ("arrayValue" in value) out[key] = (value.arrayValue.values || []).map((item) => decodeFields({ x: item }).x);
        else if ("mapValue" in value) out[key] = decodeFields(value.mapValue.fields || {});
    }
    return out;
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${FIREBASE_TOKEN}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText} ${text.slice(0, 600)}`);
    }
    return text ? JSON.parse(text) : {};
}

async function getDoc(docPath) {
    try {
        return await fetchJson(`${FIRESTORE_BASE}/${docPath}`);
    } catch (error) {
        if (String(error.message).startsWith("404")) return null;
        throw error;
    }
}

async function commitWrites(writes) {
    return fetchJson(`${FIRESTORE_BASE}:commit`, {
        method: "POST",
        body: JSON.stringify({ writes })
    });
}

function kstDateString(date = new Date()) {
    return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function makeDocName(docPath) {
    return `projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
}

function txDocId(target) {
    return `challenge_comp_tx_${target.key}`;
}

async function mintExactHbt(target) {
    if (!target.compensationHbt) return { txHash: null, pointAmount: 0, rateRaw: null };
    if (!SERVER_MINTER_KEY) {
        throw new Error("Missing SERVER_MINTER_KEY");
    }
    const signer = new ethers.Wallet(SERVER_MINTER_KEY, provider);
    const contract = new ethers.Contract(HABIT_ADDRESS, contractAbi.HaBit, signer);
    const rateRaw = await contract.currentRate();
    const hbtRaw = BigInt(target.compensationHbt) * (10n ** HBT_DECIMALS);
    const pointAmount = hbtRaw / rateRaw;
    const remainder = hbtRaw % rateRaw;
    if (remainder !== 0n) {
        throw new Error(`Cannot mint exact ${target.compensationHbt} HBT at rate ${rateRaw.toString()} (remainder ${remainder.toString()})`);
    }
    const tx = await contract.mint(target.walletAddress, pointAmount);
    const receipt = await tx.wait();
    return {
        txHash: receipt.hash,
        pointAmount: Number(pointAmount),
        rateRaw: rateRaw.toString()
    };
}

async function compensateTarget(target) {
    const compensationDocPath = `admin_compensations/${target.key}`;
    const existingComp = await getDoc(compensationDocPath);
    if (existingComp) {
        return {
            key: target.key,
            skipped: true,
            reason: "already_compensated",
            existing: decodeFields(existingComp.fields || {})
        };
    }

    const userDocPath = `users/${target.uid}`;
    const userDoc = await getDoc(userDocPath);
    if (!userDoc) throw new Error(`User not found: ${target.uid}`);
    const userFields = decodeFields(userDoc.fields || {});
    const currentCoins = Number(userFields.coins || 0);
    const nextCoins = currentCoins + target.rewardPoints;
    const now = new Date();
    const txId = txDocId(target);

    const dryRunPayload = {
        key: target.key,
        user: {
            uid: target.uid,
            displayName: userFields.displayName,
            email: userFields.email,
            coinsBefore: currentCoins,
            coinsAfter: nextCoins,
            walletAddress: userFields.walletAddress || ""
        },
        challengeId: target.challengeId,
        rewardPoints: target.rewardPoints,
        compensationHbt: target.compensationHbt,
        txDocId: txId
    };

    if (!APPLY) {
        return { dryRun: true, ...dryRunPayload };
    }

    let mintResult = { txHash: null, pointAmount: 0, rateRaw: null };
    if (target.compensationHbt > 0) {
        mintResult = await mintExactHbt(target);
    }

    const txDocPath = `blockchain_transactions/${txId}`;
    const transactionFields = {
        userId: target.uid,
        type: "challenge_settlement",
        challengeId: target.challengeId,
        amount: target.compensationHbt,
        rewardPoints: target.rewardPoints,
        date: kstDateString(now),
        staked: target.staked,
        successRate: target.successRate,
        completedDays: target.completedDays,
        tier: target.tier,
        status: "success",
        onChain: target.compensationHbt > 0,
        network: "bsc",
        compensation: true,
        compensationKey: target.key,
        compensationReason: COMPENSATION_REASON,
        originalFailureTxIds: target.originalFailureTxIds,
        compensationTxHash: mintResult.txHash,
        compensationPointAmount: mintResult.pointAmount,
        compensationRateRaw: mintResult.rateRaw,
        timestamp: now
    };

    const adminCompFields = {
        key: target.key,
        userId: target.uid,
        displayName: userFields.displayName,
        email: userFields.email,
        challengeId: target.challengeId,
        tier: target.tier,
        rewardPoints: target.rewardPoints,
        compensationHbt: target.compensationHbt,
        originalFailureTxIds: target.originalFailureTxIds,
        compensationTxHash: mintResult.txHash,
        compensationPointAmount: mintResult.pointAmount,
        compensationRateRaw: mintResult.rateRaw,
        status: "completed",
        createdAt: now,
        reason: COMPENSATION_REASON
    };

    await commitWrites([
        {
            update: {
                name: makeDocName(userDocPath),
                fields: { coins: encodeValue(nextCoins) }
            },
            updateMask: { fieldPaths: ["coins"] },
            currentDocument: { updateTime: userDoc.updateTime }
        },
        {
            update: {
                name: makeDocName(txDocPath),
                fields: Object.fromEntries(Object.entries(transactionFields).map(([k, v]) => [k, encodeValue(v)]))
            },
            currentDocument: { exists: false }
        },
        {
            update: {
                name: makeDocName(compensationDocPath),
                fields: Object.fromEntries(Object.entries(adminCompFields).map(([k, v]) => [k, encodeValue(v)]))
            },
            currentDocument: { exists: false }
        }
    ]);

    const verifyUserDoc = await getDoc(userDocPath);
    const verifyFields = decodeFields(verifyUserDoc?.fields || {});

    return {
        applied: true,
        key: target.key,
        coinsBefore: currentCoins,
        coinsAfter: verifyFields.coins,
        compensationTxHash: mintResult.txHash,
        rewardPoints: target.rewardPoints,
        compensationHbt: target.compensationHbt
    };
}

async function main() {
    const results = [];
    for (const target of COMPENSATIONS) {
        results.push(await compensateTarget(target));
    }
    console.log(JSON.stringify({ apply: APPLY, results }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
