/**
 * HaBit (HBT) Cloud Functions v18
 *
 * 블록체인 민팅, 잔액 조회, 토큰 통계, AI 식단/운동 분석을 처리하는 서버리스 함수
 *
 * 엔드포인트:
 *   - mintHBT: 포인트를 HBT 온체인 민팅
 *   - getOnchainBalance: 사용자의 온체인 HBT 잔액 조회
 *   - getTokenStats: 전체 토큰 통계 조회
 *   - analyzeDiet: AI 식단/운동 사진 분석
 *   - analyzeSleepMind: AI 수면/마음 분석
 *   - awardPoints: daily_logs 변경 시 포인트 자동 정산 (Firestore 트리거)
 *   - awardMilestoneBonus: 마일스톤 보너스 지급 (Firestore 트리거)
 *
 * 보안:
 *   - Firebase Auth 인증 필수 (onCall)
 *   - Server Minter 키는 Secret Manager에서 가져옴
 *   - 포인트 잔액은 Firestore에서 서버가 검증
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { ethers } = require("ethers");
const contractAbi = require("./contract-abi.json");

// Firebase
admin.initializeApp();
const db = admin.firestore();

// 비밀 키 (Firebase Secret Manager)
const SERVER_MINTER_KEY = defineSecret("SERVER_MINTER_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// 컨트랙트 주소 (BSC Chapel 테스트넷) — v4 (RATE_UPDATER_ROLE 추가)
const HABIT_ADDRESS = "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B";
const STAKING_ADDRESS = "0x7e8c29699F382B553891f853299e615257491F9D";
const RPC_URL = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const CHAIN_ID = 97;
const EXPLORER_URL = "https://testnet.bscscan.com";

// 일일 변환 한도
const MAX_DAILY_HBT = 5000;
const MIN_POINTS = 100;

/**
 * ethers Provider & Wallet 인스턴스 생성
 */
function getProviderAndWallet(privateKey) {
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const wallet = new ethers.Wallet(privateKey.trim(), provider);
    return { provider, wallet };
}

/**
 * HaBit 컨트랙트 인스턴스 생성
 */
function getHabitContract(signerOrProvider) {
    return new ethers.Contract(HABIT_ADDRESS, contractAbi.HaBit, signerOrProvider);
}

