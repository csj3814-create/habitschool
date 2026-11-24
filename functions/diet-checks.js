/**
 * 식단 분석 2판: 체크 5개와 등급 (2026-11-20).
 *
 * 예전에는 모델이 비타민·무기질·섬유질·항산화를 0~100 으로 적고 등급도 직접
 * 매겼다. 그 숫자에는 분모도 g 도 없었다. 이제 모델은 **사진에서 보이는 것**만
 * 정해진 낱말로 답하고(채소가 접시의 반인가, 단백질 반찬이 있나, 국물이 짠가),
 * 체크와 등급은 여기서 계산한다. 같은 답이면 늘 같은 등급이 나온다.
 *
 *   통과 5개 = A, 4 = B, 3 = C, 2 = D, 0~1 = F
 *
 * 간식·음료는 등급을 매기지 않는다. 사과 한 알에 "채소 없음, 단백질 없음" 으로
 * F 를 주면 억울하다. 대신 초가공이 없고 단맛이 강하지 않으면 「좋은 간식」.
 */

const DIET_CHECK_KEYS = Object.freeze(["vegetables", "protein", "ultraprocessed", "carbs", "sodium"]);

const MEAL_TYPES = Object.freeze(["meal", "snack", "drink"]);
const FOOD_CATEGORIES = Object.freeze(["natural", "processed", "ultraprocessed"]);
// 채소는 비율이 아니라 양으로 본다(2026-11-21 대표: 봄동이 넉넉한데 "채소 부족"). enough = 합쳐서 두 주먹 이상.
// 스테이징에 잠깐 쓰인 "half" 는 enough 로 읽는다.
const VEGETABLE_LEVELS = Object.freeze(["enough", "some", "none"]);
const PROTEIN_LEVELS = Object.freeze(["enough", "some", "none"]);
const CARB_TYPES = Object.freeze(["whole", "refined", "none"]);
const CARB_AMOUNTS = Object.freeze(["small", "moderate", "large"]);
const SODIUM_LEVELS = Object.freeze(["low", "normal", "high"]);
const SWEETNESS_LEVELS = Object.freeze(["low", "moderate", "high"]);

// 2026-11-23 대표: 5개 모두 통과면 S, 하나씩 빠질 때마다 A·B·C·D, 0개일 때만 F.
// js/diet-checks.js 의 DIET_GRADE_BY_CHECK_COUNT 와 같아야 한다.
const GRADE_BY_CHECK_COUNT = Object.freeze({ 5: "S", 4: "A", 3: "B", 2: "C", 1: "D", 0: "F" });
const MAX_FOODS = 12;

