/**
 * HaBit (HBT) Cloud Functions
 * 
 * 온체인 민팅, 잔액 조회, 챌린지 정산을 처리하는 서버리스 함수
 * 
 * 엔드포인트:
 *   - mintHBT: 포인트 → HBT 온체인 민팅
 *   - getOnchainBalance: 사용자 온체인 HBT 잔액 조회
 *   - getTokenStats: 전체 토큰 통계 조회
 * 
 * 보안:
 *   - Firebase Auth 인증 필수 (onCall)
 *   - Server Minter 키는 Secret Manager에 저장
 *   - 포인트 잔액은 Firestore에서 서버측 검증
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { ethers } = require("ethers");
const contractAbi = require("./contract-abi.json");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

// Firebase 초기화
admin.initializeApp();
const db = admin.firestore();

// 비밀 키 (Firebase Secret Manager)
const SERVER_MINTER_KEY = defineSecret("SERVER_MINTER_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// 컨트랙트 주소 (Base Sepolia)
const HABIT_ADDRESS = "0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29";
const STAKING_ADDRESS = "0xa439c57806174fbAB0A78b8Cd13a51d94C2a1631";
const RPC_URL = "https://sepolia.base.org";
const CHAIN_ID = 84532;
const EXPLORER_URL = "https://sepolia.basescan.org";

// 일일 전환 한도
const MAX_DAILY_HBT = 1000;
const MIN_POINTS = 100;

/**
 * ethers Provider & Wallet 인스턴스 생성
 */
function getProviderAndWallet(privateKey) {
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const wallet = new ethers.Wallet(privateKey, provider);
    return { provider, wallet };
}

/**
 * HaBit 컨트랙트 인스턴스 생성
 */
function getHabitContract(signerOrProvider) {
    return new ethers.Contract(HABIT_ADDRESS, contractAbi.HaBit, signerOrProvider);
}