// ========================================
// 1. 포인트에서 HBT 온체인 민팅
// ========================================
exports.mintHBT = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",  // 서울 리전
        maxInstances: 10,
        invoker: "public"  // Cloud Run 공개 접근 허용 (Firebase Auth는 onCall 내부에서 검증)
    },
    async (request) => {
        // 인증 확인
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        const { pointAmount } = request.data;

        if (!pointAmount || typeof pointAmount !== "number" || pointAmount < MIN_POINTS) {
            throw new HttpsError("invalid-argument", `최소 ${MIN_POINTS}P 이상 필요합니다.`);
        }
        if (pointAmount % 100 !== 0) {
            throw new HttpsError("invalid-argument", "100P 단위로만 변환 가능합니다.");
        }

        try {
            // 0. 중복 요청 방지: 처리 중 락
            const lockRef = db.collection("mint_locks").doc(uid);
            const lockSnap = await lockRef.get();
            if (lockSnap.exists) {
                const lockData = lockSnap.data();
                const lockAge = Date.now() - (lockData.timestamp?.toMillis() || 0);
                // 60초 이내 락이면 중복 요청 차단
                if (lockAge < 60000) {
                    throw new HttpsError("already-exists", "이전 변환이 처리 중입니다. 잠시 후 다시 시도해주세요.");
                }
            }
            await lockRef.set({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                pointAmount: pointAmount
            });

            // 1. Firestore에서 사용자 데이터 확인
            const userRef = db.collection("users").doc(uid);
            const userSnap = await userRef.get();

            if (!userSnap.exists) {
                await lockRef.delete();
                throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
            }

            const userData = userSnap.data();
            const currentCoins = userData.coins || 0;
            const walletAddress = userData.walletAddress;

            if (!walletAddress) {
                throw new HttpsError("failed-precondition", "지갑이 생성되지 않았습니다. 앱을 다시 로드해주세요.");
            }

            if (currentCoins < pointAmount) {
                throw new HttpsError("failed-precondition", `포인트가 부족합니다. 필요: ${pointAmount}P, 보유: ${currentCoins}P`);
            }

            // 일일 변환 한도 확인 (KST 기준 — 프론트엔드와 일치)
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            const dailyQuery = await db.collection("blockchain_transactions")
                .where("userId", "==", uid)
                .where("type", "==", "conversion")
                .where("status", "==", "success")
                .where("date", "==", today)
                .get();

            let todayMinted = 0;
            dailyQuery.forEach(doc => {
                todayMinted += doc.data().hbtReceived || 0;
            });

            // 2. 온체인에서 변환 비율 확인
            const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
            const habitContract = getHabitContract(wallet);

            // v2: currentRate는 RATE_SCALE(10^8) 단위, 1P = currentRate/10^8 HBT
            const currentRateRaw = await habitContract.currentRate();
            const rateNumber = Number(currentRateRaw);
            const [currentPhase] = await habitContract.getCurrentPhase();
            const phaseNumber = Number(currentPhase);

            // HBT 계산: pointAmount * currentRate / RATE_SCALE
            const RATE_SCALE = 1e8;
            const hbtAmount = (pointAmount * rateNumber) / RATE_SCALE;

            if (todayMinted + hbtAmount > MAX_DAILY_HBT) {
                throw new HttpsError("resource-exhausted",
                    `일일 변환 한도 초과. 오늘 사용: ${todayMinted} HBT, 한도: ${MAX_DAILY_HBT} HBT`);
            }

            // 3. Firestore 포인트 차감 (트랜잭션)
            await db.runTransaction(async (transaction) => {
                const freshSnap = await transaction.get(userRef);
                const freshCoins = freshSnap.data().coins || 0;
                if (freshCoins < pointAmount) {
                    throw new HttpsError("failed-precondition", "포인트가 부족합니다 (동시 요청 감지).");
                }
                transaction.update(userRef, {
                    coins: admin.firestore.FieldValue.increment(-pointAmount)
                });
            });

            // 4. 온체인 민팅 (habitMine 호출)
            let txHash = null;
            let onchainSuccess = false;

            try {
                const tx = await habitContract.mint(walletAddress, pointAmount);
                const receipt = await tx.wait();
                txHash = receipt.hash;
                onchainSuccess = true;
            } catch (chainError) {
                // 온체인 실패 시 포인트 복원
                console.error("온체인 민팅 실패, 포인트 복원:", chainError.message);
                await userRef.update({
                    coins: admin.firestore.FieldValue.increment(pointAmount)
                });
                await lockRef.delete();
                throw new HttpsError("internal", "온체인 민팅에 실패했습니다. 잠시 후 다시 시도해주세요.");
            }

            // 5. Firestore 업데이트 (온체인 민팅 기록만, hbtBalance는 온체인이 진실의 원천)
            await userRef.update({
                totalHbtEarned: admin.firestore.FieldValue.increment(hbtAmount)
            });

            // 6. 락 해제
            await lockRef.delete();

            // 7. 거래 기록 저장
            await db.collection("blockchain_transactions").add({
                userId: uid,
                type: "conversion",
                pointsUsed: pointAmount,
                hbtReceived: hbtAmount,
                conversionRate: rateNumber,
                phase: phaseNumber,
                txHash: txHash,
                walletAddress: walletAddress,
                date: today,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: "success",
                network: "baseSepolia"
            });

            return {
                success: true,
                pointsUsed: pointAmount,
                hbtReceived: hbtAmount,
                txHash: txHash,
                explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
                conversionRate: rateNumber,
                phase: phaseNumber
            };

        } catch (error) {
            // 에러 시 락 해제
            try { await db.collection("mint_locks").doc(uid).delete(); } catch (_) {}
            if (error instanceof HttpsError) throw error;
            console.error("mintHBT 오류:", error);
            throw new HttpsError("internal", "변환 처리 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 2. 온체인 HBT 잔액 조회
// ========================================
exports.getOnchainBalance = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 20
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;

        try {
            const userSnap = await db.collection("users").doc(uid).get();
            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
            }

            const walletAddress = userSnap.data().walletAddress;
            if (!walletAddress) {
                return { balance: "0", balanceFormatted: "0" };
            }

            const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
            const habitContract = getHabitContract(provider);

            const balance = await habitContract.balanceOf(walletAddress);
            const decimals = await habitContract.decimals();
            const formatted = ethers.formatUnits(balance, decimals);

            return {
                balance: balance.toString(),
                balanceFormatted: formatted,
                walletAddress: walletAddress
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("getOnchainBalance 오류:", error);
            throw new HttpsError("internal", "잔액 조회 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 2-1. 사용자 지갑 가스(ETH) 자동 충전
// ========================================
exports.prefundWallet = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        const userData = userSnap.data();
        const walletAddress = userData.walletAddress;
        if (!walletAddress) {
            throw new HttpsError("failed-precondition", "지갑 주소가 없습니다.");
        }

        // 24시간 충전 제한
        const lastFunded = userData.lastGasFunded;
        if (lastFunded) {
            const elapsed = Date.now() - lastFunded.toMillis();
            if (elapsed < 24 * 60 * 60 * 1000) {
                return { funded: false, reason: "24시간 내 이미 충전됨" };
            }
        }

        const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
        const bnbBalance = await provider.getBalance(walletAddress);
        const THRESHOLD = ethers.parseEther("0.003");

        if (bnbBalance >= THRESHOLD) {
            return { funded: false, reason: "BNB 잔액 충분" };
        }

        const FUND_AMOUNT = ethers.parseEther("0.005");
        const tx = await wallet.sendTransaction({ to: walletAddress, value: FUND_AMOUNT });
        await tx.wait();

        await userRef.update({ lastGasFunded: admin.firestore.FieldValue.serverTimestamp() });

        console.log(`✅ 가스 충전 완료: ${walletAddress} +0.005 BNB`);
        return { funded: true, amount: "0.005", txHash: tx.hash };
    }
);

// ========================================
// 3. 토큰 전체 통계 조회
// ========================================
exports.getTokenStats = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 10
    },
    async (request) => {
        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
            const habitContract = getHabitContract(provider);

            const stats = await habitContract.getTokenStats();
            const decimals = await habitContract.decimals();

            // v2 getTokenStats 반환: totalSupply, totalMined, totalBurned, currentRate, currentPhase, weeklyTarget, remainingInPool, totalStaked, totalSlashed
            return {
                totalSupply: ethers.formatUnits(stats[0], decimals),
                totalMined: ethers.formatUnits(stats[1], decimals),
                totalBurned: ethers.formatUnits(stats[2], decimals),
                currentRate: Number(stats[3]),
                currentPhase: Number(stats[4]),
                weeklyTarget: ethers.formatUnits(stats[5], decimals),
                remainingInPool: ethers.formatUnits(stats[6], decimals),
                totalStaked: ethers.formatUnits(stats[7], decimals),
                totalSlashed: ethers.formatUnits(stats[8], decimals)
            };

        } catch (error) {
            console.error("getTokenStats 오류:", error);
            throw new HttpsError("internal", "통계 조회 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 4. AI 식단 분석 (Gemini Vision API)
// ========================================
const { GoogleGenerativeAI } = require("@google/generative-ai");

const DIET_ANALYSIS_PROMPT = `당신은 최고건강전문 영양 분석 AI입니다. 사진 속 음식을 분석해주세요.

## 핵심 철학
- 탄수화물/단백질/지방 비율보다 **식품의 질(Quality)**이 중요합니다.
- 비타민, 무기질, 식이섬유, 항산화물질이 풍부한 자연식품으로 식량을 채우는 것이 핵심입니다.
- 초가공식품(라면, 소시지, 과자, 탄산음료, 즉석식품 등)은 인슐린 저항성을 악화시킵니다.
- 같은 칼로리라도 자연식품과 초가공식품이 신체에 미치는 영향은 완전히 다릅니다.

## 분석 기준
1. **음식 인식**: 사진에 보이는 모든 음식/식재료명 나열
2. **자연식품 vs 초가공식품**: 각 음식의 분류
   - natural: 자연 그대로이거나 최소 가공(채소, 과일, 생선, 살코기, 견과류, 잡곡 등)
   - processed: 일반 가공(치즈, 김치, 된장 등 전통 발효식품)
   - ultraprocessed: 초가공(라면, 햄, 소시지, 과자, 빵, 탄산음료, 패스트푸드)
3. **미량영양소 점수** (각 0~100):
   - vitamins: 비타민류(B, C 등) 존재 비율
   - minerals: 무기질(칼슘, 마그네슘, 아연 등) 존재 비율
   - fiber: 식이섬유 함량
   - antioxidants: 항산화물질(폴리페놀, 카로티노이드 등) 함량
4. **한끼 등급** (A~F):
   - A: 초가공 0%, 미량영양소 풍부, 완벽한 자연식품
   - B: 초가공 10% 미만, 미량영양소 양호
   - C: 초가공 20% 미만, 약간의 개선 필요
   - D: 초가공 30% 이상, 미량영양소 부족
   - F: 초가공 50% 이상, 자연식품 거의 없음
5. **인슐린/혈당 관련 코멘트**: 이 식사가 인슐린/혈당에 미치는 영향 (1-2문장)
6. **개선 제안**: 구체적이고 실천 가능한 한 가지 대안 (1문장)

## 응답 형식 (반드시 아래 JSON 형식으로만 응답)
{
  "foods": [
    {"name": "음식명", "category": "natural|processed|ultraprocessed", "nutrients": "주요 영양소 한줄 설명"}
  ],
  "scores": {
    "vitamins": 80,
    "minerals": 70,
    "fiber": 90,
    "antioxidants": 60
  },
  "grade": "A|B|C|D|F",
  "naturalRatio": 80,
  "insulinComment": "인슐린/혈당 관련 코멘트",
  "suggestion": "개선 제안",
  "summary": "한줄 총평"
}`;

exports.analyzeDiet = onCall(
    {
        secrets: [GEMINI_API_KEY],
        region: "asia-northeast3",
        maxInstances: 20,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { imageUrl } = request.data;
        if (!imageUrl || typeof imageUrl !== "string") {
            throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
        }

        // SSRF 방지: Firebase Storage URL만 허용
        if (!imageUrl.startsWith("https://firebasestorage.googleapis.com/")) {
            throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
        }

        try {
            // 이미지 다운로드
            const imgResponse = await fetch(imageUrl);
            if (!imgResponse.ok) {
                throw new HttpsError("not-found", "이미지를 불러올 수 없습니다.");
            }
            const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
            const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
            const base64Image = imgBuffer.toString("base64");

            // Gemini API 호출
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent([
                DIET_ANALYSIS_PROMPT,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: contentType
                    }
                }
            ]);

            const responseText = result.response.text();

            // JSON 추출 (마크다운 코드블록 제거)
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const analysis = JSON.parse(jsonStr);

            return {
                success: true,
                analysis: analysis,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("analyzeDiet 오류:", error);

            if (error.message && error.message.includes("JSON")) {
                throw new HttpsError("internal", "AI 응답 파싱에 실패했습니다. 다시 시도해주세요.");
            }
            throw new HttpsError("internal", "식단 분석 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 5. AI 수면/마음 분석 (Gemini Vision API)
// ========================================

const SLEEP_MIND_ANALYSIS_PROMPT = `당신은 수면 건강 전문가이자 마음챙김 코치 AI입니다.

## 분석 대상
사용자가 수면 앱/시계 캡처 사진 또는 마음 관련 텍스트(감사일기, 명상 기록)를 제공합니다.

## 분석 기준
### 수면 캡처 사진일 경우:
- 총 수면 시간, 수면 효율, 깊은수면/렘수면 비율을 인식
- 수면 패턴 품질 평가 (A~F)
- 개선 가능한 수면 습관 팁

### 마음 텍스트일 경우:
- 감성 분석 (긍정/중립/부정)
- 스트레스 수준 추정
- 마음 건강 관련 피드백

## 응답 형식 (반드시 아래 JSON 형식으로만 응답)
{
  "type": "sleep" | "mind",
  "grade": "A" | "B" | "C" | "D" | "F",
  "summary": "한줄 총평",
  "details": {
    "sleepDuration": "수면 시간 (예: '7시간 30분') 또는 null",
    "sleepQuality": "수면 품질 설명 또는 null",
    "emotionTone": "감정 톤 (긍정적/중립/부정적) 또는 null",
    "stressLevel": "스트레스 수준 (낮음/보통/높음) 또는 null"
  },
  "tip": "실천 가능한 개선 팁 1가지",
  "feedback": "격려 및 분석 코멘트 (2~3문장)"
}
마크다운 코드 블록으로 출력하지 말고, 순수 JSON만 출력하세요.`;

exports.analyzeSleepMind = onCall(
    {
        secrets: [GEMINI_API_KEY],
        region: "asia-northeast3",
        maxInstances: 20,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { imageUrl, textData, analysisType } = request.data;
        if (!imageUrl && !textData) {
            throw new HttpsError("invalid-argument", "이미지 또는 텍스트 데이터가 필요합니다.");
        }

        try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            const contentParts = [SLEEP_MIND_ANALYSIS_PROMPT];

            if (imageUrl && typeof imageUrl === "string") {
                // SSRF 방지: Firebase Storage URL 또는 data: URL만 허용
                if (!imageUrl.startsWith("https://firebasestorage.googleapis.com/") && !imageUrl.startsWith("data:")) {
                    throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
                }
                try {
                    if (imageUrl.startsWith("data:")) {
                        const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                        if (!matches) {
                            throw new HttpsError("invalid-argument", "잘못된 data URL 형식입니다.");
                        }
                        // MIME 타입 화이트리스트
                        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                        if (!allowedMimes.includes(matches[1])) {
                            throw new HttpsError("invalid-argument", "허용되지 않은 이미지 형식입니다.");
                        }
                        // Base64 크기 제한 (5MB)
                        if (matches[2].length > 5 * 1024 * 1024 * 1.37) {
                            throw new HttpsError("invalid-argument", "이미지 크기가 너무 큽니다 (최대 5MB).");
                        }
                        contentParts.push({
                            inlineData: {
                                data: matches[2],
                                mimeType: matches[1]
                            }
                        });
                    } else {
                        const imgResponse = await fetch(imageUrl);
                        if (imgResponse.ok) {
                            const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
                            const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
                            contentParts.push({
                                inlineData: {
                                    data: imgBuffer.toString("base64"),
                                    mimeType: contentType
                                }
                            });
                        }
                    }
                } catch (imgError) {
                    console.warn("수면 이미지 처리 실패:", imgError.message);
                }
            }

            if (textData) {
                contentParts.push(`사용자 기록: ${textData}`);
            }

            contentParts.push(`분석 유형: ${analysisType || 'sleep'}`);

            const result = await model.generateContent(contentParts);
            const responseText = result.response.text();

            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            } else {
                const braceMatch = responseText.match(/\{[\s\S]*\}/);
                if (braceMatch) jsonStr = braceMatch[0];
            }

            let analysis;
            try {
                analysis = JSON.parse(jsonStr);
            } catch (parseErr) {
                console.error("SleepMind JSON 파싱 실패. 원본:", responseText.substring(0, 500));
                throw new HttpsError("internal", "AI 응답 파싱에 실패했습니다. 다시 시도해주세요.");
            }

            return {
                analysis: analysis,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("analyzeSleepMind 오류:", error.message || error);
            throw new HttpsError("internal", "수면/마음 분석 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
    }
);

// ========================================
// 6. AI 걸음수 스크린샷 분석 (Gemini Vision API)
// ========================================

const crypto = require('crypto');

const STEP_SCREENSHOT_PROMPT = `당신은 건강 앱 스크린샷을 분석하는 AI입니다.
사용자가 삼성헬스, Apple 건강, 또는 기타 건강/만보기 앱의 스크린샷을 제공합니다.

## 분석 대상
화면에 보이는 걸음수, 거리, 칼로리, 활동 시간 등의 데이터를 정확히 추출합니다.

## 분석 기준
1. **걸음수**: 메인 숫자(보통 가장 크게 표시됨)를 인식
2. **거리**: km 또는 miles 단위 (없으면 null)
3. **칼로리**: kcal 또는 cal (없으면 null)
4. **활동 시간**: 분 단위로 환산 (없으면 null)
5. **날짜**: 화면에 표시된 날짜 (없으면 null)
6. **앱 종류**: 삼성헬스/Apple건강/기타 판별

## 주의사항
- 걸음수에 쉼표(,)가 있으면 제거하고 순수 숫자로 반환
- 거리 단위가 miles인 경우 km로 변환 (×1.609)
- 화면이 건강/만보기 앱이 아닌 경우 "notHealthApp": true 반환
- 숫자를 정확히 읽을 수 없는 경우 null 반환

## 응답 형식 (반드시 아래 JSON 형식으로만 응답)
{
  "steps": 8432,
  "distance_km": 5.2,
  "calories": 312,
  "active_minutes": 45,
  "date": "2025-03-22",
  "source": "samsung_health" | "apple_health" | "other",
  "notHealthApp": false,
  "confidence": "high" | "medium" | "low",
  "summary": "오늘 8,432보를 걸어 약 5.2km를 이동했습니다."
}
마크다운 코드 블록으로 출력하지 말고, 순수 JSON만 출력하세요.`;

exports.analyzeStepScreenshot = onCall(
    {
        secrets: [GEMINI_API_KEY],
        region: "asia-northeast3",
        maxInstances: 20,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { imageUrl } = request.data;
        if (!imageUrl || typeof imageUrl !== "string") {
            throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
        }

        // SSRF 방지: Firebase Storage URL만 허용
        if (!imageUrl.startsWith("https://firebasestorage.googleapis.com/")) {
            throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
        }

        try {
            // 이미지 다운로드
            const imgResponse = await fetch(imageUrl);
            if (!imgResponse.ok) {
                throw new HttpsError("not-found", "이미지를 불러올 수 없습니다.");
            }
            const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
            const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
            const base64Image = imgBuffer.toString("base64");

            // 이미지 SHA-256 해시 계산 (중복 감지용)
            const imageHash = crypto.createHash('sha256').update(imgBuffer).digest('hex');

            // Gemini API 호출
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });

            const result = await model.generateContent([
                STEP_SCREENSHOT_PROMPT,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: contentType
                    }
                }
            ]);

            const responseText = result.response.text();

            // JSON 추출 (마크다운 코드블록 제거)
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const analysis = JSON.parse(jsonStr);

            return {
                success: true,
                analysis: analysis,
                imageHash: imageHash,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("analyzeStepScreenshot 오류:", error);

            if (error.message && error.message.includes("JSON")) {
                throw new HttpsError("internal", "AI 응답 파싱에 실패했습니다. 다시 시도해주세요.");
            }
            throw new HttpsError("internal", "걸음수 분석 중 오류가 발생했습니다.");
        }
    }
);

/**
 * daily_logs 문서 변경 시 포인트(coins) 자동 정산
 * 클라이언트가 직접 coins를 수정하지 않고, 서버에서 안전하게 처리
 */
exports.awardPoints = onDocumentWritten(
    { document: "daily_logs/{logId}", region: "asia-northeast3" },
    async (event) => {
        const after = event.data?.after?.data();
        const before = event.data?.before?.data();

        // 삭제된 경우 무시
        if (!after) return;

        const userId = after.userId;
        if (!userId) return;

        const newAwarded = after.awardedPoints || {};
        const oldAwarded = before?.awardedPoints || {};

        const newTotal = (newAwarded.dietPoints || 0) + (newAwarded.exercisePoints || 0) + (newAwarded.mindPoints || 0);
        const oldTotal = (oldAwarded.dietPoints || 0) + (oldAwarded.exercisePoints || 0) + (oldAwarded.mindPoints || 0);
        const diff = newTotal - oldTotal;

        if (diff <= 0) return;

        try {
            const userRef = db.doc(`users/${userId}`);
            await userRef.set({ coins: admin.firestore.FieldValue.increment(diff) }, { merge: true });
            console.log(`awardPoints: ${userId} +${diff}P (total: ${newTotal})`);

            // 스트릭 계산 및 저장
            const logDate = after.date;
            if (logDate) {
                const streak = await calculateStreak(userId, logDate);
                await event.data.after.ref.set({ currentStreak: streak }, { merge: true });
                console.log(`streak: ${userId} ${logDate} → ${streak}일`);

                // 추천인 마일스톤 보상
                await checkReferralMilestone(userId, streak);
            }
        } catch (err) {
            console.error("awardPoints 오류:", err);
        }
    }
);

// 연속 인증 스트릭 계산 (날짜 역순 탐색)
async function calculateStreak(userId, currentDate) {
    let streak = 1;
    const d = new Date(currentDate + "T00:00:00Z");
    for (let i = 1; i <= 100; i++) {
        d.setUTCDate(d.getUTCDate() - 1);
        const prevDateStr = d.toISOString().split("T")[0];
        const snap = await db.collection("daily_logs")
            .where("userId", "==", userId)
            .where("date", "==", prevDateStr)
            .limit(1)
            .get();
        if (snap.empty) break;
        const prevData = snap.docs[0].data();
        const prevTotal = (prevData.awardedPoints?.dietPoints || 0) +
                          (prevData.awardedPoints?.exercisePoints || 0) +
                          (prevData.awardedPoints?.mindPoints || 0);
        if (prevTotal <= 0) break;
        streak++;
    }
    return streak;
}

// 추천인 마일스톤 보상 (3일: 추천인 +500P, 7일: 신규 유저 +300P)
async function checkReferralMilestone(userId, streak) {
    if (streak !== 3 && streak !== 7) return;
    const userSnap = await db.doc(`users/${userId}`).get();
    const userData = userSnap.data();
    if (!userData || !userData.referredBy) return;

    if (streak === 3 && !userData.referralDay3BonusGiven) {
        await db.doc(`users/${userData.referredBy}`).set(
            { coins: admin.firestore.FieldValue.increment(500) }, { merge: true }
        );
        await db.doc(`users/${userId}`).set({ referralDay3BonusGiven: true }, { merge: true });
        console.log(`referral 3-day: ${userId} → referrer ${userData.referredBy} +500P`);
    }
    if (streak === 7 && !userData.referralDay7BonusGiven) {
        await db.doc(`users/${userId}`).set({
            coins: admin.firestore.FieldValue.increment(300),
            referralDay7BonusGiven: true
        }, { merge: true });
        console.log(`referral 7-day: ${userId} +300P`);
    }
}

/**
 * 마일스톤 보너스 지급
 * users 문서의 milestones 필드 변경 시 bonusClaimed가 true로 바뀌면 coins 지급
 */
exports.awardMilestoneBonus = onDocumentWritten(
    { document: "users/{userId}", region: "asia-northeast3" },
    async (event) => {
        const after = event.data?.after?.data();
        const before = event.data?.before?.data();

        if (!after || !after.milestones) return;

        const newMilestones = after.milestones || {};
        const oldMilestones = before?.milestones || {};

        let totalBonus = 0;
        for (const [key, val] of Object.entries(newMilestones)) {
            if (val.bonusClaimed && val.bonusAmount > 0 && !oldMilestones[key]?.bonusClaimed) {
                totalBonus += val.bonusAmount;
            }
        }

        if (totalBonus <= 0) return;

        try {
            const userRef = db.doc(`users/${event.params.userId}`);
            await userRef.set({ coins: admin.firestore.FieldValue.increment(totalBonus) }, { merge: true });
            console.log(`awardMilestoneBonus: ${event.params.userId} +${totalBonus}P`);
        } catch (err) {
            console.error("awardMilestoneBonus 오류:", err);
        }
    }
);

/**
 * 갤러리 리액션 시 포인트 지급
 * heart/fire/clap 배열에 새 UID가 추가되면 리액션 누른 사람 +1P, 게시물 주인 +1P
 * 본인 게시물 제외, 리액션 취소 시 회수 없음
 */
exports.awardReactionPoints = onDocumentWritten(
    { document: "daily_logs/{logId}", region: "asia-northeast3" },
    async (event) => {
        const after = event.data?.after?.data();
        const before = event.data?.before?.data();
        if (!after) return;
        const postOwnerId = after.userId;
        if (!postOwnerId) return;

        for (const type of ["heart", "fire", "clap"]) {
            const afterList = after.reactions?.[type] || [];
            const beforeList = before?.reactions?.[type] || [];
            const added = afterList.filter(uid => !beforeList.includes(uid));
            for (const reactorUid of added) {
                if (reactorUid === postOwnerId) continue;
                await db.doc(`users/${reactorUid}`).set(
                    { coins: admin.firestore.FieldValue.increment(1) }, { merge: true }
                );
                await db.doc(`users/${postOwnerId}`).set(
                    { coins: admin.firestore.FieldValue.increment(1) }, { merge: true }
                );
                console.log(`reactionPoints: ${reactorUid} → ${postOwnerId} +1P each (${type})`);
            }
        }
    }
);

/**
 * 친구 초대 코드 처리 (신규 가입자 +200P, referredBy 저장)
 * 클라이언트가 ?ref=CODE로 접속 후 가입 시 호출
 */
exports.processReferralSignup = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

        const { code } = request.data;
        if (!code || typeof code !== "string" || code.length !== 6) {
            throw new HttpsError("invalid-argument", "유효하지 않은 초대 코드");
        }
        const upperCode = code.toUpperCase();

        // 코드 → 추천인 UID 조회 (users 컬렉션에서 referralCode 필드 검색)
        const codeQuery = await db.collection("users")
            .where("referralCode", "==", upperCode)
            .limit(1)
            .get();
        if (codeQuery.empty) throw new HttpsError("not-found", "존재하지 않는 초대 코드");
        const referrerUid = codeQuery.docs[0].id;

        // 자기 자신 초대 방지
        if (referrerUid === uid) throw new HttpsError("invalid-argument", "본인 초대 코드 사용 불가");

        // 이미 referredBy 저장된 경우 중복 방지
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();
        if (userSnap.exists && userSnap.data().referredBy) {
            throw new HttpsError("already-exists", "이미 초대 코드를 사용했습니다");
        }

        // referredBy 저장 + 신규 가입 보너스 +200P
        await userRef.set({
            referredBy: referrerUid,
            coins: admin.firestore.FieldValue.increment(200)
        }, { merge: true });

        console.log(`referral signup: ${uid} ← ${referrerUid} (code: ${upperCode}) +200P`);
        return { success: true, bonus: 200 };
    }
);

// ========================================
// 8. AI 혈액검사 결과지 분석 (Gemini Vision API)
// ========================================

const BLOOD_TEST_ANALYSIS_PROMPT = `당신은 임상병리 전문의 AI입니다. 혈액검사/건강검진 결과지 사진을 분석하여 주요 수치를 정확히 추출합니다.

## 추출 대상 수치 (사진에 보이는 항목만 추출, 없으면 null)
- glucose: 공복혈당 (mg/dL)
- hba1c: 당화혈색소 HbA1c (%)
- triglyceride: 중성지방 TG (mg/dL)
- totalCholesterol: 총콜레스테롤 (mg/dL)
- hdl: HDL 콜레스테롤 (mg/dL)
- ldl: LDL 콜레스테롤 (mg/dL)
- ast: AST/GOT 간수치 (U/L)
- alt: ALT/GPT 간수치 (U/L)
- ggt: 감마GT (U/L)
- creatinine: 크레아티닌 (mg/dL)
- gfr: 사구체여과율 eGFR (mL/min)
- uricAcid: 요산 (mg/dL)
- hemoglobin: 헤모글로빈 (g/dL)
- vitaminD: 비타민D (ng/mL)
- tsh: 갑상선자극호르몬 TSH (mIU/L)
- bpSystolic: 수축기 혈압 (mmHg)
- bpDiastolic: 이완기 혈압 (mmHg)
- bmi: BMI (kg/m²)

## 분석 기준
각 수치에 대해:
1. 정상 범위 판정: normal / borderline / abnormal
2. 대사건강 관점의 해석

## 종합 의견
- 대사증후군 관련 위험인자 개수 (혈당, 혈압, 중성지방, HDL, 허리둘레 중 해당 항목)
- 가장 주의할 항목과 생활습관 개선 조언

## 응답 형식 (반드시 아래 JSON으로만 응답)
{
  "metrics": {
    "glucose": { "value": 95, "unit": "mg/dL", "status": "normal", "reference": "70-99" },
    "hba1c": { "value": 5.8, "unit": "%", "status": "borderline", "reference": "<5.7" },
    ...(발견된 항목만)
  },
  "riskFactors": 2,
  "riskItems": ["공복혈당 경계", "중성지방 높음"],
  "overallGrade": "B",
  "summary": "전반적으로 양호하나 혈당과 중성지방 관리가 필요합니다.",
  "advice": "초가공식품을 줄이고 식이섬유가 풍부한 식단으로 중성지방을 낮춰보세요.",
  "testDate": "2026-03-01"
}`;

exports.analyzeBloodTest = onCall(
    {
        secrets: [GEMINI_API_KEY],
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { imageUrl } = request.data;
        if (!imageUrl || typeof imageUrl !== "string") {
            throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
        }

        // SSRF 방지: Firebase Storage URL만 허용
        if (!imageUrl.startsWith("https://firebasestorage.googleapis.com/")) {
            throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
        }

        try {
            const imgResponse = await fetch(imageUrl);
            if (!imgResponse.ok) {
                throw new HttpsError("not-found", "이미지를 불러올 수 없습니다.");
            }
            const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
            const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
            const base64Image = imgBuffer.toString("base64");

            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent([
                BLOOD_TEST_ANALYSIS_PROMPT,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: contentType
                    }
                }
            ]);

            const responseText = result.response.text();
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const analysis = JSON.parse(jsonStr);

            // Firestore에 결과 저장
            const uid = request.auth.uid;
            const dateStr = new Date().toISOString().slice(0, 10);
            await db.doc(`users/${uid}/bloodTests/${dateStr}`).set({
                ...analysis,
                imageUrl,
                analyzedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // healthProfile에 주요 수치 자동 반영
            const metrics = analysis.metrics || {};
            const profileUpdate = {};
            if (metrics.glucose?.value) profileUpdate['healthProfile.latestGlucose'] = metrics.glucose.value;
            if (metrics.hba1c?.value) profileUpdate['healthProfile.hba1c'] = String(metrics.hba1c.value);
            if (metrics.triglyceride?.value) profileUpdate['healthProfile.latestTriglyceride'] = metrics.triglyceride.value;
            if (Object.keys(profileUpdate).length > 0) {
                await db.doc(`users/${uid}`).set(profileUpdate, { merge: true });
            }

            return {
                success: true,
                analysis,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("analyzeBloodTest 오류:", error);
            if (error.message && error.message.includes("JSON")) {
                throw new HttpsError("internal", "AI 응답 파싱에 실패했습니다. 사진이 선명한지 확인해주세요.");
            }
            throw new HttpsError("internal", "혈액검사 분석 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 9. 챌린지 보상 수령
// ========================================

// 챌린지 보상 테이블 (blockchain-config.js와 동기화)
const CHALLENGE_REWARDS = {
    'challenge-3d': { rewardPoints: 30 },
    'challenge-7d': { rewardPoints: 100 },
    'challenge-30d': { rewardPoints: 500 }
};

// 하위 호환: 기존 ID로도 조회 가능
const CHALLENGE_ID_MAP = {
    'challenge-diet-3d': 'challenge-3d', 'challenge-exercise-3d': 'challenge-3d',
    'challenge-mind-3d': 'challenge-3d', 'challenge-all-3d': 'challenge-3d',
    'challenge-diet-7d': 'challenge-7d', 'challenge-exercise-7d': 'challenge-7d',
    'challenge-mind-7d': 'challenge-7d', 'challenge-all-7d': 'challenge-7d',
    'challenge-diet-30d': 'challenge-30d', 'challenge-exercise-30d': 'challenge-30d',
    'challenge-mind-30d': 'challenge-30d', 'challenge-all-30d': 'challenge-30d'
};

// 챌린지 정의 (duration, hbtStake, category, tier)
const CHALLENGE_DEFS = {
    'challenge-3d': { duration: 3, hbtStake: 0, category: 'all', tier: 'mini' },
    'challenge-7d': { duration: 7, hbtStake: 50, maxStake: 5000, category: 'all', tier: 'weekly' },
    'challenge-30d': { duration: 30, hbtStake: 100, maxStake: 10000, category: 'all', tier: 'master' }
};

exports.startChallenge = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 30
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { challengeId, hbtAmount, stakeTxHash } = request.data;
        // 하위 호환: 기존 ID를 새 ID로 매핑
        const resolvedId = CHALLENGE_ID_MAP[challengeId] || challengeId;
        const def = CHALLENGE_DEFS[resolvedId];
        if (!def) {
            throw new HttpsError("invalid-argument", "유효하지 않은 챌린지입니다.");
        }

        const stakeAmount = parseFloat(hbtAmount) || 0;
        if (def.hbtStake > 0 && stakeAmount < def.hbtStake) {
            throw new HttpsError("invalid-argument", `최소 ${def.hbtStake} HBT 이상 예치해야 합니다.`);
        }
        if (def.maxStake && stakeAmount > def.maxStake) {
            throw new HttpsError("invalid-argument", `최대 ${def.maxStake} HBT까지만 예치 가능합니다.`);
        }

        const uid = request.auth.uid;
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        const userData = userSnap.data();

        // 온체인 스테이킹 검증 (HBT 예치가 있는 경우)
        if (stakeAmount > 0) {
            if (!stakeTxHash) {
                throw new HttpsError("failed-precondition", "온체인 예치 트랜잭션이 필요합니다.");
            }
            // 온체인에서 트랜잭션 확인
            try {
                const { provider } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                const receipt = await provider.getTransactionReceipt(stakeTxHash);
                if (!receipt || receipt.status !== 1) {
                    throw new HttpsError("failed-precondition", "온체인 예치 트랜잭션이 실패했거나 아직 확인되지 않았습니다.");
                }
            } catch (verifyErr) {
                if (verifyErr.code) throw verifyErr; // HttpsError는 그대로 전달
                console.error("온체인 검증 오류:", verifyErr.message);
                throw new HttpsError("internal", "온체인 예치 검증에 실패했습니다.");
            }
        }

        // 같은 티어에 진행 중인 챌린지 확인
        const activeChallenges = userData.activeChallenges || {};
        if (activeChallenges[def.tier] && 
            (activeChallenges[def.tier].status === 'ongoing' || activeChallenges[def.tier].status === 'claimable')) {
            throw new HttpsError("failed-precondition", "이미 해당 티어에 진행 중인 챌린지가 있습니다.");
        }

        // KST 날짜 계산
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstDate = new Date(now.getTime() + kstOffset);
        const startDate = kstDate.toISOString().split('T')[0];
        const endDateObj = new Date(startDate + 'T12:00:00Z');
        endDateObj.setUTCDate(endDateObj.getUTCDate() + def.duration);
        const endDate = endDateObj.toISOString().split('T')[0];

        // 오늘 인증 확인
        let initialCompletedDays = 0;
        let initialCompletedDates = [];
        try {
            const todayLogSnap = await db.doc(`daily_logs/${uid}_${startDate}`).get();
            if (todayLogSnap.exists) {
                const ap = todayLogSnap.data().awardedPoints || {};
                if (ap.diet && ap.exercise && ap.mind) {
                    initialCompletedDays = 1;
                    initialCompletedDates = [startDate];
                }
            }
        } catch (e) {
            // 무시
        }

        const challengeData = {
            challengeId: resolvedId,
            startDate,
            endDate,
            completedDays: initialCompletedDays,
            completedDates: initialCompletedDates,
            totalDays: def.duration,
            hbtStaked: stakeAmount,
            stakeTxHash: stakeTxHash || null,
            stakedOnChain: stakeAmount > 0,
            status: 'ongoing',
            tier: def.tier
        };

        const updateData = {};
        updateData[`activeChallenges.${def.tier}`] = challengeData;
        if (userData.activeChallenge) updateData.activeChallenge = admin.firestore.FieldValue.delete();
        await userRef.update(updateData);

        // 거래 기록
        if (stakeAmount > 0) {
            await db.collection("blockchain_transactions").add({
                userId: uid,
                type: 'staking',
                challengeId: resolvedId,
                amount: stakeAmount,
                stakeTxHash,
                onChain: true,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: 'success'
            });
        }

        return {
            success: true,
            tier: def.tier,
            duration: def.duration,
            hbtStaked: stakeAmount,
            initialCompletedDays
        };
    }
);

exports.claimChallengeReward = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { tier } = request.data;
        if (!tier || !['mini', 'weekly', 'master'].includes(tier)) {
            throw new HttpsError("invalid-argument", "유효하지 않은 챌린지 티어입니다.");
        }

        const uid = request.auth.uid;
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        const userData = userSnap.data();
        const activeChallenges = userData.activeChallenges || {};
        const challenge = activeChallenges[tier];

        if (!challenge || challenge.status !== 'claimable') {
            throw new HttpsError("failed-precondition", "수령할 보상이 없습니다.");
        }

        const totalDays = challenge.totalDays || 30;
        const successRate = (challenge.completedDays || 0) / totalDays;
        const staked = challenge.hbtStaked || 0;
        const stakedOnChain = challenge.stakedOnChain || false;
        const resolvedChallengeId = CHALLENGE_ID_MAP[challenge.challengeId] || challenge.challengeId;
        const challengeDef = CHALLENGE_REWARDS[resolvedChallengeId] || {};
        const baseRewardP = challengeDef.rewardPoints || 0;
        let rewardHbt = 0;
        let rewardPoints = 0;
        let resolveTxHash = null;
        let bonusTxHash = null;

        if (staked > 0) {
            if (successRate >= 1.0) {
                const bonusRate = tier === 'master' ? 1.0 : 0.5;
                rewardHbt = staked + (staked * bonusRate);
                rewardPoints = baseRewardP;
            } else if (successRate >= 0.8) {
                rewardHbt = staked;
                rewardPoints = baseRewardP;
            }
        } else {
            if (successRate >= 1.0) {
                rewardPoints = baseRewardP;
            } else if (successRate >= 0.8) {
                rewardPoints = Math.round(baseRewardP * 0.5);
            }
        }

        // 온체인 정산: resolveChallenge(user, true) → 스테이킹 100% 반환
        if (stakedOnChain && staked > 0 && successRate >= 0.8) {
            const userWalletAddress = userData.walletAddress;
            if (!userWalletAddress) {
                throw new HttpsError("failed-precondition", "사용자 지갑 주소를 찾을 수 없습니다.");
            }

            try {
                const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                const habitContract = getHabitContract(wallet);

                // 1) resolveChallenge(user, true) — 스테이킹 원금 100% 반환
                const resolveTx = await habitContract.resolveChallenge(userWalletAddress, true);
                const resolveReceipt = await resolveTx.wait();
                resolveTxHash = resolveReceipt.hash;

                // 2) 100% 달성 시 보너스 HBT 온체인 민팅
                if (successRate >= 1.0) {
                    const DECIMALS = 8;
                    const stakedRaw = ethers.parseUnits(staked.toString(), DECIMALS);
                    const bonusMultiplier = tier === 'master' ? 100n : 50n;
                    const bonusHbtRaw = stakedRaw * bonusMultiplier / 100n;

                    if (bonusHbtRaw > 0n) {
                        const currentRate = await habitContract.currentRate();
                        const pointAmount = bonusHbtRaw / currentRate;
                        if (pointAmount > 0n) {
                            const bonusTx = await habitContract.mint(userWalletAddress, pointAmount);
                            const bonusReceipt = await bonusTx.wait();
                            bonusTxHash = bonusReceipt.hash;
                        }
                    }
                }
            } catch (onChainErr) {
                console.error("온체인 정산 오류:", onChainErr.message);
                throw new HttpsError("internal", "온체인 챌린지 정산에 실패했습니다.");
            }
        }

        // Firestore 업데이트 (hbtBalance 제거 — 온체인이 진실의 원천)
        const updateData = {};
        updateData[`activeChallenges.${tier}`] = admin.firestore.FieldValue.delete();
        if (rewardPoints > 0) updateData.coins = admin.firestore.FieldValue.increment(rewardPoints);

        await userRef.update(updateData);

        // 거래 기록 (온체인 TX 해시 포함, date 필드 추가 — 앱의 날짜별 HBT 집계에 필요)
        const _kstDateStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
        await db.collection("blockchain_transactions").add({
            userId: uid,
            type: 'challenge_settlement',
            challengeId: challenge.challengeId,
            amount: rewardHbt,
            date: _kstDateStr,
            staked: staked,
            successRate: successRate,
            completedDays: challenge.completedDays || 0,
            onChain: stakedOnChain,
            resolveTxHash,
            bonusTxHash,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'success'
        });

        return {
            success: true,
            rewardHbt,
            rewardPoints,
            tier,
            successRate: Math.round(successRate * 100),
            resolveTxHash,
            bonusTxHash
        };
    }
);

// ========================================
// 9-1. 챌린지 실패 정산 (온체인 소각)
// ========================================
exports.settleChallengeFailure = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { tier } = request.data;
        if (!tier || !['mini', 'weekly', 'master'].includes(tier)) {
            throw new HttpsError("invalid-argument", "유효하지 않은 챌린지 티어입니다.");
        }

        const uid = request.auth.uid;
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        const userData = userSnap.data();
        const activeChallenges = userData.activeChallenges || {};
        const challenge = activeChallenges[tier];

        if (!challenge) {
            throw new HttpsError("failed-precondition", "해당 티어의 챌린지를 찾을 수 없습니다.");
        }

        const staked = challenge.hbtStaked || 0;
        const stakedOnChain = challenge.stakedOnChain || false;
        const totalDays = challenge.totalDays || 30;
        const successRate = (challenge.completedDays || 0) / totalDays;
        let resolveTxHash = null;

        // 온체인 정산: resolveChallenge(user, false) → 50% 소각 + 50% 반환
        if (stakedOnChain && staked > 0) {
            const userWalletAddress = userData.walletAddress;
            if (!userWalletAddress) {
                throw new HttpsError("failed-precondition", "사용자 지갑 주소를 찾을 수 없습니다.");
            }

            try {
                const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                const habitContract = getHabitContract(wallet);

                const resolveTx = await habitContract.resolveChallenge(userWalletAddress, false);
                const resolveReceipt = await resolveTx.wait();
                resolveTxHash = resolveReceipt.hash;
            } catch (onChainErr) {
                console.error("온체인 소각 정산 오류:", onChainErr.message);
                throw new HttpsError("internal", "온체인 챌린지 실패 정산에 실패했습니다.");
            }
        }

        // Firestore 업데이트: 챌린지 제거
        const updateData = {};
        updateData[`activeChallenges.${tier}`] = admin.firestore.FieldValue.delete();

        await userRef.update(updateData);

        // 거래 기록 (date 필드 추가 — 일관성)
        const _kstDateStrFail = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
        await db.collection("blockchain_transactions").add({
            userId: uid,
            type: 'challenge_failure',
            challengeId: challenge.challengeId,
            date: _kstDateStrFail,
            staked: staked,
            burned: stakedOnChain ? staked / 2 : 0,
            returned: stakedOnChain ? staked / 2 : 0,
            successRate: successRate,
            completedDays: challenge.completedDays || 0,
            onChain: stakedOnChain,
            resolveTxHash,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'success'
        });

        return {
            success: true,
            tier,
            staked,
            burned: stakedOnChain ? staked / 2 : 0,
            returned: stakedOnChain ? staked / 2 : 0,
            resolveTxHash
        };
    }
);

// ========================================
// 10. 월간 MVP 보상 자동 지급
// ========================================

const MVP_REWARDS = [
    { rank: 1, points: 5000, label: '🥇 1위' },
    { rank: 2, points: 2000, label: '🥈 2위' },
    { rank: 3, points: 500, label: '🥉 3위' }
];

exports.distributeMonthlyMvpReward = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 5,
        timeoutSeconds: 30
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { targetMonth } = request.data; // "YYYY-MM" 형식
        if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
            throw new HttpsError("invalid-argument", "유효하지 않은 월 형식입니다. (YYYY-MM)");
        }

        // 이미 지급된 달인지 확인
        const rewardRef = db.doc(`monthly_rewards/${targetMonth}`);
        const rewardSnap = await rewardRef.get();
        if (rewardSnap.exists) {
            // 이미 지급 완료 - 결과만 반환
            return { alreadyDistributed: true, ...rewardSnap.data() };
        }

        // 해당 월의 daily_logs 조회
        const monthStart = `${targetMonth}-01`;
        const monthEnd = `${targetMonth}-31`;
        const q = db.collection("daily_logs")
            .where("date", ">=", monthStart)
            .where("date", "<=", monthEnd);
        const snap = await q.get();

        if (snap.empty) {
            return { alreadyDistributed: false, winners: [] };
        }

        // 사용자별 활동 집계 (기록일 + 댓글 + 리액션)
        const userStats = {};
        snap.forEach(doc => {
            const log = doc.data();
            // 기록 작성자 집계
            if (log.userId) {
                if (!userStats[log.userId]) {
                    userStats[log.userId] = { days: 0, comments: 0, reactions: 0, name: log.userName || '익명' };
                }
                userStats[log.userId].days++;
            }
            // 댓글 작성자 집계
            if (log.comments && Array.isArray(log.comments)) {
                log.comments.forEach(c => {
                    if (!c.userId) return;
                    if (!userStats[c.userId]) userStats[c.userId] = { days: 0, comments: 0, reactions: 0, name: c.userName || '익명' };
                    userStats[c.userId].comments++;
                });
            }
            // 리액션 작성자 집계
            if (log.reactions) {
                ['heart', 'fire', 'clap'].forEach(type => {
                    if (Array.isArray(log.reactions[type])) {
                        log.reactions[type].forEach(uid => {
                            if (!userStats[uid]) userStats[uid] = { days: 0, comments: 0, reactions: 0, name: '회원' };
                            userStats[uid].reactions++;
                        });
                    }
                });
            }
        });

        // MVP 점수 계산: 기록 10점 + 댓글 3점 + 리액션 1점
        Object.values(userStats).forEach(u => {
            u.score = (u.days * 10) + (u.comments * 3) + (u.reactions * 1);
        });

        // 상위 3명 선정 (점수 기준, 기록 1일 이상만)
        const ranked = Object.entries(userStats)
            .map(([userId, stat]) => ({ userId, ...stat }))
            .filter(u => u.days > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        if (ranked.length === 0) {
            return { alreadyDistributed: false, winners: [] };
        }

        // 포인트 지급 (batch write)
        const batch = db.batch();
        const winners = [];
        for (let i = 0; i < ranked.length; i++) {
            const reward = MVP_REWARDS[i];
            const winner = ranked[i];
            const userRef = db.doc(`users/${winner.userId}`);
            batch.set(userRef, {
                coins: admin.firestore.FieldValue.increment(reward.points)
            }, { merge: true });
            winners.push({
                rank: i + 1,
                userId: winner.userId,
                name: winner.name,
                days: winner.days,
                comments: winner.comments,
                reactions: winner.reactions,
                score: winner.score,
                reward: reward.points
            });
        }

        // 지급 기록 저장
        batch.set(rewardRef, {
            winners,
            distributedAt: admin.firestore.FieldValue.serverTimestamp(),
            distributedBy: request.auth.uid
        });

        await batch.commit();
        console.log(`Monthly MVP rewards distributed for ${targetMonth}:`, winners);

        return { alreadyDistributed: false, winners };
    }
);