function text(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function pick(value, allowed) {
    const v = String(value == null ? "" : value).trim().toLowerCase();
    return allowed.includes(v) ? v : null;
}

function whole(value, min, max) {
    const n = Number(value);
    if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeFoods(rawFoods) {
    const foods = [];
    for (const food of Array.isArray(rawFoods) ? rawFoods : []) {
        if (foods.length >= MAX_FOODS) break;
        if (!food || typeof food !== "object") continue;
        const name = text(food.name, 80);
        const category = pick(food.category, FOOD_CATEGORIES);
        if (!name || !category) continue;
        const entry = { name, category };
        const nutrients = text(food.nutrients, 120);
        if (nutrients) entry.nutrients = nutrients;
        foods.push(entry);
    }
    return foods;
}

/**
 * 탄수화물 체크: 양만 본다. 밥·면이 한 공기를 넘거나 밥과 면을 함께 먹을 때(large)만 실패.
 *
 * 2026-11-22 운영 이틀 데이터: 식사 79끼 중 탄수화물 실패 35끼, 그중 24끼가 흰쌀밥 한 공기였다.
 * 「흰쌀이면 반 공기 이하만 통과」는 평범한 한식 한 끼를 거의 다 떨어뜨렸다(대표 "너무 깐깐하다").
 * 흰쌀인지 잡곡인지는 등급 대신 제안 문장에서 권한다.
 */
function carbsPass(type, amount) {
    if (type === "none") return true;
    return amount !== "large";
}

/**
 * 끼니(식사) 하나의 체크. 값이 빠진 항목은 통과로 치지 않는다 — 다만 정리 단계에서
 * 빠진 값은 이미 오류로 걸러 낸다(normalizeDietModelResponse).
 */
function computeDietChecks({ vegetables, proteinLevel, carbsType, carbsAmount, sodiumLevel, foods }) {
    return {
        vegetables: vegetables === "enough",
        protein: proteinLevel === "enough",
        ultraprocessed: !(foods || []).some((food) => food.category === "ultraprocessed"),
        carbs: carbsPass(carbsType, carbsAmount),
        sodium: sodiumLevel !== null && sodiumLevel !== "high"
    };
}

function gradeForCheckCount(count) {
    return GRADE_BY_CHECK_COUNT[Math.max(0, Math.min(5, count))];
}

/**
 * 모델의 JSON → 저장할 분석. 꼭 있어야 할 값이 빠지면 Error 를 던진다
 * (호출하는 쪽이 "다시 시도해 주세요" 로 바꾼다). Firestore 는 undefined 를
 * 받지 않으므로 값이 없는 칸은 아예 넣지 않는다.
 */
function normalizeDietModelResponse(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("diet_json_invalid: not an object");
    }
    const mealType = pick(raw.mealType, MEAL_TYPES);
    if (!mealType) throw new Error("diet_json_invalid: mealType");

    const foods = normalizeFoods(raw.foods);
    const protein = raw.protein && typeof raw.protein === "object" ? raw.protein : {};
    const carbs = raw.carbs && typeof raw.carbs === "object" ? raw.carbs : {};
    const sodium = raw.sodium && typeof raw.sodium === "object" ? raw.sodium : {};

    const out = { version: 2, mealType, foods };

    const vegetables = pick(String(raw.vegetables || "").trim().toLowerCase() === "half" ? "enough" : raw.vegetables, VEGETABLE_LEVELS);
    const proteinLevel = pick(protein.level, PROTEIN_LEVELS);
    const carbsType = pick(carbs.type, CARB_TYPES);
    const carbsAmount = pick(carbs.amount, CARB_AMOUNTS);
    const sodiumLevel = pick(sodium.level, SODIUM_LEVELS);
    const sweetness = pick(raw.sweetness, SWEETNESS_LEVELS);

    if (mealType === "meal") {
        const missing = [
            ["vegetables", vegetables],
            ["protein.level", proteinLevel],
            ["carbs.type", carbsType],
            ["sodium.level", sodiumLevel]
        ].filter(([, value]) => value === null).map(([name]) => name);
        if (missing.length > 0) throw new Error(`diet_json_invalid: ${missing.join(",")}`);
    }

    if (vegetables) out.vegetables = vegetables;
    if (proteinLevel) {
        out.proteinLevel = proteinLevel;
        let lo = whole(protein.gramsMin, 0, 150);
        let hi = whole(protein.gramsMax, 0, 150);
        if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
        // "없음" 에 g 을 붙이면 말이 안 된다.
        if (proteinLevel !== "none" && lo !== null && hi !== null && hi > 0) {
            out.proteinGramsMin = lo;
            out.proteinGramsMax = hi;
        }
    }
    if (carbsType) out.carbsType = carbsType;
    // 밥이 없으면 양도 없다. 모델이 "moderate" 를 붙여 와도 버린다.
    if (carbsAmount && carbsType && carbsType !== "none") out.carbsAmount = carbsAmount;
    const carbsNote = text(carbs.note, 40);
    if (carbsNote && carbsType && carbsType !== "none") out.carbsNote = carbsNote;
    if (sodiumLevel) out.sodiumLevel = sodiumLevel;
    const sodiumSources = text(sodium.sources, 60);
    if (sodiumSources && sodiumLevel && sodiumLevel !== "low") out.sodiumSources = sodiumSources;
    if (sweetness) out.sweetness = sweetness;

    const colorCount = whole(raw.colorCount, 0, 10);
    if (colorCount !== null) out.colorCount = colorCount;
    const fiberGrams = whole(raw.fiberGrams, 0, 60);
    if (fiberGrams !== null) out.fiberGrams = fiberGrams;
    const naturalRatio = whole(raw.naturalRatio, 0, 100);
    if (naturalRatio !== null) out.naturalRatio = naturalRatio;

    if (mealType === "meal") {
        const checks = computeDietChecks({ vegetables, proteinLevel, carbsType, carbsAmount, sodiumLevel, foods });
        const checkCount = DIET_CHECK_KEYS.filter((key) => checks[key]).length;
        out.checks = checks;
        out.checkCount = checkCount;
        out.grade = gradeForCheckCount(checkCount);
    } else {
        const noUltra = !foods.some((food) => food.category === "ultraprocessed");
        out.snackVerdict = noUltra && sweetness !== "high" ? "good" : "meh";
    }

    const insulinComment = text(raw.insulinComment, 500);
    const suggestion = text(raw.suggestion, 500);
    const summary = text(raw.summary, 280);
    if (insulinComment) out.insulinComment = insulinComment;
    if (suggestion) out.suggestion = suggestion;
    if (summary) out.summary = summary;
    return out;
}

/**
 * 이미 정리된 2판 분석에서 공개해도 되는 칸만 다시 고른다(갤러리용).
 * 저장된 값을 믿지 않고 체크·등급을 다시 계산한다 — 기록은 회원 기기가 쓴다.
 * 2판이 아니면 null.
 */
function pickPublicDietV2Fields(raw) {
    if (!raw || typeof raw !== "object" || Number(raw.version) !== 2) return null;
    const rebuilt = {
        mealType: raw.mealType,
        foods: raw.foods,
        vegetables: raw.vegetables,
        protein: { level: raw.proteinLevel, gramsMin: raw.proteinGramsMin, gramsMax: raw.proteinGramsMax },
        carbs: { type: raw.carbsType, amount: raw.carbsAmount, note: raw.carbsNote },
        sodium: { level: raw.sodiumLevel, sources: raw.sodiumSources },
        sweetness: raw.sweetness,
        colorCount: raw.colorCount,
        fiberGrams: raw.fiberGrams,
        naturalRatio: raw.naturalRatio,
        insulinComment: raw.insulinComment,
        suggestion: raw.suggestion,
        summary: raw.summary
    };
    try {
        return normalizeDietModelResponse(rebuilt);
    } catch (_) {
        return null;
    }
}

/**
 * Gemini 응답 틀. 낱말을 enum 으로 묶어 두면 모델이 "반 정도" 같은 말을 지어내지 못한다.
 * @google/generative-ai 0.21 의 Schema 형식(type 문자열, enum 은 format:"enum").
 */
function enumString(values, description) {
    return { type: "STRING", format: "enum", enum: [...values], description };
}

const DIET_RESPONSE_SCHEMA = Object.freeze({
    type: "OBJECT",
    properties: {
        mealType: enumString(MEAL_TYPES, "meal = 한 끼 식사, snack = 간식, drink = 음료만"),
        foods: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    category: enumString(FOOD_CATEGORIES, "natural | processed | ultraprocessed"),
                    nutrients: { type: "STRING" }
                },
                required: ["name", "category"]
            }
        },
        vegetables: enumString(VEGETABLE_LEVELS, "채소를 모두 합친 양 (비율이 아님, 절임 제외)"),
        protein: {
            type: "OBJECT",
            properties: {
                level: enumString(PROTEIN_LEVELS, "단백질 반찬의 양"),
                gramsMin: { type: "INTEGER", nullable: true },
                gramsMax: { type: "INTEGER", nullable: true }
            },
            required: ["level"]
        },
        carbs: {
            type: "OBJECT",
            properties: {
                type: enumString(CARB_TYPES, "주식 탄수화물의 종류"),
                amount: enumString(CARB_AMOUNTS, "주식 탄수화물의 양"),
                note: { type: "STRING", nullable: true }
            },
            required: ["type"]
        },
        sodium: {
            type: "OBJECT",
            properties: {
                level: enumString(SODIUM_LEVELS, "짠 음식의 정도"),
                sources: { type: "STRING", nullable: true }
            },
            required: ["level"]
        },
        sweetness: enumString(SWEETNESS_LEVELS, "단맛의 정도"),
        colorCount: { type: "INTEGER" },
        fiberGrams: { type: "INTEGER" },
        naturalRatio: { type: "INTEGER" },
        insulinComment: { type: "STRING" },
        suggestion: { type: "STRING" },
        summary: { type: "STRING" }
    },
    required: [
        "mealType", "foods", "vegetables", "protein", "carbs", "sodium", "sweetness",
        "colorCount", "fiberGrams", "naturalRatio", "insulinComment", "suggestion", "summary"
    ]
});