// ========================================
// 1. 포인트 → HBT 온체인 민팅
// ========================================
exports.mintHBT = onCall(
    { 
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",  // 서울 리전
        maxInstances: 10
    },
    async (request) => {
        // 인증 확인
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        const { pointAmount } = request.data;

        // 입력 검증
        if (!pointAmount || typeof pointAmount !== "number" || pointAmount < MIN_POINTS) {
            throw new HttpsError("invalid-argument", `최소 ${MIN_POINTS}P 이상 필요합니다.`);
        }
        if (pointAmount % 100 !== 0) {
            throw new HttpsError("invalid-argument", "100P 단위로만 변환 가능합니다.");
        }

        try {
            // 1. Firestore에서 사용자 데이터 확인
            const userRef = db.collection("users").doc(uid);
            const userSnap = await userRef.get();

            if (!userSnap.exists) {
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

            // 일일 변환 한도 확인
            const today = new Date().toISOString().split("T")[0];
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

            // 2. 온체인 전환 비율 확인
            const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
            const habitContract = getHabitContract(wallet);

            const [currentRate, currentEra] = await habitContract.getConversionRate();
            const rateNumber = Number(currentRate);
            const eraNumber = Number(currentEra);

            // HBT 계산 (컨트랙트와 동일한 로직)
            const hbtAmount = (pointAmount * rateNumber) / 100;

            if (todayMinted + hbtAmount > MAX_DAILY_HBT) {
                throw new HttpsError("resource-exhausted", 
                    `일일 변환 한도 초과. 오늘 사용: ${todayMinted} HBT, 한도: ${MAX_DAILY_HBT} HBT`);
            }

            // 3. Firestore 포인트 차감 (원자적)
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
                const tx = await habitContract.habitMine(walletAddress, pointAmount);
                const receipt = await tx.wait();
                txHash = receipt.hash;
                onchainSuccess = true;
            } catch (chainError) {
                // 온체인 실패 → 포인트 복원
                console.error("온체인 민팅 실패, 포인트 복원:", chainError.message);
                await userRef.update({
                    coins: admin.firestore.FieldValue.increment(pointAmount)
                });
                throw new HttpsError("internal", `온체인 민팅 실패: ${chainError.message}`);
            }

            // 5. Firestore 업데이트 (HBT 잔액 + 기록)
            await userRef.update({
                hbtBalance: admin.firestore.FieldValue.increment(hbtAmount),
                totalHbtEarned: admin.firestore.FieldValue.increment(hbtAmount)
            });

            // 6. 거래 기록 저장
            await db.collection("blockchain_transactions").add({
                userId: uid,
                type: "conversion",
                pointsUsed: pointAmount,
                hbtReceived: hbtAmount,
                conversionRate: rateNumber,
                era: eraNumber,
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
                era: eraNumber
            };

        } catch (error) {
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

            return {
                totalSupply: ethers.formatUnits(stats[0], decimals),
                totalMined: ethers.formatUnits(stats[1], decimals),
                totalBurned: ethers.formatUnits(stats[2], decimals),
                circulatingSupply: ethers.formatUnits(stats[3], decimals),
                currentRate: Number(stats[4]),
                currentEra: Number(stats[5]),
                remainingInEra: ethers.formatUnits(stats[6], decimals)
            };

        } catch (error) {
            console.error("getTokenStats 오류:", error);
            throw new HttpsError("internal", "통계 조회 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 4. AI 식단 분석 (Gemini Vision)
// ========================================

/**
 * Firebase Storage URL에서 이미지 바이트를 가져와 base64 반환
 */
async function fetchImageAsBase64(imageUrl) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`이미지 다운로드 실패: ${response.status}`);
    const buffer = await response.buffer();
    return buffer.toString("base64");
}

const DIET_ANALYSIS_PROMPT = `당신은 전문 영양사입니다. 이 식단 사진을 분석해주세요.

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드블럭 없이 순수 JSON만):
{
  "grade": "A~F 중 하나",
  "summary": "한 줄 총평",
  "naturalRatio": 0~100 사이 숫자 (자연식품 비율 %),
  "foods": [
    {"name": "음식명", "category": "natural 또는 processed 또는 ultraprocessed"}
  ],
  "scores": {
    "vitamins": 0~100,
    "minerals": 0~100,
    "fiber": 0~100,
    "antioxidants": 0~100
  },
  "insulinComment": "인슐린 저항성에 미치는 영향 코멘트",
  "suggestion": "개선 제안"
}

등급 기준:
- A: 자연식품 90%+, 초가공 0개
- B: 자연식품 70%+, 초가공 1개 이하
- C: 자연식품 50%+, 초가공 2개 이하
- D: 자연식품 30%+, 초가공 3개 이상
- F: 자연식품 30% 미만 또는 초가공 과다

category 분류:
- natural: 채소, 과일, 생선, 현미 등 가공 최소
- processed: 두부, 김치, 치즈 등 전통 가공
- ultraprocessed: 라면, 소시지, 과자, 탄산음료 등 공장 가공`;

const SLEEP_ANALYSIS_PROMPT = `당신은 수면 전문의입니다. 이 수면 기록 캡처 화면을 분석해주세요.

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드블럭 없이 순수 JSON만):
{
  "type": "sleep",
  "grade": "A~F 중 하나",
  "summary": "한 줄 총평",
  "details": {
    "sleepDuration": "N시간 M분",
    "sleepQuality": "좋음/보통/나쁨",
    "deepSleepRatio": "심수면 비율 평가",
    "consistency": "취침-기상 규칙성 평가"
  },
  "feedback": "개선을 위한 구체적 조언",
  "insulinComment": "수면과 인슐린 저항성 관계 코멘트"
}

등급 기준:
- A: 7-9시간, 심수면 충분, 규칙적
- B: 6-7시간, 심수면 보통, 대체로 규칙적
- C: 5-6시간 또는 불규칙
- D: 5시간 미만 또는 매우 불규칙
- F: 심각한 수면 부족`;

const MIND_ANALYSIS_PROMPT = `당신은 심리 상담 전문가입니다. 감사일기/명상 기록을 분석해주세요.

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드블럭 없이 순수 JSON만):
{
  "type": "mind",
  "grade": "A~F 중 하나",
  "summary": "한 줄 총평",
  "details": {
    "emotionTone": "긍정적/중립/부정적",
    "stressLevel": "낮음/보통/높음",
    "gratitudeDepth": "깊음/보통/표면적"
  },
  "feedback": "마음 건강 개선 조언",
  "insulinComment": "스트레스와 대사 건강 관계 코멘트"
}`;

/**
 * Gemini 모델로 이미지+텍스트 분석
 */
async function analyzeWithGemini(apiKey, prompt, imageBase64, mimeType) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const parts = [{ text: prompt }];
    if (imageBase64) {
        parts.push({
            inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: imageBase64
            }
        });
    }

    const result = await model.generateContent(parts);
    const response = result.response;
    let text = response.text();

    // 마크다운 코드블럭 제거
    text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    return JSON.parse(text);
}

exports.analyzeDiet = onCall(
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

        const { imageUrl, imageData } = request.data;
        if (!imageUrl && !imageData) {
            throw new HttpsError("invalid-argument", "이미지 URL 또는 데이터가 필요합니다.");
        }

        try {
            let base64Data;
            let mimeType = "image/jpeg";

            if (imageData && imageData.startsWith("data:")) {
                // data:image/jpeg;base64,xxxx 형태
                const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                    mimeType = match[1];
                    base64Data = match[2];
                } else {
                    throw new HttpsError("invalid-argument", "잘못된 이미지 데이터 형식입니다.");
                }
            } else if (imageUrl) {
                base64Data = await fetchImageAsBase64(imageUrl);
            }

            const analysis = await analyzeWithGemini(
                GEMINI_API_KEY.value(),
                DIET_ANALYSIS_PROMPT,
                base64Data,
                mimeType
            );

            return { analysis };
        } catch (error) {
            console.error("analyzeDiet 오류:", error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError("internal", `식단 분석 실패: ${error.message}`);
        }
    }
);

// ========================================
// 5. AI 수면/마음 분석 (Gemini Vision)
// ========================================
exports.analyzeSleepMind = onCall(
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

        const { imageUrl, imageData, textData, analysisType } = request.data;
        if (!analysisType || !['sleep', 'mind'].includes(analysisType)) {
            throw new HttpsError("invalid-argument", "analysisType은 'sleep' 또는 'mind'여야 합니다.");
        }

        try {
            let base64Data = null;
            let mimeType = "image/jpeg";

            if (imageData && imageData.startsWith("data:")) {
                const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                    mimeType = match[1];
                    base64Data = match[2];
                }
            } else if (imageUrl) {
                base64Data = await fetchImageAsBase64(imageUrl);
            }

            let prompt = analysisType === 'sleep' ? SLEEP_ANALYSIS_PROMPT : MIND_ANALYSIS_PROMPT;

            // 텍스트 데이터가 있으면 프롬프트에 추가
            if (textData) {
                prompt += `\n\n사용자가 작성한 내용:\n${textData}`;
            }

            const analysis = await analyzeWithGemini(
                GEMINI_API_KEY.value(),
                prompt,
                base64Data,
                mimeType
            );

            return { analysis };
        } catch (error) {
            console.error("analyzeSleepMind 오류:", error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError("internal", `수면/마음 분석 실패: ${error.message}`);
        }
    }
);