// ========================================
// 11. 오프체인 hbtBalance → coins 마이그레이션
// ========================================
exports.migrateHbtToCoins = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 1,
        timeoutSeconds: 120
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        // 관리자 확인 (본인 UID만 허용)
        const adminUids = ['YOUR_ADMIN_UID']; // 필요 시 수정
        const isAdmin = adminUids.includes(request.auth.uid);
        // 관리자가 아닌 경우 본인 계정만 마이그레이션
        const targetUid = isAdmin ? (request.data?.targetUid || null) : request.auth.uid;

        const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
        const habitContract = getHabitContract(provider);
        const results = [];

        async function migrateUser(uid) {
            const userRef = db.doc(`users/${uid}`);
            const userSnap = await userRef.get();
            if (!userSnap.exists) return null;

            const userData = userSnap.data();
            const hbtBalance = parseFloat(userData.hbtBalance || 0);
            if (hbtBalance <= 0) return { uid, hbtBalance: 0, converted: 0, skipped: true };

            // 온체인 잔액 + 스테이킹 잔액 조회
            let onChainHbt = 0;
            let stakedHbt = 0;
            const walletAddress = userData.walletAddress;
            if (walletAddress) {
                try {
                    const rawBalance = await habitContract.balanceOf(walletAddress);
                    const rawStaked = await habitContract.challengeStakes(walletAddress);
                    onChainHbt = parseFloat(ethers.formatUnits(rawBalance, 8));
                    stakedHbt = parseFloat(ethers.formatUnits(rawStaked, 8));
                } catch (e) {
                    console.warn(`온체인 조회 실패 (${uid}):`, e.message);
                }
            }

            // 오프체인 초과분 = hbtBalance - (온체인 잔액 + 스테이킹)
            const realHbt = onChainHbt + stakedHbt;
            const offChainExcess = Math.max(0, hbtBalance - realHbt);

            if (offChainExcess <= 0) {
                // hbtBalance가 온체인보다 적거나 같으면 그냥 0으로 초기화
                await userRef.update({ hbtBalance: 0 });
                return { uid, hbtBalance, onChainHbt, stakedHbt, converted: 0, note: 'no excess' };
            }

            // 오프체인 초과분을 포인트(coins)로 전환
            const pointsToAdd = Math.round(offChainExcess);
            await userRef.update({
                hbtBalance: 0,
                coins: admin.firestore.FieldValue.increment(pointsToAdd)
            });

            // 마이그레이션 기록
            await db.collection("blockchain_transactions").add({
                userId: uid,
                type: 'hbt_migration',
                offChainHbt: hbtBalance,
                onChainHbt,
                stakedHbt,
                convertedToCoins: pointsToAdd,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                status: 'success'
            });

            return { uid, hbtBalance, onChainHbt, stakedHbt, converted: pointsToAdd };
        }

        if (targetUid) {
            // 특정 유저만 마이그레이션
            const result = await migrateUser(targetUid);
            results.push(result);
        } else if (isAdmin) {
            // 전체 유저 마이그레이션
            const usersSnap = await db.collection("users").where("hbtBalance", ">", 0).get();
            for (const doc of usersSnap.docs) {
                const result = await migrateUser(doc.id);
                if (result) results.push(result);
            }
        }

        return { success: true, migrated: results.length, results };
    }
);

