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

// 컨트랙트 주소 (Base Sepolia) — v2
const HABIT_ADDRESS = "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B";
const STAKING_ADDRESS = "0x7e8c29699F382B553891f853299e615257491F9D";
const RPC_URL = "https://sepolia.base.org";
const CHAIN_ID = 84532;
const EXPLORER_URL = "https://sepolia.basescan.org";

// 일일 변환 한도
const MAX_DAILY_HBT = 1000;
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

            // 5. Firestore 업데이트 (HBT 잔액 + 기록)
            await userRef.update({
                hbtBalance: admin.firestore.FieldValue.increment(hbtAmount),
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
        } catch (err) {
            console.error("awardPoints 오류:", err);
        }
    }
);

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
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 30
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { challengeId, hbtAmount } = request.data;
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

        // HBT 잔액 확인
        if (stakeAmount > 0 && (userData.hbtBalance || 0) < stakeAmount) {
            throw new HttpsError("failed-precondition",
                `HBT가 부족합니다. 필요: ${stakeAmount}, 보유: ${userData.hbtBalance || 0}`);
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
                // 모든 챌린지는 통합: 식단+운동+마음 3개 모두 필요
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
            status: 'ongoing',
            tier: def.tier
        };

        const updateData = {};
        updateData[`activeChallenges.${def.tier}`] = challengeData;
        if (userData.activeChallenge) updateData.activeChallenge = admin.firestore.FieldValue.delete();
        if (stakeAmount > 0) {
            updateData.hbtBalance = admin.firestore.FieldValue.increment(-stakeAmount);
        }
        await userRef.update(updateData);

        // 거래 기록
        if (stakeAmount > 0) {
            await db.collection("blockchain_transactions").add({
                userId: uid,
                type: 'staking',
                challengeId,
                amount: stakeAmount,
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
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 30
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
        const resolvedChallengeId = CHALLENGE_ID_MAP[challenge.challengeId] || challenge.challengeId;
        const challengeDef = CHALLENGE_REWARDS[resolvedChallengeId] || {};
        const baseRewardP = challengeDef.rewardPoints || 0;
        let rewardHbt = 0;
        let rewardPoints = 0;

        if (staked > 0) {
            if (successRate >= 1.0) {
                // 100% 달성: 원금 + 보너스 (위클리 +50%, 마스터 +100%)
                const bonusRate = tier === 'master' ? 1.0 : 0.5;
                rewardHbt = staked + (staked * bonusRate);
                rewardPoints = baseRewardP;
            } else if (successRate >= 0.8) {
                // 80%+ 달성: 원금만 반환 (보너스 없음)
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

        // Firestore 업데이트 (서버 권한)
        const updateData = {};
        updateData[`activeChallenges.${tier}`] = admin.firestore.FieldValue.delete();
        if (rewardHbt > 0) updateData.hbtBalance = admin.firestore.FieldValue.increment(rewardHbt);
        if (rewardPoints > 0) updateData.coins = admin.firestore.FieldValue.increment(rewardPoints);

        await userRef.update(updateData);

        // 거래 기록
        await db.collection("blockchain_transactions").add({
            userId: uid,
            type: 'challenge_settlement',
            challengeId: challenge.challengeId,
            amount: rewardHbt,
            staked: staked,
            successRate: successRate,
            completedDays: challenge.completedDays || 0,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'success'
        });

        return {
            success: true,
            rewardHbt,
            rewardPoints,
            tier,
            successRate: Math.round(successRate * 100)
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
