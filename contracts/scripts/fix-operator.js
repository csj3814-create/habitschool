/**
 * Staking 운영자 권한 설정 (nonce 충돌 복구용)
 */
const hre = require("hardhat");

async function main() {
    const stakingAddress = "0x7e8c29699F382B553891f853299e615257491F9D";
    const serverMinter = process.env.SERVER_MINTER_ADDRESS;
    
    console.log("Staking 운영자 설정 중:", serverMinter);
    
    const HaBitStaking = await hre.ethers.getContractFactory("HaBitStaking");
    const staking = HaBitStaking.attach(stakingAddress);
    
    const tx = await staking.setOperator(serverMinter, true);
    await tx.wait();
    console.log("✅ Staking 운영자 설정 완료");
    
    // deployments 파일 업데이트
    const fs = require("fs");
    const [deployer] = await hre.ethers.getSigners();
    const deployInfo = {
        network: hre.network.name,
        chainId: hre.network.config.chainId,
        deployer: deployer.address,
        contracts: {
            HaBit: "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B",
            HaBitStaking: stakingAddress
        },
        timestamp: new Date().toISOString()
    };
    fs.writeFileSync(`deployments-${hre.network.name}.json`, JSON.stringify(deployInfo, null, 2));
    console.log(`💾 배포 정보 저장: deployments-${hre.network.name}.json`);
}

main().then(() => process.exit(0)).catch(e => { console.error("❌", e.message); process.exit(1); });