// ========================================
// 12. 주간 채굴 난이도 자동 조절 (매주 월요일 00:00 KST)
// ========================================

// 난이도 조절 상수
const RATE_SCALE = 100_000_000; // 10^8 (온체인 비율 스케일)
const MAX_RATE = 4.0;           // 1P = 최대 4 HBT
const MIN_RATE = 0.5;           // 최소 비율 (Phase 1 기준: 0.5 HBT/P)
const MAX_RATE_MULTIPLIER = 2.0; // 주당 최대 2배 상승
const MIN_RATE_MULTIPLIER = 0.5; // 주당 최소 절반 하락

// Phase 경계값 (HBT 단위)
const PHASE1_END = 35_000_000;
const PHASE2_END = 52_500_000;
const PHASE3_END = 61_250_000;
const MINING_POOL = 70_000_000;

// Phase별 주간 목표
const PHASE1_WEEKLY = 140_000;
const PHASE2_WEEKLY = 70_000;
const PHASE3_WEEKLY = 35_000;

/**
 * 누적 채굴량 기반 Phase 및 주간 목표 결정
 */
function getPhaseAndWeeklyTarget(totalMinedHbt) {
    if (totalMinedHbt < PHASE1_END) return { phase: 1, weeklyTarget: PHASE1_WEEKLY };
    if (totalMinedHbt < PHASE2_END) return { phase: 2, weeklyTarget: PHASE2_WEEKLY };
    if (totalMinedHbt < PHASE3_END) return { phase: 3, weeklyTarget: PHASE3_WEEKLY };

    // Phase 4+: 무한 반감
    let remaining = MINING_POOL - PHASE3_END;
    let extraMined = totalMinedHbt - PHASE3_END;
    let target = PHASE3_WEEKLY;
    let threshold = remaining / 2;
    let phase = 4;

    while (extraMined >= threshold && threshold > 0) {
        extraMined -= threshold;
        threshold /= 2;
        target /= 2;
        phase++;
    }
    if (target < 1) target = 1;
    return { phase, weeklyTarget: target };
}

