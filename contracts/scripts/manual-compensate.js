/**
 * 챌린지 보상 보상 지급 스크립트
 *
 * 사유: 2026-03-28~29 주간 챌린지 7/7 완료한 사용자의 HBT가
 *       캐시 버그로 인해 실패 정산 처리됨 (50 HBT 소각)
 *
 * 지급 대상: 0xa3f5961306b19bc45cd80407d0a932fca8ef81d2
 * 지급 금액: 100 HBT
 *   - 50 HBT: 실패 정산으로 소각된 원금 복구
 *   - 50 HBT: 7/7 완료 시 받았어야 할 50% 보너스
 *
 * 사용법:
 *   cd contracts
 *   npx hardhat run scripts/manual-compensate.js --network bscTestnet
 */

require("dotenv").config();
const hre = require("hardhat");

const RECIPIENT = "0xa3f5961306b19bc45cd80407d0a932fca8ef81d2";
const COMPENSATE_HBT = 100; // HBT 단위 (소수)
const DECIMALS = 8;
const HABIT_ADDRESS = "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B";

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("배포자 주소:", deployer.address);
    console.log("지급 대상:", RECIPIENT);
    console.log("지급 금액:", COMPENSATE_HBT, "HBT");

    const HaBit = await hre.ethers.getContractFactory("HaBit");
    const habit = HaBit.attach(HABIT_ADDRESS);

    // 현재 rate 조회
    const currentRate = await habit.currentRate();
    const RATE_SCALE = BigInt(10 ** DECIMALS);
    console.log(`현재 rate: ${currentRate} (raw), ${Number(currentRate) / Number(RATE_SCALE)} HBT/P`);

    // 100 HBT를 위한 pointAmount 계산
    // hbtAmount = pointAmount * currentRate
    // → pointAmount = (100 * 10^8) / currentRate
    const hbtRaw = BigInt(COMPENSATE_HBT) * RATE_SCALE;
    const pointAmount = hbtRaw / currentRate;

    if (pointAmount === 0n) {
        console.error("❌ pointAmount가 0입니다. rate가 너무 높습니다.");
        process.exit(1);
    }

    const actualHbt = pointAmount * currentRate;
    console.log(`\npointAmount: ${pointAmount}`);
    console.log(`실제 민팅 HBT: ${Number(actualHbt) / Number(RATE_SCALE)} HBT (rate 반올림으로 인해 목표와 소수 차이 가능)`);

    // MINTER_ROLE 확인
    const MINTER_ROLE = await habit.MINTER_ROLE();
    const hasRole = await habit.hasRole(MINTER_ROLE, deployer.address);
    if (!hasRole) {
        console.error("❌ MINTER_ROLE 없음. 배포자 계정에 MINTER_ROLE이 필요합니다.");
        process.exit(1);
    }
    console.log("\n✅ MINTER_ROLE 확인됨");

    // mint 실행
    console.log("\n⛓️ mint 호출 중...");
    const tx = await habit.mint(RECIPIENT, pointAmount);
    const receipt = await tx.wait();
    console.log(`✅ 완료! TX: https://testnet.bscscan.com/tx/${receipt.hash}`);
    console.log(`\n📊 ${RECIPIENT}에 약 ${COMPENSATE_HBT} HBT 지급 완료`);
}

main().catch((e) => { console.error("❌ 오류:", e.message); process.exit(1); });
