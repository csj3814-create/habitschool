/**
 * migrate-from-base.js
 * Base Sepolia → BSC 테스트넷 HBT 잔액 이전 스크립트
 *
 * 사용법:
 *   npx hardhat run scripts/migrate-from-base.js --network bscTestnet
 *
 * 전제 조건:
 *   - .env에 DEPLOYER_PRIVATE_KEY 설정 (BSC HaBit 컨트랙트의 MINTER_ROLE 보유)
 *   - 배포자 지갑에 tBNB 가스비 소액 보유
 */

const { ethers } = require("hardhat");

// ============================================================
// ⚠️ 아래 주소를 BaseScan에서 확인한 전체 주소(42자)로 교체하세요
// https://sepolia.basescan.org/token/0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B#balances
// ============================================================
const MIGRATION_TARGETS = [
    {
        address: "0xa3f5961306b19BC45cd80407D0A932FcA8Ef81d2",  // Rank 2: 500 HBT
        hbt: 500,
        note: "Rank2 홀더"
    },
    {
        address: "0xC08cf6f495C7dBF029d6313b8b9196ca0d3fE2E9",  // Rank 3: 300 HBT
        hbt: 300,
        note: "Rank3 홀더"
    },
    {
        address: "0x69dC38c8eD536D565EE9e47B24323f2E3b62801a",  // Rank 4: 100 HBT
        hbt: 100,
        note: "Rank4 홀더"
    },
    // Rank 5 (컨트랙트 자체 보유 100 HBT)는 스킵 — 복구 불가
];

// BSC 테스트넷 HaBit 컨트랙트 주소
const HABIT_BSC_ADDRESS = "0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29";

// HaBit mint 함수 ABI (최소)
const HABIT_ABI = [
    "function mint(address to, uint256 pointAmount) external",
    "function currentRate() external view returns (uint256)",
    "function RATE_SCALE() external view returns (uint256)",
    "function balanceOf(address) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function hasRole(bytes32 role, address account) external view returns (bool)",
    "function MINTER_ROLE() external view returns (bytes32)",
];

async function main() {
    console.log("🚀 Base Sepolia → BSC 테스트넷 HBT 마이그레이션 시작\n");

    // 미입력 주소 체크
    const unset = MIGRATION_TARGETS.filter(t => t.address.startsWith("REPLACE_"));
    if (unset.length > 0) {
        console.error("❌ 전체 주소를 입력하지 않은 항목이 있습니다:");
        unset.forEach(t => console.error(`   ${t.note}: ${t.address}`));
        console.error("\n📌 BaseScan에서 전체 주소를 확인 후 스크립트를 수정해주세요.");
        process.exit(1);
    }

    // 서명자 (DEPLOYER_PRIVATE_KEY)
    const [deployer] = await ethers.getSigners();
    console.log(`📋 배포자(민터) 지갑: ${deployer.address}`);

    const bnbBalance = await ethers.provider.getBalance(deployer.address);
    console.log(`💰 tBNB 잔액: ${ethers.formatEther(bnbBalance)} tBNB\n`);

    // HaBit 컨트랙트 연결
    const habit = new ethers.Contract(HABIT_BSC_ADDRESS, HABIT_ABI, deployer);

    // MINTER_ROLE 확인
    const MINTER_ROLE = await habit.MINTER_ROLE();
    const hasMinterRole = await habit.hasRole(MINTER_ROLE, deployer.address);
    if (!hasMinterRole) {
        console.error("❌ 배포자 지갑에 MINTER_ROLE이 없습니다.");
        process.exit(1);
    }
    console.log("✅ MINTER_ROLE 확인됨\n");

    // 현재 비율 확인
    const currentRate = await habit.currentRate();
    const RATE_SCALE = await habit.RATE_SCALE();
    const rateHuman = Number(currentRate) / Number(RATE_SCALE);
    console.log(`📊 현재 변환 비율: 1P = ${rateHuman} HBT (currentRate=${currentRate})\n`);

    // 마이그레이션 실행
    console.log("═".repeat(60));
    let totalMinted = 0;

    for (const target of MIGRATION_TARGETS) {
        // BSC에서 이미 보유 중인 잔액 확인
        const existingBalance = await habit.balanceOf(target.address);
        const decimals = await habit.decimals();
        const existingHbt = Number(existingBalance) / (10 ** Number(decimals));

        console.log(`\n🎯 ${target.note}: ${target.address}`);
        console.log(`   Base Sepolia 잔액: ${target.hbt} HBT`);
        console.log(`   BSC 현재 잔액:    ${existingHbt} HBT`);

        const needed = target.hbt - existingHbt;
        if (needed <= 0) {
            console.log(`   ✅ 이미 충분한 잔액 보유 — 스킵`);
            continue;
        }

        // pointAmount 계산: hbtAmount = pointAmount * currentRate
        // → pointAmount = needed * RATE_SCALE / currentRate
        const pointAmount = Math.round(needed * Number(RATE_SCALE) / Number(currentRate));
        console.log(`   📤 민팅 예정: ${needed} HBT (pointAmount=${pointAmount})`);

        try {
            const tx = await habit.mint(target.address, pointAmount, {
                gasLimit: 200000
            });
            console.log(`   ⏳ TX 전송됨: ${tx.hash}`);
            await tx.wait();
            console.log(`   ✅ 민팅 완료!`);
            totalMinted += needed;
        } catch (err) {
            console.error(`   ❌ 민팅 실패: ${err.message}`);
        }
    }

    console.log("\n" + "═".repeat(60));
    console.log(`\n🎉 마이그레이션 완료! 총 ${totalMinted} HBT 민팅됨`);
    console.log(`🔍 BSC 탐색기: https://testnet.bscscan.com/token/${HABIT_BSC_ADDRESS}`);
}

main().catch((err) => {
    console.error("❌ 오류:", err);
    process.exit(1);
});