/**
 * 새로운 P:HBT 교환 비율 계산
 */
function calculateNewRate(currentRate, last7DaysMinted, totalMinedHbt) {
    const { phase, weeklyTarget } = getPhaseAndWeeklyTarget(totalMinedHbt);

    // 조정 비율 계산
    let rawRatio;
    if (last7DaysMinted <= 0) {
        rawRatio = MAX_RATE_MULTIPLIER; // 채굴 없음 → 최대 상승
    } else {
        rawRatio = weeklyTarget / last7DaysMinted;
    }

    // 변동폭 제한 (Smoothing)
    let adjustmentRatio = rawRatio;
    let clamped = false;
    let clampReason = "";

    if (adjustmentRatio > MAX_RATE_MULTIPLIER) {
        adjustmentRatio = MAX_RATE_MULTIPLIER;
        clamped = true;
        clampReason = `상승 제한 (${rawRatio.toFixed(4)}x → ${MAX_RATE_MULTIPLIER}x)`;
    } else if (adjustmentRatio < MIN_RATE_MULTIPLIER) {
        adjustmentRatio = MIN_RATE_MULTIPLIER;
        clamped = true;
        clampReason = `하락 제한 (${rawRatio.toFixed(4)}x → ${MIN_RATE_MULTIPLIER}x)`;
    }

    let newRate = currentRate * adjustmentRatio;

    // Phase 동적 상한선/하한선 (반감기마다 절반)
    const phaseMultiplier = Math.pow(2, phase - 1);
    const effectiveMaxRate = MAX_RATE / phaseMultiplier;
    const effectiveMinRate = MIN_RATE / phaseMultiplier;

    if (newRate > effectiveMaxRate) {
        newRate = effectiveMaxRate;
        clamped = true;
        clampReason = `상한선 적용 (Phase ${phase}: → ${effectiveMaxRate} HBT/P)`;
    }
    if (newRate < effectiveMinRate) {
        newRate = effectiveMinRate;
        clamped = true;
        clampReason = `하한선 적용 (Phase ${phase}: → ${effectiveMinRate} HBT/P)`;
    }

    // 온체인 형식 변환 (RATE_SCALE = 10^8)
    let newRateScaled = Math.round(newRate * RATE_SCALE);
    if (newRateScaled < 1) newRateScaled = 1;

    return {
        newRate: parseFloat(newRate.toFixed(8)),
        newRateScaled,
        phase,
        weeklyTarget,
        adjustmentRatio: parseFloat(adjustmentRatio.toFixed(6)),
        rawRatio: parseFloat(rawRatio.toFixed(6)),
        clamped,
        clampReason
    };
}

