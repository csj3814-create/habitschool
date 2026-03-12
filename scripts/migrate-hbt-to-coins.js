/**
 * 오프체인 hbtBalance → coins(P) 마이그레이션 스크립트
 * 
 * Firebase CLI의 refresh token + Firestore REST API를 사용
 * 각 유저의 hbtBalance에서 온체인 잔액을 뺀 초과분(오프체인)을 coins(포인트)로 전환
 * 
 * 사용법: cd functions && node ../scripts/migrate-hbt-to-coins.js
 */

const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');
const contractAbi = require(path.join(__dirname, '..', 'functions', 'contract-abi.json'));

const HABIT_ADDRESS = '0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B';
const RPC_URL = 'https://sepolia.base.org';
const CHAIN_ID = 84532;
const PROJECT_ID = 'habitschool-8497b';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function getAccessToken() {
    const configPath = path.join(
        process.env.USERPROFILE || process.env.HOME || '',
        '.config', 'configstore', 'firebase-tools.json'
    );
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const refreshToken = config.tokens?.refresh_token;
    if (!refreshToken) throw new Error('Firebase CLI 토큰을 찾을 수 없습니다. firebase login 실행하세요.');

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
            client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi'
        })
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('액세스 토큰 획득 실패: ' + JSON.stringify(data));
    return data.access_token;
}

async function main() {
    console.log('=== hbtBalance → coins 마이그레이션 시작 ===\n');

    const accessToken = await getAccessToken();
    console.log('✅ Firebase 인증 완료\n');

    // 1. hbtBalance > 0 인 유저 조회
    const queryRes = await fetch(`${BASE_URL}:runQuery`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: 'users' }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: 'hbtBalance' },
                        op: 'GREATER_THAN',
                        value: { doubleValue: 0 }
                    }
                }
            }
        })
    });

    const queryData = await queryRes.json();
    const docs = queryData.filter(d => d.document);
    console.log(`hbtBalance > 0 인 유저: ${docs.length}명\n`);

    if (docs.length === 0) {
        console.log('마이그레이션할 유저가 없습니다.');
        return;
    }

    // 2. 온체인 컨트랙트 연결
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const habitContract = new ethers.Contract(HABIT_ADDRESS, contractAbi.HaBit, provider);

    // 3. 유저별 마이그레이션
    for (const item of docs) {
        const docPath = item.document.name;
        const uid = docPath.split('/').pop();
        const fields = item.document.fields;

        const hbtBalance = parseFloat(fields.hbtBalance?.doubleValue ?? fields.hbtBalance?.integerValue ?? 0);
        const currentCoins = parseInt(fields.coins?.integerValue ?? fields.coins?.doubleValue ?? 0);
        const walletAddress = fields.walletAddress?.stringValue || null;
        const displayName = fields.displayName?.stringValue || '(이름없음)';

        console.log(`--- ${displayName} (${uid.substring(0, 8)}...) ---`);
        console.log(`  hbtBalance: ${hbtBalance}, coins: ${currentCoins}`);

        let onChainHbt = 0;
        let stakedHbt = 0;

        if (walletAddress) {
            try {
                const rawBalance = await habitContract.balanceOf(walletAddress);
                const rawStaked = await habitContract.challengeStakes(walletAddress);
                onChainHbt = parseFloat(ethers.formatUnits(rawBalance, 8));
                stakedHbt = parseFloat(ethers.formatUnits(rawStaked, 8));
                console.log(`  온체인: ${onChainHbt} HBT, 스테이킹: ${stakedHbt} HBT`);
            } catch (e) {
                console.warn(`  ⚠️ 온체인 조회 실패: ${e.message}`);
            }
        } else {
            console.log('  ⚠️ 지갑 없음');
        }

        const realHbt = onChainHbt + stakedHbt;
        const offChainExcess = Math.max(0, hbtBalance - realHbt);
        const pointsToAdd = Math.round(offChainExcess);
        const newCoins = currentCoins + pointsToAdd;

        console.log(`  초과분: ${offChainExcess} → +${pointsToAdd}P`);

        // Firestore 업데이트
        const updateFields = { hbtBalance: { doubleValue: 0 } };
        if (pointsToAdd > 0) {
            updateFields.coins = { integerValue: String(newCoins) };
        }

        const patchRes = await fetch(
            `${BASE_URL}/users/${uid}?updateMask.fieldPaths=hbtBalance&updateMask.fieldPaths=coins`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fields: updateFields })
            }
        );

        if (!patchRes.ok) {
            console.error(`  ❌ 실패: ${patchRes.status} ${await patchRes.text()}`);
            continue;
        }

        // 마이그레이션 기록 저장
        await fetch(`${BASE_URL}/blockchain_transactions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    userId: { stringValue: uid },
                    type: { stringValue: 'hbt_migration' },
                    offChainHbt: { doubleValue: hbtBalance },
                    onChainHbt: { doubleValue: onChainHbt },
                    stakedHbt: { doubleValue: stakedHbt },
                    convertedToCoins: { integerValue: String(pointsToAdd) },
                    status: { stringValue: 'success' },
                    timestamp: { timestampValue: new Date().toISOString() }
                }
            })
        });

        console.log(`  ✅ hbtBalance→0, coins: ${currentCoins}→${newCoins}\n`);
    }

    console.log('=== 마이그레이션 완료 ===');
}

main().then(() => process.exit(0)).catch(err => {
    console.error('❌ 마이그레이션 오류:', err.message);
    process.exit(1);
});
