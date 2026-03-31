/**
 * 3월 30일 자동 비율 조정 실패 복구
 * 현재 2 HBT/P → 4 HBT/P (2배 상승, MAX_RATE 적용)
 */
require("dotenv").config();
const hre = require("hardhat");

const HABIT_ADDRESS = "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B";
const RATE_SCALE = 100_000_000; // 10^8
const TARGET_RATE = 4.0; // 4 HBT/P

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("배포자 주소:", deployer.address);

    const HaBit = await hre.ethers.getContractFactory("HaBit");
    const habit = HaBit.attach(HABIT_ADDRESS);

    const currentRateRaw = await habit.currentRate();
    const currentRate = Number(currentRateRaw) / RATE_SCALE;
    console.log(`현재 비율: ${currentRate} HBT/P`);

    const newRateScaled = BigInt(Math.round(TARGET_RATE * RATE_SCALE));
    console.log(`목표 비율: ${TARGET_RATE} HBT/P (raw: ${newRateScaled})`);

    if (Number(currentRateRaw) === Number(newRateScaled)) {
        console.log("⏭️ 이미 목표 비율과 동일, 종료.");
        return;
    }

    const RATE_UPDATER_ROLE = await habit.RATE_UPDATER_ROLE();
    const hasRole = await habit.hasRole(RATE_UPDATER_ROLE, deployer.address);
    if (!hasRole) {
        console.log("🔑 RATE_UPDATER_ROLE 부여 중...");
        const tx = await habit.grantRole(RATE_UPDATER_ROLE, deployer.address);
        await tx.wait();
    }

    // RateChangeExceedsLimit 대비: 이분탐색
    let attemptRate = Number(newRateScaled);
    const current = Number(currentRateRaw);
    for (let i = 0; i < 4; i++) {
        try {
            const tx = await habit.updateRate(BigInt(attemptRate));
            const receipt = await tx.wait();
            console.log(`✅ 완료! ${currentRate} → ${TARGET_RATE} HBT/P`);
            console.log(`TX: https://testnet.bscscan.com/tx/${receipt.hash}`);
            return;
        } catch (e) {
            if (e.message.includes("RateChangeExceedsLimit") && i < 3) {
                attemptRate = Math.round((current + attemptRate) / 2);
                console.log(`🔄 한도 초과 → 이분탐색: ${attemptRate / RATE_SCALE} HBT/P 재시도`);
            } else {
                throw e;
            }
        }
    }
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