/**
 * 매주 월요일 00:00 KST (일요일 15:00 UTC) 자동 실행
 * 지난 7일간 채굴량을 평가하고 온체인 교환 비율을 갱신합니다.
 */
exports.adjustMiningRate = onSchedule(
    {
        schedule: "0 15 * * 0",  // 매주 일요일 15:00 UTC = 월요일 00:00 KST
        timeZone: "UTC",
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        timeoutSeconds: 120,
        maxInstances: 1
    },
    async (event) => {
        console.log("⛏️ 주간 채굴 난이도 조절 시작...");

        try {
            // 1. 온체인 현재 상태 조회
            const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
            const habitContract = getHabitContract(wallet);

            // 멱등성 보장: 온체인 lastRateUpdate 기준 6일 이내 조정됐으면 스킵
            const lastRateUpdateTs = await habitContract.lastRateUpdate();
            const lastUpdateMs = Number(lastRateUpdateTs) * 1000;
            const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
            if (lastUpdateMs > 0 && Date.now() - lastUpdateMs < sixDaysMs) {
                console.log(`⏭️ 이미 이번 주 비율 조정 완료 (lastRateUpdate: ${new Date(lastUpdateMs).toISOString()}), 건너뜁니다.`);
                return;
            }

            const currentRateRaw = await habitContract.currentRate();
            const totalMintedRaw = await habitContract.totalMintedFromMining();
            const decimals = await habitContract.decimals();

            const currentRateNumber = Number(currentRateRaw) / RATE_SCALE; // HBT per P
            const totalMinedHbt = parseFloat(ethers.formatUnits(totalMintedRaw, decimals));

            console.log(`📊 현재 비율: ${currentRateNumber} HBT/P (raw: ${currentRateRaw})`);
            console.log(`📊 누적 채굴량: ${totalMinedHbt.toLocaleString()} HBT`);

            // 2. 지난 7일간 실제 채굴량 조회 (blockchain_transactions)
            // startDateStr: 7일 전 KST 날짜 (포함), endDateStr: 어제 KST 날짜 (포함, 오늘 제외)
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const toKstDateStr = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
            const startDateStr = toKstDateStr(sevenDaysAgo);
            const endDateStr = toKstDateStr(yesterday);

            const txQuery = db.collection("blockchain_transactions")
                .where("type", "==", "conversion")
                .where("status", "==", "success")
                .where("date", ">=", startDateStr)
                .where("date", "<=", endDateStr);

            const txSnap = await txQuery.get();
            let last7DaysMinted = 0;
            let txCount = 0;
            txSnap.forEach(doc => {
                last7DaysMinted += doc.data().hbtReceived || 0;
                txCount++;
            });

            console.log(`📊 7일간 채굴량: ${last7DaysMinted.toLocaleString()} HBT (${txCount}건)`);

            // 3. 새 비율 계산
            const result = calculateNewRate(currentRateNumber, last7DaysMinted, totalMinedHbt);

            console.log(`📊 Phase: ${result.phase}, 주간 목표: ${result.weeklyTarget.toLocaleString()} HBT`);
            console.log(`📊 조정 배수: ${result.adjustmentRatio}x${result.clamped ? ` (${result.clampReason})` : ""}`);
            console.log(`📊 새 비율: ${result.newRate} HBT/P (raw: ${result.newRateScaled})`);

            // 4. 비율 변경이 없으면 스킵
            if (result.newRateScaled === Number(currentRateRaw)) {
                console.log("⏭️ 비율 변경 없음, 스킵합니다.");
                await saveRateHistory(result, currentRateNumber, last7DaysMinted, totalMinedHbt, txCount, null, "no_change");
                return;
            }

            // 5. 온체인 updateRate() 호출 (RateChangeExceedsLimit 시 이분탐색 재시도)
            let txHash = null;
            let attemptRateScaled = result.newRateScaled;
            const currentRateScaled = Number(currentRateRaw);

            for (let attempt = 0; attempt < 4; attempt++) {
                try {
                    const tx = await habitContract.updateRate(BigInt(attemptRateScaled));
                    const receipt = await tx.wait();
                    txHash = receipt.hash;
                    console.log(`✅ 온체인 비율 업데이트 완료! TX: ${EXPLORER_URL}/tx/${txHash}`);
                    break;
                } catch (chainError) {
                    const chainErrorMsg = chainError.message || "";
                    const isLimitError = chainErrorMsg.includes("RateChangeExceedsLimit") ||
                        chainErrorMsg.includes("rate change exceeds");
                    console.error(`❌ 온체인 updateRate 시도 ${attempt + 1} 실패:`, chainErrorMsg);
                    if (isLimitError && attempt < 3) {
                        const mid = Math.round((currentRateScaled + attemptRateScaled) / 2);
                        if (mid === currentRateScaled || mid === attemptRateScaled) {
                            console.log("⚠️ 이분탐색 더 이상 불가, 업데이트 중단.");
                            break;
                        }
                        attemptRateScaled = mid;
                        console.log(`🔄 이분탐색 재시도 (${currentRateScaled} → ${attemptRateScaled})`);
                    } else {
                        await saveRateHistory(result, currentRateNumber, last7DaysMinted, totalMinedHbt, txCount, null, "chain_error", chainErrorMsg);
                        return;
                    }
                }
            }
            if (!txHash) {
                await saveRateHistory(result, currentRateNumber, last7DaysMinted, totalMinedHbt, txCount, null, "chain_error", "RateChangeExceedsLimit: 이분탐색 실패");
                return;
            }

            // 6. Firestore에 이력 저장
            await saveRateHistory(result, currentRateNumber, last7DaysMinted, totalMinedHbt, txCount, txHash, "success");

            console.log("✅ 주간 채굴 난이도 조절 완료!");

        } catch (error) {
            console.error("❌ 주간 난이도 조절 오류:", error);
        }
    }
);