// 2026-11-24 대표 제보: 사진 두세 장을 올리면 "AI 분석에 실패했습니다 (internal)" 가 자주 났다.
// 운영 기록으로 그날 식단 분석 94번 중 9번. 다시 만들어 보니 모델이 숫자 칸(gramsMin 등)에
// "20000000000…" 처럼 0 을 끝없이 이어 쓰다가 출력 상한에 걸려 JSON 이 잘렸다.
// 정상 응답은 길어야 출력 토큰 1,000개 아래다. 상한을 2,048 로 낮춰 헛도는 응답을 빨리 끊고,
// 읽지 못한 응답은 한 번 더 받는다(js 쪽에서 다시 누를 일을 서버가 대신한다).
const DIET_MAX_OUTPUT_TOKENS = 2048;
const DIET_MODEL_ATTEMPTS = 2;

/** 모델 글 → 저장할 분석. 코드 블록(```json)을 벗기고 읽는다. 읽지 못하면 Error. */
function parseDietModelText(text = "") {
    let jsonStr = String(text || "");
    const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonStr = fenced[1].trim();
    return normalizeDietModelResponse(JSON.parse(jsonStr));
}

module.exports = {
    DIET_CHECK_KEYS,
    DIET_MAX_OUTPUT_TOKENS,
    DIET_MODEL_ATTEMPTS,
    DIET_RESPONSE_SCHEMA,
    parseDietModelText,
    computeDietChecks,
    gradeForCheckCount,
    normalizeDietModelResponse,
    pickPublicDietV2Fields
};