/**
 * 비율 조정 이력 Firestore 저장
 */
async function saveRateHistory(result, previousRate, last7DaysMinted, totalMinedHbt, txCount, txHash, status, errorMessage) {
    const now = new Date();
    // ISO 8601 주차 계산 (목요일 기준)
    const jan4 = new Date(Date.UTC(now.getUTCFullYear(), 0, 4));
    const dayOfWeek = (now.getUTCDay() + 6) % 7; // 월=0 ... 일=6
    const monday = new Date(now.getTime() - dayOfWeek * 86400000);
    const isoWeek = Math.round((monday - jan4) / (7 * 86400000)) + 1;
    const weekId = `${monday.getUTCFullYear()}-W${String(isoWeek).padStart(2, "0")}`;

    await db.collection("mining_rate_history").doc(weekId).set({
        weekId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        previousRate,
        newRate: result.newRate,
        newRateScaled: result.newRateScaled,
        phase: result.phase,
        weeklyTarget: result.weeklyTarget,
        last7DaysMinted,
        totalMinedHbt,
        transactionCount: txCount,
        adjustmentRatio: result.adjustmentRatio,
        rawRatio: result.rawRatio,
        clamped: result.clamped,
        clampReason: result.clampReason || "",
        txHash: txHash || null,
        status,
        errorMessage: errorMessage || null
    });
}

/**
 * 수동 채굴 난이도 조절 (관리자용)
 * adjustMiningRate 스케줄러와 동일한 로직을 즉시 실행합니다.
 */
exports.adjustMiningRateManual = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 1,
        timeoutSeconds: 120
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        // 관리자 확인
        const adminDoc = await db.doc("admins/" + request.auth.uid).get();
        if (!adminDoc.exists) {
            throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
        }

        try {
            const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
            const habitContract = getHabitContract(wallet);

            const currentRateRaw = await habitContract.currentRate();
            const totalMintedRaw = await habitContract.totalMintedFromMining();
            const decimals = await habitContract.decimals();

            const currentRateNumber = Number(currentRateRaw) / RATE_SCALE;
            const totalMinedHbt = parseFloat(ethers.formatUnits(totalMintedRaw, decimals));

            // 7일간 채굴량 조회
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const toKstDateStr = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
            const startDateStr = toKstDateStr(sevenDaysAgo);
            const endDateStr = toKstDateStr(now);

            const txSnap = await db.collection("blockchain_transactions")
                .where("type", "==", "conversion")
                .where("status", "==", "success")
                .where("date", ">=", startDateStr)
                .where("date", "<=", endDateStr)
                .get();

            let last7DaysMinted = 0;
            let txCount = 0;
            txSnap.forEach(doc => {
                last7DaysMinted += doc.data().hbtReceived || 0;
                txCount++;
            });

            const result = calculateNewRate(currentRateNumber, last7DaysMinted, totalMinedHbt);

            // dryRun 모드: 계산만 하고 실제 온체인 갱신은 안 함
            if (request.data?.dryRun) {
                return {
                    dryRun: true,
                    currentRate: currentRateNumber,
                    ...result,
                    last7DaysMinted,
                    totalMinedHbt,
                    transactionCount: txCount
                };
            }

            // 온체인 비율 갱신 (RateChangeExceedsLimit 시 이분탐색 재시도)
            if (result.newRateScaled !== Number(currentRateRaw)) {
                let txHash = null;
                let attemptRateScaled = result.newRateScaled;
                const currentRateScaled = Number(currentRateRaw);

                for (let attempt = 0; attempt < 4; attempt++) {
                    try {
                        const tx = await habitContract.updateRate(BigInt(attemptRateScaled));
                        const receipt = await tx.wait();
                        txHash = receipt.hash;
                        break;
                    } catch (chainError) {
                        const chainErrorMsg = chainError.message || "";
                        const isLimitError = chainErrorMsg.includes("RateChangeExceedsLimit") ||
                            chainErrorMsg.includes("rate change exceeds");
                        if (isLimitError && attempt < 3) {
                            const mid = Math.round((currentRateScaled + attemptRateScaled) / 2);
                            if (mid === currentRateScaled || mid === attemptRateScaled) break;
                            attemptRateScaled = mid;
                        } else {
                            throw chainError;
                        }
                    }
                }
                await saveRateHistory(result, currentRateNumber, last7DaysMinted, totalMinedHbt, txCount, txHash, "manual");
                return {
                    success: true,
                    txHash,
                    currentRate: currentRateNumber,
                    ...result,
                    last7DaysMinted,
                    totalMinedHbt,
                    transactionCount: txCount
                };
            }

            return {
                success: true,
                noChange: true,
                currentRate: currentRateNumber,
                ...result,
                last7DaysMinted,
                totalMinedHbt,
                transactionCount: txCount
            };

        } catch (error) {
            console.error("수동 난이도 조절 오류:", error);
            throw new HttpsError("internal", "난이도 조절 중 오류가 발생했습니다: " + error.message);
        }
    }
);

/**
 * 커뮤니티 통계를 수동으로 새로고침 (관리자 전용)
 */
exports.refreshCommunityStats = onCall(
    { region: "asia-northeast3", timeoutSeconds: 120 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");
        const adminDoc = await db.doc(`admins/${request.auth.uid}`).get();
        if (!adminDoc.exists) throw new HttpsError("permission-denied", "관리자만 가능");
        await computeCommunityStatsLogic();
        return { success: true };
    }
);

async function computeCommunityStatsLogic() {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kst = new Date(now.getTime() + kstOffset);
    const year = kst.getUTCFullYear();
    const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const monthStart = `${year}-${month}-01`;
    const monthEnd = `${year}-${month}-31`;

    const snap = await db.collection("daily_logs")
        .where("date", ">=", monthStart)
        .where("date", "<=", monthEnd)
        .get();

    const userStats = {};
    const userDates = {};
    snap.forEach(d => {
        const log = d.data();
        if (!log.userId) return;
        const uid = log.userId;
        if (!userStats[uid]) userStats[uid] = { days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0, name: log.userName || "익명" };
        userStats[uid].days++;
        if (log.userName) userStats[uid].name = log.userName;
        if (log.awardedPoints?.diet) userStats[uid].diet++;
        if (log.awardedPoints?.exercise) userStats[uid].exercise++;
        if (log.awardedPoints?.mind) userStats[uid].mind++;
        if (!userDates[uid]) userDates[uid] = new Set();
        userDates[uid].add(log.date);

        if (log.comments && Array.isArray(log.comments)) {
            log.comments.forEach(c => {
                if (!c.userId) return;
                if (!userStats[c.userId]) userStats[c.userId] = { days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0, name: c.userName || "익명" };
                userStats[c.userId].comments++;
            });
        }
        if (log.reactions) {
            ["heart", "fire", "clap"].forEach(type => {
                if (Array.isArray(log.reactions[type])) {
                    log.reactions[type].forEach(ruid => {
                        if (!userStats[ruid]) userStats[ruid] = { days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0, name: "회원" };
                        userStats[ruid].reactions++;
                    });
                }
            });
        }
    });

    let bestStreak = 0, bestStreakName = "";
    Object.entries(userDates).forEach(([uid, dates]) => {
        const sorted = [...dates].sort();
        let streak = 1, maxS = 1;
        for (let i = 1; i < sorted.length; i++) {
            const diff = (new Date(sorted[i] + "T12:00:00Z") - new Date(sorted[i - 1] + "T12:00:00Z")) / 86400000;
            streak = diff === 1 ? streak + 1 : 1;
            if (streak > maxS) maxS = streak;
        }
        if (maxS > bestStreak) { bestStreak = maxS; bestStreakName = userStats[uid]?.name || "익명"; }
    });

    const active = Object.values(userStats).filter(u => u.days > 0);
    const pick = (field) => active.reduce((best, u) => u[field] > (best?.[field] || 0) ? u : best, null);
    const dietKing = pick("diet");
    const exerciseKing = pick("exercise");
    const mindKing = pick("mind");

    Object.values(userStats).forEach(u => { u.score = u.days * 10 + u.comments * 3 + u.reactions; });
    const ranked = Object.entries(userStats)
        .map(([userId, s]) => ({ userId, ...s }))
        .filter(u => u.days > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    const totalUsers = Object.keys(userStats).filter(uid => userStats[uid].days > 0).length;
    const totalDays = Object.values(userStats).reduce((s, u) => s + u.days, 0);
    const totalComments = Object.values(userStats).reduce((s, u) => s + u.comments, 0);
    const totalReactions = Object.values(userStats).reduce((s, u) => s + u.reactions, 0);

    let newMemberCount = 0;
    try {
        const prevDate = new Date(kst);
        prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
        const pStart = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
        const pEnd = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}-31`;
        const prevSnap = await db.collection("daily_logs").where("date", ">=", pStart).where("date", "<=", pEnd).get();
        const prevUsers = new Set();
        prevSnap.forEach(d => { if (d.data().userId) prevUsers.add(d.data().userId); });
        const thisUsers = new Set(Object.keys(userStats).filter(uid => userStats[uid].days > 0));
        newMemberCount = [...thisUsers].filter(uid => !prevUsers.has(uid)).length;
    } catch (_) {}

    await db.doc("meta/communityStats").set({
        month: `${year}-${month}`,
        totalUsers, totalDays, totalComments, totalReactions,
        newMemberCount, bestStreak, bestStreakName,
        dietKing: dietKing ? { name: dietKing.name, count: dietKing.diet } : null,
        exerciseKing: exerciseKing ? { name: exerciseKing.name, count: exerciseKing.exercise } : null,
        mindKing: mindKing ? { name: mindKing.name, count: mindKing.mind } : null,
        ranked: ranked.map(r => ({ name: r.name, days: r.days, comments: r.comments, reactions: r.reactions, score: r.score })),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ communityStats ${year}-${month} 업데이트 완료: ${totalUsers}명, ${snap.size}건 처리`);
}

/**
 * 커뮤니티 월간 통계 사전 계산 (1시간마다)
 * 결과를 meta/communityStats 문서에 저장하여 클라이언트가 문서 1개만 읽으면 됨
 */
exports.computeCommunityStats = onSchedule(
    { schedule: "every 1 hours", region: "asia-northeast3", timeoutSeconds: 120 },
    async () => { await computeCommunityStatsLogic(); }
);

// 대시보드 데이터 일괄 조회 (모바일 로딩 최적화: 4개 쿼리 → 1 HTTP 호출)
exports.getDashboardData = onCall(
    { region: "asia-northeast3", timeoutSeconds: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");
        const uid = request.auth.uid;
        const { weekStart, weekEnd } = request.data || {};
        if (!weekStart || !weekEnd) throw new HttpsError("invalid-argument", "weekStart, weekEnd 필수");

        const [userSnap, weekSnap, streakSnap, statsSnap] = await Promise.all([
            db.doc(`users/${uid}`).get(),
            db.collection("daily_logs")
                .where("userId", "==", uid)
                .where("date", ">=", weekStart)
                .where("date", "<=", weekEnd)
                .get(),
            db.collection("daily_logs")
                .where("userId", "==", uid)
                .orderBy("date", "desc")
                .limit(30)
                .get(),
            db.doc("meta/communityStats").get()
        ]);

        const user = userSnap.exists ? userSnap.data() : {};
        const weekLogs = [];
        weekSnap.forEach(d => {
            const dd = d.data();
            weekLogs.push({ date: dd.date, awardedPoints: dd.awardedPoints || {} });
        });
        const streakLogs = [];
        streakSnap.forEach(d => {
            const dd = d.data();
            streakLogs.push({ date: dd.date, awardedPoints: dd.awardedPoints || {} });
        });
        const communityStats = statsSnap.exists ? statsSnap.data() : null;

        return { user, weekLogs, streakLogs, communityStats };
    }
);

// ========================================
// 사용자 지갑 가스(ETH) 자동 충전
// ========================================
exports.prefundWallet = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        const userData = userSnap.data();
        const walletAddress = userData.walletAddress;
        if (!walletAddress) {
            throw new HttpsError("failed-precondition", "지갑 주소가 없습니다.");
        }

        // 24시간 충전 제한
        const lastFunded = userData.lastGasFunded;
        if (lastFunded) {
            const elapsed = Date.now() - lastFunded.toMillis();
            if (elapsed < 24 * 60 * 60 * 1000) {
                return { funded: false, reason: "24시간 내 이미 충전됨" };
            }
        }

        const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
        const bnbBalance = await provider.getBalance(walletAddress);
        const THRESHOLD = ethers.parseEther("0.003");

        if (bnbBalance >= THRESHOLD) {
            return { funded: false, reason: "BNB 잔액 충분" };
        }

        const FUND_AMOUNT = ethers.parseEther("0.005");
        const tx = await wallet.sendTransaction({ to: walletAddress, value: FUND_AMOUNT });
        await tx.wait();

        await userRef.update({ lastGasFunded: admin.firestore.FieldValue.serverTimestamp() });

        console.log(`✅ 가스 충전 완료: ${walletAddress} +0.005 BNB`);
        return { funded: true, amount: "0.005", txHash: tx.hash };
    }
);
