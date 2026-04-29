const crypto = require("crypto");

const REWARD_MARKET_MIN_REDEMPTION_POINTS = 500;
const REWARD_MARKET_MIN_REDEMPTION_HBT = REWARD_MARKET_MIN_REDEMPTION_POINTS;
const REWARD_RESERVE_DOC_ID = "main";
const REWARD_PRICING_DOC_ID = "main";
const REWARD_MARKET_FEED_DOC_ID = "main";

const DEFAULT_REWARD_MARKET_MODE = "mock";
const DEFAULT_SETTLEMENT_ASSET = "points";
const DEFAULT_PRICING_MODE = "phase1_fixed_internal";
const DEFAULT_DELIVERY_MODE = "app_vault";
const DEFAULT_FALLBACK_POLICY = "manual_resend";
const DEFAULT_QUOTE_REFRESH_HOURS = 24;
const DEFAULT_DAILY_BAND_PCT = 10;
const DEFAULT_WEEKLY_BAND_PCT = 25;
const DEFAULT_FIXED_INTERNAL_KRW_PER_HBT = 1;
const DEFAULT_DAILY_LIMIT_POINTS = 2000;
const DEFAULT_WEEKLY_LIMIT_POINTS = 5000;
const DEFAULT_MONTHLY_LIMIT_POINTS = 10000;
const DEFAULT_DAILY_LIMIT_HBT = DEFAULT_DAILY_LIMIT_POINTS;
const DEFAULT_WEEKLY_LIMIT_HBT = DEFAULT_WEEKLY_LIMIT_POINTS;
const DEFAULT_MONTHLY_LIMIT_HBT = DEFAULT_MONTHLY_LIMIT_POINTS;
const DEFAULT_MIN_BIZMONEY_KRW = 30000;
const DEFAULT_GIFTISHOW_TIMEOUT_MS = 15000;
const DEFAULT_PHASE1_ENDS_AT = "2026-05-23T00:00:00+09:00";
const DEFAULT_GIFTISHOW_DEV_YN = "N";
const DEFAULT_GIFTISHOW_CATALOG_START = 1;
const DEFAULT_GIFTISHOW_CATALOG_SIZE = 50;
const DEFAULT_GIFTISHOW_BODY_FORMAT = "form";
const GIFTISHOW_REQUIRED_ENV_KEYS = Object.freeze([
    ["baseUrl", "GIFTISHOW_API_BASE_URL"],
    ["customAuthCode", "GIFTISHOW_CUSTOM_AUTH_CODE"],
    ["customAuthToken", "GIFTISHOW_CUSTOM_AUTH_TOKEN"],
    ["callbackNo", "GIFTISHOW_CALLBACK_NO"],
    ["providerUserId", "GIFTISHOW_USER_ID"],
    ["templateId", "GIFTISHOW_TEMPLATE_ID_OR_CARD_ID"],
    ["bannerId", "GIFTISHOW_BANNER_ID"],
]);

const DEFAULT_REWARD_CATALOG = Object.freeze([
    {
        sku: "mega-ice-americano-60d",
        brandName: "메가MGC커피",
        displayName: "(ICE)아메리카노 모바일쿠폰",
        category: "drink",
        faceValueKrw: 2000,
        purchasePriceKrw: 1940,
        pointCost: 2000,
        provider: "giftishow",
        providerGoodsId: "G00002861259",
        providerGoodsAliases: ["G00002321189"],
        healthGuide: "가벼운 보상으로 건강 루틴을 이어가 보기 좋은 첫 교환 상품입니다.",
        productImageUrl: "https://bizimg.giftishow.com/Resource/goods/2024/G00002861259/G00002861259.jpg",
        brandLogoUrl: "/assets/reward-market/mega-mgc-logo.png",
        available: true,
        stockLabel: "60일 발급",
        deliveryMethod: "pin",
        validityDays: 60,
        sortOrder: 10,
    },
    {
        sku: "paikdabang-iced-americano-60d",
        brandName: "빽다방",
        displayName: "아메리카노(ICED) 모바일쿠폰",
        category: "drink",
        faceValueKrw: 2000,
        purchasePriceKrw: 1940,
        pointCost: 2000,
        provider: "giftishow",
        providerGoodsId: "G00001810964",
        providerGoodsAliases: ["G00002871294"],
        healthGuide: "부담 없이 교환해 보며 건강 습관 보상을 체감하기 좋은 소액 음료 상품입니다.",
        productImageUrl: "https://bizimg.giftishow.com/Resource/goods/2024/G00002871294/G00002871294.jpg",
        brandLogoUrl: "/assets/reward-market/paikdabang-logo.png",
        available: true,
        stockLabel: "60일 발급",
        deliveryMethod: "pin",
        validityDays: 60,
        sortOrder: 20,
    },
]);

function normalizeSku(value = "") {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function normalizeProviderGoodsId(value = "") {
    return String(value || "").trim().toUpperCase();
}

function extractGiftishowGoodsCode(value = "") {
    const match = String(value || "").match(/G\d{8,}/i);
    return match ? normalizeProviderGoodsId(match[0]) : "";
}

function resolvePublicRewardProviderGoodsIds(item = {}) {
    const aliases = Array.isArray(item.providerGoodsAliases) ? item.providerGoodsAliases : [];
    const candidates = [
        item.providerGoodsId,
        item.goodsCode,
        item.goodsId,
        item.productCode,
        item.productImageUrl,
        item.imageUrl,
        item.goodsImageUrl,
        item.thumbnailUrl,
        ...aliases,
    ];
    const ids = [];

    for (const candidate of candidates) {
        const direct = normalizeProviderGoodsId(candidate);
        if (/^G\d{8,}$/i.test(direct)) ids.push(direct);
        const extracted = extractGiftishowGoodsCode(candidate);
        if (extracted) ids.push(extracted);
    }

    return [...new Set(ids)];
}

const PUBLIC_REWARD_CATALOG_SKUS = new Set(
    DEFAULT_REWARD_CATALOG.map((item) => normalizeSku(item.sku)).filter(Boolean)
);
const PUBLIC_REWARD_PROVIDER_GOODS_IDS = new Set(
    DEFAULT_REWARD_CATALOG.flatMap((item) => resolvePublicRewardProviderGoodsIds(item))
);

function isPublicRewardCatalogItem(item = {}) {
    const sku = normalizeSku(item.sku || "");
    if (sku && PUBLIC_REWARD_CATALOG_SKUS.has(sku)) return true;

    const provider = String(item.provider || "giftishow").trim().toLowerCase();
    if (provider && provider !== "giftishow") return false;

    return resolvePublicRewardProviderGoodsIds(item)
        .some((goodsId) => PUBLIC_REWARD_PROVIDER_GOODS_IDS.has(goodsId));
}

function filterPublicRewardCatalogItems(items = []) {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => isPublicRewardCatalogItem(item));
}

function parseNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function firstPositiveNumber(...values) {
    for (const value of values) {
        const numeric = parseNumber(value, 0);
        if (numeric > 0) return numeric;
    }
    return 0;
}

function parseBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return fallback;
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
    return fallback;
}

function toPlainDate(value, fallback = "") {
    if (!value) return fallback;
    if (value?.toDate instanceof Function) {
        return toPlainDate(value.toDate(), fallback);
    }
    if (value?.toMillis instanceof Function) {
        return new Date(value.toMillis()).toISOString();
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
    }
    return String(value || fallback);
}

function toTimestampMillis(value) {
    if (!value) return 0;
    if (value?.toMillis instanceof Function) return value.toMillis();
    if (value?.toDate instanceof Function) return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRecipientPhone(rawPhone = "") {
    const digits = String(rawPhone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("82") && digits.length >= 11) {
        return `0${digits.slice(2)}`;
    }
    return digits;
}

function isValidRecipientPhone(rawPhone = "") {
    return /^0\d{9,10}$/.test(normalizeRecipientPhone(rawPhone));
}

function maskRecipientPhone(rawPhone = "") {
    const normalized = normalizeRecipientPhone(rawPhone);
    if (!normalized) return "";
    if (normalized.length <= 7) return normalized;
    return `${normalized.slice(0, 3)}-${"*".repeat(Math.max(normalized.length - 7, 3))}-${normalized.slice(-4)}`;
}

function safeParseJsonObject(raw = "") {
    if (!String(raw || "").trim()) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

function resolveTemplateObject(rawTemplate = "", fallbackTemplate = {}) {
    const parsed = safeParseJsonObject(rawTemplate);
    return parsed && Object.keys(parsed).length > 0
        ? parsed
        : { ...fallbackTemplate };
}

function resolveGiftishowDeliveryCode(deliveryMethod = "") {
    const normalized = String(deliveryMethod || "").trim().toLowerCase();
    if (["image", "barcode", "img"].includes(normalized)) return "I";
    if (["mms", "sms", "message"].includes(normalized)) return "N";
    return "Y";
}

function buildGiftishowGoodsTemplate() {
    return {
        api_code: "0101",
        custom_auth_code: "{{giftishowCustomAuthCode}}",
        custom_auth_token: "{{giftishowCustomAuthToken}}",
        dev_yn: "{{giftishowDevYn}}",
        start: "{{catalogStart}}",
        size: "{{catalogSize}}",
    };
}

function buildGiftishowOrderTemplate() {
    return {
        api_code: "0204",
        custom_auth_code: "{{giftishowCustomAuthCode}}",
        custom_auth_token: "{{giftishowCustomAuthToken}}",
        dev_yn: "{{giftishowDevYn}}",
        goods_code: "{{goodsCode}}",
        mms_msg: "{{giftishowMmsMsg}}",
        mms_title: "{{giftishowMmsTitle}}",
        callback_no: "{{giftishowCallbackNo}}",
        phone_no: "{{recipientPhone}}",
        tr_id: "{{trId}}",
        user_id: "{{giftishowUserId}}",
        gubun: "{{giftishowDeliveryCode}}",
        template_id: "{{giftishowTemplateId}}",
        banner_id: "{{giftishowBannerId}}",
    };
}

function buildGiftishowCouponStatusTemplate() {
    return {
        api_code: "0201",
        custom_auth_code: "{{giftishowCustomAuthCode}}",
        custom_auth_token: "{{giftishowCustomAuthToken}}",
        dev_yn: "{{giftishowDevYn}}",
        tr_id: "{{trId}}",
    };
}

function buildGiftishowResendTemplate() {
    return {
        api_code: "0203",
        custom_auth_code: "{{giftishowCustomAuthCode}}",
        custom_auth_token: "{{giftishowCustomAuthToken}}",
        dev_yn: "{{giftishowDevYn}}",
        tr_id: "{{trId}}",
        sms_flag: "{{giftishowSmsFlag}}",
    };
}

function buildGiftishowBizmoneyTemplate() {
    return {
        api_code: "0301",
        custom_auth_code: "{{giftishowCustomAuthCode}}",
        custom_auth_token: "{{giftishowCustomAuthToken}}",
        dev_yn: "{{giftishowDevYn}}",
        user_id: "{{giftishowUserId}}",
    };
}

function resolveRewardRecipientPhone({
    requestedPhone = "",
    userData = {},
    authPhoneNumber = "",
}) {
    const candidates = [
        requestedPhone,
        userData.rewardRecipientPhone,
        userData.phoneNumber,
        userData.phone,
        authPhoneNumber,
    ];
    for (const candidate of candidates) {
        const normalized = normalizeRecipientPhone(candidate);
        if (isValidRecipientPhone(normalized)) {
            return normalized;
        }
    }
    return "";
}

function normalizePricingMode(value = "") {
    return String(value || DEFAULT_PRICING_MODE).trim().toLowerCase() === "phase2_hybrid_band"
        ? "phase2_hybrid_band"
        : "phase1_fixed_internal";
}

function resolveSettlementAsset(value = "") {
    return String(value || DEFAULT_SETTLEMENT_ASSET).trim().toLowerCase() === "hbt"
        ? "hbt"
        : "points";
}

function normalizeClientRequestId(value = "") {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

function buildRedemptionRequestDocId(uid = "", clientRequestId = "") {
    const normalizedUid = String(uid || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    const normalizedRequestId = normalizeClientRequestId(clientRequestId);
    return `req_${normalizedUid}_${normalizedRequestId}`.slice(0, 140);
}

function getKstDateParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(date)
            .filter((entry) => entry.type !== "literal")
            .map((entry) => [entry.type, entry.value])
    );
    return {
        year: parseNumber(parts.year, 1970),
        month: parseNumber(parts.month, 1),
        day: parseNumber(parts.day, 1),
        hour: parseNumber(parts.hour, 0),
        minute: parseNumber(parts.minute, 0),
        second: parseNumber(parts.second, 0),
        weekday: String(parts.weekday || "Mon"),
    };
}

function makeKstDate(year, month, day, hour = 0, minute = 0, second = 0) {
    return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
}

function getKstDayKey(date = new Date()) {
    const parts = getKstDateParts(date);
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getKstWeekKey(date = new Date()) {
    const start = getStartOfKstWeek(date);
    return getKstDayKey(start);
}

function getKstMonthKey(date = new Date()) {
    const parts = getKstDateParts(date);
    return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function getStartOfKstDay(date = new Date()) {
    const parts = getKstDateParts(date);
    return makeKstDate(parts.year, parts.month, parts.day, 0, 0, 0);
}

function getStartOfKstMonth(date = new Date()) {
    const parts = getKstDateParts(date);
    return makeKstDate(parts.year, parts.month, 1, 0, 0, 0);
}

function getStartOfKstWeek(date = new Date()) {
    const parts = getKstDateParts(date);
    const weekdayOrder = {
        Mon: 0,
        Tue: 1,
        Wed: 2,
        Thu: 3,
        Fri: 4,
        Sat: 5,
        Sun: 6,
    };
    const offset = weekdayOrder[parts.weekday] ?? 0;
    const currentDayStart = makeKstDate(parts.year, parts.month, parts.day, 0, 0, 0);
    return new Date(currentDayStart.getTime() - (offset * 24 * 60 * 60 * 1000));
}

function getNextKstMidnight(date = new Date()) {
    const start = getStartOfKstDay(date);
    return new Date(start.getTime() + (24 * 60 * 60 * 1000));
}

function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) return min;
    if (Number.isFinite(min)) value = Math.max(value, min);
    if (Number.isFinite(max)) value = Math.min(value, max);
    return value;
}

function roundUpHbt(value) {
    const numeric = Math.ceil(parseNumber(value, 0));
    return Math.max(numeric, REWARD_MARKET_MIN_REDEMPTION_HBT);
}

function resolveRewardMarketPointCost(item = {}, publishedPricing = {}, config = {}) {
    if ((config.settlementAsset || DEFAULT_SETTLEMENT_ASSET) === "hbt") {
        const krwPerHbt = Math.max(parseNumber(publishedPricing.finalKrwPerHbt, 0), 0);
        if (publishedPricing.quoteState === "ready" && krwPerHbt > 0) {
            return roundUpHbt(item.faceValueKrw / krwPerHbt);
        }
    }
    const configuredPointCost = Math.max(parseNumber(item.pointCost, 0), parseNumber(item.hbtCost, 0));
    return Math.max(
        configuredPointCost || parseNumber(item.faceValueKrw, 0),
        config.minRedeemPoints || REWARD_MARKET_MIN_REDEMPTION_POINTS
    );
}

function getStoredRewardPointCost(data = {}) {
    return Math.max(
        parseNumber(data.pointCost, 0),
        parseNumber(data.hbtCost, 0)
    );
}

function computeReserveBreakdown(product = {}) {
    const faceValueKrw = Math.max(0, parseNumber(product.faceValueKrw, 0));
    const purchasePriceKrw = Math.max(
        0,
        parseNumber(product.purchasePriceKrw, Math.round(faceValueKrw * 0.96))
    );
    const marginKrw = Math.max(faceValueKrw - purchasePriceKrw, 0);
    const gasBudgetKrw = Math.round(marginKrw * 0.6);
    const operationsBudgetKrw = Math.max(marginKrw - gasBudgetKrw, 0);

    return {
        faceValueKrw,
        purchasePriceKrw,
        marginKrw,
        gasBudgetKrw,
        operationsBudgetKrw,
    };
}

function resolveRewardAssetUrl(...candidates) {
    for (const candidate of candidates) {
        const value = String(candidate || "").trim();
        if (value) return value;
    }
    return "";
}

function resolveRewardValidityDays(item = {}, fallbackDays = 30) {
    const directValue = Math.max(
        parseNumber(item.validityDays, 0),
        parseNumber(item.validityPeriodDays, 0),
        parseNumber(item.expireDays, 0)
    );
    if (directValue > 0) return directValue;

    const labels = [
        item.stockLabel,
        item.validityLabel,
        item.validityPeriod,
        item.displayName,
    ];
    for (const label of labels) {
        const match = String(label || "").match(/(\d+)\s*일/);
        if (match) {
            const parsedDays = parseNumber(match[1], 0);
            if (parsedDays > 0) return parsedDays;
        }
    }

    return Math.max(parseNumber(fallbackDays, 30), 1);
}

function normalizeRewardCatalogItem(item = {}, fallbackSku = "") {
    const sku = normalizeSku(item.sku || item.providerGoodsId || fallbackSku || crypto.randomUUID());
    const reserve = computeReserveBreakdown(item);
    const pointCost = Math.max(
        parseNumber(item.pointCost, 0),
        parseNumber(item.hbtCost, 0)
    );

    return {
        sku,
        brandName: String(item.brandName || item.brand || "해빛 마켓").trim(),
        displayName: String(item.displayName || item.name || sku).trim(),
        category: String(item.category || "general").trim(),
        faceValueKrw: reserve.faceValueKrw || REWARD_MARKET_MIN_REDEMPTION_HBT,
        purchasePriceKrw: reserve.purchasePriceKrw,
        pointCost,
        hbtCost: pointCost,
        provider: String(item.provider || "giftishow").trim(),
        providerGoodsId: String(item.providerGoodsId || item.goodsId || item.id || sku).trim(),
        providerGoodsAliases: Array.isArray(item.providerGoodsAliases) ? item.providerGoodsAliases : [],
        healthGuide: String(
            item.healthGuide
            || item.healthCopy
            || "건강한 선택으로 보상을 생활 속 루틴과 연결해 보세요."
        ).trim(),
        productImageUrl: resolveRewardAssetUrl(
            item.productImageUrl,
            item.imageUrl,
            item.goodsImageUrl,
            item.thumbnailUrl
        ),
        validityDays: resolveRewardValidityDays(item),
        brandLogoUrl: resolveRewardAssetUrl(
            item.brandLogoUrl,
            item.logoUrl,
            item.brandImageUrl
        ),
        available: item.available !== false,
        stockLabel: String(item.stockLabel || "재고 확인").trim(),
        deliveryMethod: String(item.deliveryMethod || "pin").trim(),
        sortOrder: parseNumber(item.sortOrder, 999),
    };
}

function buildFallbackCatalog() {
    return DEFAULT_REWARD_CATALOG.map((item, index) =>
        normalizeRewardCatalogItem(item, item.sku || `reward-${index + 1}`));
}

function buildSeededRewardVisualLookup(items = []) {
    const bySku = new Map();
    const byProviderGoodsId = new Map();

    for (const item of items) {
        if (item?.sku) bySku.set(item.sku, item);
        if (item?.providerGoodsId) byProviderGoodsId.set(item.providerGoodsId, item);
        for (const goodsId of resolvePublicRewardProviderGoodsIds(item)) {
            byProviderGoodsId.set(goodsId, item);
        }
    }

    return { bySku, byProviderGoodsId };
}

function applySeededRewardVisuals(item = {}, lookup = {}) {
    const seeded = lookup.bySku?.get(item.sku) || lookup.byProviderGoodsId?.get(item.providerGoodsId);
    if (!seeded) return item;

    return {
        ...item,
        healthGuide: item.healthGuide || seeded.healthGuide || "",
        productImageUrl: item.productImageUrl || seeded.productImageUrl || "",
        validityDays: parseNumber(item.validityDays, 0) || parseNumber(seeded.validityDays, 0) || 30,
        brandLogoUrl: item.brandLogoUrl || seeded.brandLogoUrl || "",
    };
}

function resolveCollectionItems(payload = null) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.goods)) return payload.goods;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
    if (payload.data && Array.isArray(payload.data.goods)) return payload.data.goods;
    if (payload.data && Array.isArray(payload.data.goodsList)) return payload.data.goodsList;
    if (payload.result && Array.isArray(payload.result.items)) return payload.result.items;
    if (payload.result && Array.isArray(payload.result.goods)) return payload.result.goods;
    if (payload.result && Array.isArray(payload.result.goodsList)) return payload.result.goodsList;
    return [];
}

function mapGiftishowGoodsItem(raw = {}, index = 0) {
    const brandName = String(raw.brandName || raw.brandNm || raw.brand || "").trim();
    const displayName = String(raw.goodsName || raw.goodsNm || raw.name || raw.productName || "").trim();
    const providerGoodsId = String(
        raw.goodsCode
        || raw.goodsCd
        || raw.goods_code
        || raw.goodsId
        || raw.productCode
        || raw.id
        || raw.goodsNo
        || ""
    ).trim();
    const faceValueKrw = firstPositiveNumber(
        raw.faceValue,
        raw.salePrice,
        raw.realPrice,
        raw.saleDiscountPrice,
        raw.sellPrice,
        raw.sellPriceAmt,
        raw.cnsmPriceAmt,
        raw.goodsPrice,
        raw.price
    );
    const purchasePriceKrw = firstPositiveNumber(
        raw.discountPrice,
        raw.realPrice,
        raw.saleDiscountPrice,
        raw.buyPrice,
        raw.purchasePrice,
        raw.supplyPrice,
        raw.sellPriceAmt,
        raw.salePrice
    );
    const stockValues = [raw.stockQty, raw.stockQuantity, raw.stock]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    const stockQuantity = stockValues.length > 0 ? Math.max(...stockValues) : null;
    const soldOutFlag = String(raw.soldOut || raw.soldout || "").trim().toLowerCase();
    const stockYn = String(raw.stockYn || "").trim().toUpperCase();
    const saleYn = String(raw.saleYn || "").trim().toUpperCase();
    const goodsStateCd = String(raw.goodsStateCd || raw.goodsState || raw.status || "").trim().toUpperCase();
    const available = goodsStateCd
        ? goodsStateCd === "SALE"
        : saleYn
            ? ["Y", "YES", "TRUE", "1", "SALE"].includes(saleYn)
            : soldOutFlag
                ? !["y", "yes", "soldout", "true", "1"].includes(soldOutFlag)
                : stockYn
                    ? !["N", "NO", "FALSE", "0", "SOLDOUT"].includes(stockYn)
                    : stockQuantity !== 0;
    const validityDays = Math.max(
        parseNumber(raw.limitDay, 0),
        parseNumber(raw.limitday, 0),
        String(raw.validPrdTypeCd || "").trim() === "01" ? parseNumber(raw.validPrdDay, 0) : 0
    );

    return normalizeRewardCatalogItem({
        sku: providerGoodsId || `${brandName}-${displayName}-${index + 1}`,
        brandName: brandName || "기프티쇼",
        displayName: displayName || `기프티쇼 상품 ${index + 1}`,
        category: String(raw.category || raw.goodsTypeDtlNm || raw.category1Seq || raw.lclsName || "general").trim(),
        faceValueKrw: faceValueKrw || REWARD_MARKET_MIN_REDEMPTION_HBT,
        purchasePriceKrw: purchasePriceKrw || faceValueKrw || REWARD_MARKET_MIN_REDEMPTION_HBT,
        provider: "giftishow",
        providerGoodsId,
        healthGuide: String(raw.healthGuide || raw.content || raw.contentAddDesc || "").trim(),
        productImageUrl: resolveRewardAssetUrl(
            raw.productImageUrl,
            raw.imageUrl,
            raw.goodsImgB,
            raw.goodsImgM,
            raw.goodsImgS,
            raw.mmsGoodsImg,
            raw.goodsImageUrl,
            raw.thumbnailUrl
        ),
        brandLogoUrl: resolveRewardAssetUrl(
            raw.brandLogoUrl,
            raw.logoUrl,
            raw.brandIconImg,
            raw.brandIConImg,
            raw.brandImgUrl,
            raw.brandImageUrl
        ),
        available,
        stockLabel: stockQuantity > 0 ? `재고 ${stockQuantity}` : (available ? "SALE" : "판매중지"),
        deliveryMethod: String(raw.deliveryMethod || raw.issueMethod || "pin").trim(),
        validityDays,
        sortOrder: index + 1,
    });
}

function replaceTemplateString(input = "", context = {}) {
    return String(input || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const value = context[key];
        if (value === null || value === undefined) return "";
        return String(value);
    });
}

function applyTemplateToValue(template, context = {}) {
    if (typeof template === "string") {
        return replaceTemplateString(template, context);
    }
    if (Array.isArray(template)) {
        return template.map((item) => applyTemplateToValue(item, context));
    }
    if (template && typeof template === "object") {
        return Object.fromEntries(
            Object.entries(template).map(([key, value]) => [
                key,
                applyTemplateToValue(value, context),
            ])
        );
    }
    return template;
}

function buildRequestPayload(templateObject = {}, fallbackPayload = {}, context = {}) {
    const base = templateObject && Object.keys(templateObject).length > 0
        ? applyTemplateToValue(templateObject, context)
        : { ...fallbackPayload };

    return Object.fromEntries(
        Object.entries(base).filter(([, value]) => value !== undefined && value !== null && value !== "")
    );
}

function unwrapNestedResult(payload = {}) {
    const layers = [payload, payload?.data, payload?.result, payload?.result?.result];
    return layers.reduce((accumulator, current) => ({
        ...accumulator,
        ...(current && typeof current === "object" ? current : {}),
    }), {});
}

function getRewardMarketConfig(env = process.env) {
    const configuredMode = String(env.REWARD_MARKET_MODE || DEFAULT_REWARD_MARKET_MODE).trim().toLowerCase();
    const mode = configuredMode === "live" ? "live" : "mock";
    const pricingMode = normalizePricingMode(env.REWARD_MARKET_PRICING_MODE || env.REWARD_MARKET_PHASE_MODE);
    const settlementAsset = resolveSettlementAsset(env.REWARD_MARKET_SETTLEMENT_ASSET);
    const minRedeemPoints = Math.max(
        parseNumber(env.REWARD_MARKET_MIN_REDEEM_POINTS, env.REWARD_MARKET_MIN_REDEEM_HBT),
        REWARD_MARKET_MIN_REDEMPTION_POINTS
    );
    const dailyLimitPoints = Math.max(
        parseNumber(
            env.REWARD_MARKET_DAILY_LIMIT_POINTS,
            env.REWARD_MARKET_DAILY_LIMIT_HBT || DEFAULT_DAILY_LIMIT_POINTS
        ),
        minRedeemPoints
    );
    const weeklyLimitPoints = Math.max(
        parseNumber(
            env.REWARD_MARKET_WEEKLY_LIMIT_POINTS,
            env.REWARD_MARKET_WEEKLY_LIMIT_HBT || DEFAULT_WEEKLY_LIMIT_POINTS
        ),
        minRedeemPoints
    );
    const monthlyLimitPoints = Math.max(
        parseNumber(
            env.REWARD_MARKET_MONTHLY_LIMIT_POINTS,
            env.REWARD_MARKET_MONTHLY_LIMIT_HBT || DEFAULT_MONTHLY_LIMIT_POINTS
        ),
        minRedeemPoints
    );

    const config = {
        mode,
        settlementAsset,
        pricingMode,
        minRedeemPoints,
        minRedeemHbt: minRedeemPoints,
        reserveDocId: String(env.REWARD_MARKET_RESERVE_DOC_ID || REWARD_RESERVE_DOC_ID).trim() || REWARD_RESERVE_DOC_ID,
        pricingDocId: String(env.REWARD_MARKET_PRICING_DOC_ID || REWARD_PRICING_DOC_ID).trim() || REWARD_PRICING_DOC_ID,
        feedDocId: String(env.REWARD_MARKET_FEED_DOC_ID || REWARD_MARKET_FEED_DOC_ID).trim() || REWARD_MARKET_FEED_DOC_ID,
        deliveryMode: String(env.REWARD_MARKET_DELIVERY_MODE || DEFAULT_DELIVERY_MODE).trim() || DEFAULT_DELIVERY_MODE,
        fallbackPolicy: String(env.REWARD_MARKET_FALLBACK_POLICY || DEFAULT_FALLBACK_POLICY).trim() || DEFAULT_FALLBACK_POLICY,
        dailyBandPct: clampNumber(parseNumber(env.REWARD_MARKET_DAILY_BAND_PCT, DEFAULT_DAILY_BAND_PCT), 0, 100),
        weeklyBandPct: clampNumber(parseNumber(env.REWARD_MARKET_WEEKLY_BAND_PCT, DEFAULT_WEEKLY_BAND_PCT), 0, 100),
        fixedInternalKrwPerHbt: Math.max(
            parseNumber(env.REWARD_MARKET_FIXED_INTERNAL_KRW_PER_HBT, DEFAULT_FIXED_INTERNAL_KRW_PER_HBT),
            0.000001
        ),
        quoteRefreshHours: Math.max(parseNumber(env.REWARD_MARKET_QUOTE_REFRESH_HOURS, DEFAULT_QUOTE_REFRESH_HOURS), 1),
        dailyLimitPoints,
        weeklyLimitPoints,
        monthlyLimitPoints,
        dailyLimitHbt: dailyLimitPoints,
        weeklyLimitHbt: weeklyLimitPoints,
        monthlyLimitHbt: monthlyLimitPoints,
        minBizmoneyKrw: Math.max(parseNumber(env.REWARD_MARKET_MIN_BIZMONEY_KRW, DEFAULT_MIN_BIZMONEY_KRW), 0),
        phase1EndsAt: String(env.REWARD_MARKET_PHASE1_ENDS_AT || DEFAULT_PHASE1_ENDS_AT).trim() || DEFAULT_PHASE1_ENDS_AT,

        baseUrl: String(env.GIFTISHOW_API_BASE_URL || "").trim().replace(/\/+$/, ""),
        customAuthCode: String(env.GIFTISHOW_CUSTOM_AUTH_CODE || "").trim(),
        customAuthToken: String(env.GIFTISHOW_CUSTOM_AUTH_TOKEN || "").trim(),
        devYn: String(env.GIFTISHOW_DEV_YN || DEFAULT_GIFTISHOW_DEV_YN).trim().toUpperCase() || DEFAULT_GIFTISHOW_DEV_YN,
        callbackNo: String(env.GIFTISHOW_CALLBACK_NO || "").trim(),
        providerUserId: String(env.GIFTISHOW_USER_ID || env.GIFTISHOW_USER || "").trim(),
        templateId: String(env.GIFTISHOW_TEMPLATE_ID || env.GIFTISHOW_CARD_ID || "").trim(),
        bannerId: String(env.GIFTISHOW_BANNER_ID || "").trim(),
        defaultMmsTitle: String(env.GIFTISHOW_SEND_TITLE || "해빛 마켓 쿠폰").trim() || "해빛 마켓 쿠폰",
        defaultMmsMessage: String(env.GIFTISHOW_SEND_MESSAGE || "해빛 마켓에서 발급된 쿠폰입니다. 앱 보관함에서 확인해 주세요.").trim()
            || "해빛 마켓에서 발급된 쿠폰입니다. 앱 보관함에서 확인해 주세요.",
        catalogStart: Math.max(parseNumber(env.GIFTISHOW_CATALOG_START, DEFAULT_GIFTISHOW_CATALOG_START), 1),
        catalogSize: Math.max(parseNumber(env.GIFTISHOW_CATALOG_SIZE, DEFAULT_GIFTISHOW_CATALOG_SIZE), 1),
        goodsPath: String(env.GIFTISHOW_GOODS_PATH || "/goods").trim() || "/goods",
        goodsMethod: String(env.GIFTISHOW_GOODS_METHOD || "GET").trim().toUpperCase() || "GET",
        goodsBodyTemplate: resolveTemplateObject(
            env.GIFTISHOW_GOODS_BODY_JSON || "",
            buildGiftishowGoodsTemplate()
        ),
        orderPath: String(env.GIFTISHOW_ORDER_PATH || "/order").trim() || "/order",
        orderMethod: String(env.GIFTISHOW_ORDER_METHOD || "POST").trim().toUpperCase() || "POST",
        orderBodyTemplate: resolveTemplateObject(
            env.GIFTISHOW_ORDER_BODY_JSON || "",
            buildGiftishowOrderTemplate()
        ),
        couponStatusPath: String(env.GIFTISHOW_COUPON_STATUS_PATH || "/coupons").trim() || "/coupons",
        couponStatusMethod: String(env.GIFTISHOW_COUPON_STATUS_METHOD || "POST").trim().toUpperCase() || "POST",
        couponStatusBodyTemplate: resolveTemplateObject(
            env.GIFTISHOW_COUPON_STATUS_BODY_JSON || "",
            buildGiftishowCouponStatusTemplate()
        ),
        resendPath: String(env.GIFTISHOW_RESEND_PATH || "/resend").trim() || "/resend",
        resendMethod: String(env.GIFTISHOW_RESEND_METHOD || "POST").trim().toUpperCase() || "POST",
        resendBodyTemplate: resolveTemplateObject(
            env.GIFTISHOW_RESEND_BODY_JSON || "",
            buildGiftishowResendTemplate()
        ),
        bizmoneyPath: String(env.GIFTISHOW_BIZMONEY_PATH || "/bizmoney").trim() || "/bizmoney",
        bizmoneyMethod: String(env.GIFTISHOW_BIZMONEY_METHOD || "POST").trim().toUpperCase() || "POST",
        bizmoneyBodyTemplate: resolveTemplateObject(
            env.GIFTISHOW_BIZMONEY_BODY_JSON || "",
            buildGiftishowBizmoneyTemplate()
        ),
        headers: safeParseJsonObject(env.GIFTISHOW_API_HEADERS_JSON || ""),
        bodyFormat: String(env.GIFTISHOW_API_BODY_FORMAT || DEFAULT_GIFTISHOW_BODY_FORMAT).trim().toLowerCase()
            || DEFAULT_GIFTISHOW_BODY_FORMAT,
        catalogLiveEnabled: String(env.GIFTISHOW_CATALOG_LIVE || "true").trim().toLowerCase() !== "false",
        timeoutMs: Math.max(parseNumber(env.GIFTISHOW_API_TIMEOUT_MS, DEFAULT_GIFTISHOW_TIMEOUT_MS), 1000),

        feedDocPath: String(env.REWARD_MARKET_FEED_DOC_PATH || "").trim(),
        pricingDocPath: String(env.REWARD_MARKET_PRICING_DOC_PATH || "").trim(),
        hbtUsdtTwap7d: parseNumber(env.REWARD_MARKET_HBT_USDT_TWAP_7D, 0),
        usdtKrw: parseNumber(env.REWARD_MARKET_USDT_KRW, 0),
        feedSource: String(env.REWARD_MARKET_FEED_SOURCE || "firestore").trim() || "firestore",
    };

    const missingProviderConfig = GIFTISHOW_REQUIRED_ENV_KEYS
        .filter(([configKey]) => !String(config[configKey] || "").trim())
        .map(([, envKey]) => envKey);
    const providerReady = config.mode !== "live" || missingProviderConfig.length === 0;

    return {
        ...config,
        providerReady,
        requiresRecipientPhone: config.mode === "live",
        manualResendAvailable: config.fallbackPolicy === "manual_resend",
        missingProviderConfig,
        providerReadyMessage: providerReady
            ? ""
            : `Giftishow 연동 설정이 비어 있어요: ${missingProviderConfig.join(", ")}`,
    };
}

const buildRewardMarketConfig = getRewardMarketConfig;

function buildGiftishowHttpBody(body, bodyFormat = DEFAULT_GIFTISHOW_BODY_FORMAT) {
    if (!body || typeof body !== "object") return undefined;
    const normalizedFormat = String(bodyFormat || DEFAULT_GIFTISHOW_BODY_FORMAT).trim().toLowerCase();
    if (normalizedFormat === "json") {
        return JSON.stringify(body);
    }

    const params = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        params.set(key, String(value));
    });
    return params.toString();
}

function resolveGiftishowContentType(bodyFormat = DEFAULT_GIFTISHOW_BODY_FORMAT) {
    return String(bodyFormat || DEFAULT_GIFTISHOW_BODY_FORMAT).trim().toLowerCase() === "json"
        ? "application/json"
        : "application/x-www-form-urlencoded; charset=UTF-8";
}

function buildRewardReserveSummary(data = {}) {
    return {
        totalMarginKrw: Math.max(0, parseNumber(data.totalMarginKrw, 0)),
        gasBudgetKrw: Math.max(0, parseNumber(data.gasBudgetKrw, 0)),
        operationsBudgetKrw: Math.max(0, parseNumber(data.operationsBudgetKrw, 0)),
        issuedCount: Math.max(0, parseNumber(data.issuedCount, 0)),
        lastBizmoneyBalanceKrw: Math.max(0, parseNumber(data.lastBizmoneyBalanceKrw, 0)),
        bizmoneyCheckedAt: toPlainDate(data.bizmoneyCheckedAt, ""),
        bizmoneyStatus: String(data.bizmoneyStatus || "").trim(),
        updatedAt: toPlainDate(data.updatedAt, ""),
    };
}

async function callGiftishowApi(config, endpointPath, options = {}) {
    const method = String(options.method || "GET").trim().toUpperCase() || "GET";
    const query = options.query && typeof options.query === "object" ? options.query : {};
    const urlObject = new URL(endpointPath, `${config.baseUrl}/`);
    Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        urlObject.searchParams.set(key, String(value));
    });
    const url = urlObject.toString();
    const bodyFormat = String(options.bodyFormat || config.bodyFormat || DEFAULT_GIFTISHOW_BODY_FORMAT)
        .trim()
        .toLowerCase()
        || DEFAULT_GIFTISHOW_BODY_FORMAT;
    const headers = {
        "Content-Type": resolveGiftishowContentType(bodyFormat),
        ...config.headers,
        ...(options.headers || {}),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("giftishow_timeout"), options.timeoutMs || config.timeoutMs);

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: ["GET", "HEAD"].includes(method) || !options.body
                ? undefined
                : buildGiftishowHttpBody(options.body, bodyFormat),
            signal: controller.signal,
        });

        const text = await response.text();
        let payload = null;
        try {
            payload = text ? JSON.parse(text) : null;
        } catch (_) {
            payload = { raw: text };
        }

        if (!response.ok) {
            const message = payload?.message || payload?.error || `giftishow_http_${response.status}`;
            const error = new Error(message);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    } catch (error) {
        if (error?.name === "AbortError" || String(error?.message || "").includes("giftishow_timeout")) {
            const timeoutError = new Error("giftishow_timeout");
            timeoutError.code = "giftishow_timeout";
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function loadGiftishowCatalog(config) {
    if (config.mode !== "live" || !config.baseUrl || !config.catalogLiveEnabled) return [];

    const requestPayload = buildRequestPayload(config.goodsBodyTemplate, {}, {
        giftishowCustomAuthCode: config.customAuthCode,
        giftishowCustomAuthToken: config.customAuthToken,
        giftishowDevYn: config.devYn,
        catalogStart: config.catalogStart,
        catalogSize: config.catalogSize,
    });
    const payload = await callGiftishowApi(config, config.goodsPath, {
        method: config.goodsMethod,
        query: config.goodsMethod === "GET" ? requestPayload : undefined,
        body: config.goodsMethod === "GET" ? undefined : requestPayload,
    });

    return resolveCollectionItems(payload)
        .map((item, index) => mapGiftishowGoodsItem(item, index))
        .filter((item) => !!item.sku)
        .filter((item) => isPublicRewardCatalogItem(item));
}

async function loadRewardCatalog({ db, config }) {
    const seededItems = buildFallbackCatalog();
    const seededLookup = buildSeededRewardVisualLookup(seededItems);

    const liveItems = await loadGiftishowCatalog(config).catch(() => []);
    if (liveItems.length > 0) {
        return liveItems
            .map((item) => applySeededRewardVisuals(item, seededLookup))
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }

    const catalogSnapshot = await db.collection("reward_catalog").get();
    if (catalogSnapshot.empty) {
        return seededItems;
    }

    const catalogItems = catalogSnapshot.docs
        .map((docSnap) => normalizeRewardCatalogItem(docSnap.data() || {}, docSnap.id))
        .filter((item) => isPublicRewardCatalogItem(item))
        .map((item) => applySeededRewardVisuals(item, seededLookup))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    return catalogItems.length > 0 ? catalogItems : seededItems;
}

function normalizeFeedData(data = {}, config = {}) {
    return {
        hbtUsdtTwap7d: Math.max(
            parseNumber(data.hbtUsdtTwap7d, 0),
            parseNumber(data.twapHbtUsdt7d, 0),
            parseNumber(data.hbtUsdt, 0),
            config.hbtUsdtTwap7d || 0
        ),
        usdtKrw: Math.max(
            parseNumber(data.usdtKrw, 0),
            parseNumber(data.krwPerUsdt, 0),
            config.usdtKrw || 0
        ),
        liquidityReady: data.liquidityReady !== false && !parseBoolean(data.liquidityBlocked, false),
        source: String(data.source || config.feedSource || "firestore").trim(),
        asOf: toPlainDate(data.asOf || data.updatedAt || "", ""),
        poolAddress: String(data.poolAddress || "").trim(),
    };
}

function resolveFeedDocRef(db, config) {
    if (config.feedDocPath) {
        return db.doc(config.feedDocPath);
    }
    return db.collection("reward_market_feeds").doc(config.feedDocId);
}

function resolvePricingDocRef(db, config) {
    if (config.pricingDocPath) {
        return db.doc(config.pricingDocPath);
    }
    return db.collection("reward_market_pricing").doc(config.pricingDocId);
}

async function loadRewardMarketFeed({ db, config }) {
    const fallback = normalizeFeedData({}, config);

    try {
        const feedSnap = await resolveFeedDocRef(db, config).get();
        if (!feedSnap.exists) return fallback;
        return normalizeFeedData(feedSnap.data() || {}, config);
    } catch (_) {
        return fallback;
    }
}

function normalizePublishedPricing(data = {}, config = {}) {
    return {
        pricingMode: normalizePricingMode(data.pricingMode || config.pricingMode),
        quoteVersion: String(data.quoteVersion || "").trim(),
        quoteSource: String(data.quoteSource || "").trim(),
        quoteState: String(data.quoteState || "ready").trim(),
        quotedAt: toPlainDate(data.quotedAt, ""),
        nextRefreshAt: toPlainDate(data.nextRefreshAt, ""),
        dayKey: String(data.dayKey || "").trim(),
        weekKey: String(data.weekKey || "").trim(),
        dailyBandPct: clampNumber(parseNumber(data.dailyBandPct, config.dailyBandPct || DEFAULT_DAILY_BAND_PCT), 0, 100),
        weeklyBandPct: clampNumber(parseNumber(data.weeklyBandPct, config.weeklyBandPct || DEFAULT_WEEKLY_BAND_PCT), 0, 100),
        rawKrwPerHbt: Math.max(parseNumber(data.rawKrwPerHbt, 0), 0),
        finalKrwPerHbt: Math.max(parseNumber(data.finalKrwPerHbt, 0), 0),
        lastQuotedKrwPerHbt: Math.max(parseNumber(data.lastQuotedKrwPerHbt, 0), 0),
        weeklyAnchorKrwPerHbt: Math.max(parseNumber(data.weeklyAnchorKrwPerHbt, 0), 0),
        hbtUsdtTwap7d: Math.max(parseNumber(data.hbtUsdtTwap7d, 0), 0),
        usdtKrw: Math.max(parseNumber(data.usdtKrw, 0), 0),
        feedSource: String(data.feedSource || "").trim(),
        liquidityReady: data.liquidityReady !== false,
        message: String(data.message || "").trim(),
    };
}

function computeRawKrwPerHbt({ config, feed }) {
    if (config.pricingMode === "phase1_fixed_internal") {
        return config.fixedInternalKrwPerHbt;
    }
    const twap = Math.max(parseNumber(feed?.hbtUsdtTwap7d, 0), 0);
    const usdtKrw = Math.max(parseNumber(feed?.usdtKrw, 0), 0);
    if (!(twap > 0) || !(usdtKrw > 0)) return 0;
    return twap * usdtKrw;
}

function isPricingRefreshRequired(published = {}, config = {}, now = new Date()) {
    const quotedAtMs = toTimestampMillis(published.quotedAt);
    if (!quotedAtMs) return true;
    if (published.pricingMode !== config.pricingMode) return true;
    if (published.dayKey !== getKstDayKey(now)) return true;
    return (now.getTime() - quotedAtMs) >= (config.quoteRefreshHours * 60 * 60 * 1000);
}

function buildPublishedPricing({ config, existing = {}, feed = {}, now = new Date() }) {
    const dayKey = getKstDayKey(now);
    const weekKey = getKstWeekKey(now);
    const quoteSource = config.pricingMode === "phase1_fixed_internal"
        ? "fixed_internal_face_value"
        : "twap_7d_usdt_krw_band";
    const rawKrwPerHbt = computeRawKrwPerHbt({ config, feed });

    if (config.pricingMode === "phase2_hybrid_band") {
        if (!(rawKrwPerHbt > 0) || feed?.liquidityReady === false) {
            return normalizePublishedPricing({
                pricingMode: config.pricingMode,
                quoteVersion: existing.quoteVersion || `${config.pricingMode}:${dayKey}:stale`,
                quoteSource,
                quoteState: "unavailable",
                quotedAt: now,
                nextRefreshAt: getNextKstMidnight(now),
                dayKey,
                weekKey,
                dailyBandPct: config.dailyBandPct,
                weeklyBandPct: config.weeklyBandPct,
                rawKrwPerHbt,
                finalKrwPerHbt: Math.max(parseNumber(existing.finalKrwPerHbt, 0), 0),
                lastQuotedKrwPerHbt: Math.max(parseNumber(existing.finalKrwPerHbt, 0), 0),
                weeklyAnchorKrwPerHbt: Math.max(parseNumber(existing.weeklyAnchorKrwPerHbt, 0), 0),
                hbtUsdtTwap7d: feed?.hbtUsdtTwap7d || 0,
                usdtKrw: feed?.usdtKrw || 0,
                feedSource: feed?.source || "",
                liquidityReady: feed?.liquidityReady !== false,
                message: "twap_or_fx_feed_unavailable",
            }, config);
        }

        const lastQuoted = Math.max(parseNumber(existing.finalKrwPerHbt, rawKrwPerHbt), rawKrwPerHbt);
        const sameWeek = existing.weekKey === weekKey && parseNumber(existing.weeklyAnchorKrwPerHbt, 0) > 0;
        const weeklyAnchor = sameWeek
            ? parseNumber(existing.weeklyAnchorKrwPerHbt, rawKrwPerHbt)
            : lastQuoted;
        const dailyMin = lastQuoted * (1 - (config.dailyBandPct / 100));
        const dailyMax = lastQuoted * (1 + (config.dailyBandPct / 100));
        const weeklyMin = weeklyAnchor * (1 - (config.weeklyBandPct / 100));
        const weeklyMax = weeklyAnchor * (1 + (config.weeklyBandPct / 100));
        const finalKrwPerHbt = clampNumber(rawKrwPerHbt, Math.max(dailyMin, weeklyMin), Math.min(dailyMax, weeklyMax));

        return normalizePublishedPricing({
            pricingMode: config.pricingMode,
            quoteVersion: `${config.pricingMode}:${dayKey}:${Date.now()}`,
            quoteSource,
            quoteState: "ready",
            quotedAt: now,
            nextRefreshAt: getNextKstMidnight(now),
            dayKey,
            weekKey,
            dailyBandPct: config.dailyBandPct,
            weeklyBandPct: config.weeklyBandPct,
            rawKrwPerHbt,
            finalKrwPerHbt,
            lastQuotedKrwPerHbt: finalKrwPerHbt,
            weeklyAnchorKrwPerHbt: weeklyAnchor,
            hbtUsdtTwap7d: feed?.hbtUsdtTwap7d || 0,
            usdtKrw: feed?.usdtKrw || 0,
            feedSource: feed?.source || "",
            liquidityReady: feed?.liquidityReady !== false,
            message: "",
        }, config);
    }

    return normalizePublishedPricing({
        pricingMode: config.pricingMode,
        quoteVersion: `${config.pricingMode}:${dayKey}:fixed`,
        quoteSource,
        quoteState: "ready",
        quotedAt: now,
        nextRefreshAt: getNextKstMidnight(now),
        dayKey,
        weekKey,
        dailyBandPct: config.dailyBandPct,
        weeklyBandPct: config.weeklyBandPct,
        rawKrwPerHbt,
        finalKrwPerHbt: rawKrwPerHbt,
        lastQuotedKrwPerHbt: rawKrwPerHbt,
        weeklyAnchorKrwPerHbt: rawKrwPerHbt,
        hbtUsdtTwap7d: feed?.hbtUsdtTwap7d || 0,
        usdtKrw: feed?.usdtKrw || 0,
        feedSource: config.feedSource || "fixed",
        liquidityReady: true,
        message: "",
    }, config);
}

async function ensurePublishedPricing({ db, config, now = new Date() }) {
    const pricingRef = resolvePricingDocRef(db, config);
    const existingSnap = await pricingRef.get();
    const existing = existingSnap.exists
        ? normalizePublishedPricing(existingSnap.data() || {}, config)
        : normalizePublishedPricing({}, config);

    if (!isPricingRefreshRequired(existing, config, now)) {
        return existing;
    }

    const feed = await loadRewardMarketFeed({ db, config });
    const published = buildPublishedPricing({ config, existing, feed, now });

    await pricingRef.set({
        ...published,
        quotedAt: now,
        nextRefreshAt: new Date(toTimestampMillis(published.nextRefreshAt) || getNextKstMidnight(now).getTime()),
        updatedAt: now,
    }, { merge: true });

    return published;
}

function quoteCatalogItem(item = {}, publishedPricing = {}, config = {}) {
    const krwPerHbt = Math.max(parseNumber(publishedPricing.finalKrwPerHbt, 0), 0);
    const pointCost = resolveRewardMarketPointCost(item, publishedPricing, config);

    return {
        ...item,
        settlementAsset: config.settlementAsset || DEFAULT_SETTLEMENT_ASSET,
        pointCost,
        hbtCost: pointCost,
        pricingMode: publishedPricing.pricingMode || config.pricingMode,
        quoteVersion: publishedPricing.quoteVersion || "",
        quoteSource: publishedPricing.quoteSource || "",
        quotedAt: publishedPricing.quotedAt || "",
        nextRefreshAt: publishedPricing.nextRefreshAt || "",
        dailyBandPct: publishedPricing.dailyBandPct || config.dailyBandPct || DEFAULT_DAILY_BAND_PCT,
        weeklyBandPct: publishedPricing.weeklyBandPct || config.weeklyBandPct || DEFAULT_WEEKLY_BAND_PCT,
        deliveryMode: config.deliveryMode || DEFAULT_DELIVERY_MODE,
        fallbackPolicy: config.fallbackPolicy || DEFAULT_FALLBACK_POLICY,
        marketKrwPerHbt: krwPerHbt,
        quoteState: publishedPricing.quoteState || "ready",
    };
}

async function loadRewardReserveSummary({ db, config }) {
    const reserveSnap = await db.collection("reward_reserve_metrics").doc(config.reserveDocId).get();
    return reserveSnap.exists
        ? buildRewardReserveSummary(reserveSnap.data() || {})
        : buildRewardReserveSummary();
}

function serializeRedemptionDoc(docSnap) {
    const data = docSnap.data() || {};
    const pointCost = getStoredRewardPointCost(data);
    const settlementAsset = String(
        data.settlementAsset
        || (String(data.burnTxHash || "").trim() ? "hbt" : DEFAULT_SETTLEMENT_ASSET)
    ).trim() || DEFAULT_SETTLEMENT_ASSET;
    return {
        id: docSnap.id,
        sku: String(data.sku || "").trim(),
        brandName: String(data.brandName || "").trim(),
        displayName: String(data.displayName || "").trim(),
        category: String(data.category || "").trim(),
        provider: String(data.provider || "").trim(),
        providerGoodsId: String(data.providerGoodsId || "").trim(),
        settlementAsset,
        pointCost,
        hbtCost: parseNumber(data.hbtCost, pointCost),
        faceValueKrw: parseNumber(data.faceValueKrw, 0),
        purchasePriceKrw: parseNumber(data.purchasePriceKrw, 0),
        marginKrw: parseNumber(data.marginKrw, 0),
        gasBudgetKrw: parseNumber(data.gasBudgetKrw, 0),
        operationsBudgetKrw: parseNumber(data.operationsBudgetKrw, 0),
        status: String(data.status || "issued").trim(),
        mode: String(data.mode || DEFAULT_REWARD_MARKET_MODE).trim(),
        pricingMode: String(data.pricingMode || DEFAULT_PRICING_MODE).trim(),
        quoteVersion: String(data.quoteVersion || "").trim(),
        quoteSource: String(data.quoteSource || "").trim(),
        quotedAt: toPlainDate(data.quotedAt, ""),
        healthGuide: String(data.healthGuide || "").trim(),
        productImageUrl: resolveRewardAssetUrl(
            data.productImageUrl,
            data.imageUrl,
            data.goodsImageUrl,
            data.thumbnailUrl
        ),
        brandLogoUrl: resolveRewardAssetUrl(
            data.brandLogoUrl,
            data.logoUrl,
            data.brandImageUrl
        ),
        deliveryMethod: String(data.deliveryMethod || "pin").trim(),
        deliveryMode: String(data.deliveryMode || DEFAULT_DELIVERY_MODE).trim(),
        fallbackPolicy: String(data.fallbackPolicy || DEFAULT_FALLBACK_POLICY).trim(),
        pinCode: String(data.pinCode || data.pinNo || "").trim(),
        couponImgUrl: String(data.couponImgUrl || "").trim(),
        barcodeUrl: String(data.barcodeUrl || data.couponImgUrl || "").trim(),
        burnTxHash: String(data.burnTxHash || "").trim(),
        burnExplorerUrl: String(data.burnExplorerUrl || "").trim(),
        expiresAt: toPlainDate(data.expiresAt, ""),
        createdAt: toPlainDate(data.createdAt, ""),
        issuedAt: toPlainDate(data.issuedAt, ""),
        updatedAt: toPlainDate(data.updatedAt, ""),
        recipientPhone: String(data.recipientPhone || "").trim(),
        clientRequestId: String(data.clientRequestId || "").trim(),
        providerOrderId: String(data.providerOrderId || "").trim(),
        providerTrId: String(data.providerTrId || "").trim(),
        providerResponseCode: String(data.providerResponseCode || "").trim(),
        providerResponseMessage: String(data.providerResponseMessage || "").trim(),
        errorMessage: String(data.errorMessage || "").trim(),
        manualReviewReason: String(data.manualReviewReason || "").trim(),
        manualResendCount: parseNumber(data.manualResendCount, 0),
        lastManualResendAt: toPlainDate(data.lastManualResendAt, ""),
        lastManualResendReason: String(data.lastManualResendReason || "").trim(),
    };
}

async function loadUserRedemptions({ db, uid, limit = 12 }) {
    const snapshot = await db.collection("reward_redemptions")
        .where("userId", "==", uid)
        .limit(Math.max(1, limit))
        .get();

    return snapshot.docs
        .filter((docSnap) => !docSnap.data()?.hiddenByUserAt)
        .sort((a, b) => toTimestampMillis(b.data()?.createdAt) - toTimestampMillis(a.data()?.createdAt))
        .map((docSnap) => serializeRedemptionDoc(docSnap));
}

async function findRedemptionByBurnTxHash(db, burnTxHash = "") {
    const normalized = String(burnTxHash || "").trim();
    if (!normalized) return null;
    const snapshot = await db.collection("reward_redemptions")
        .where("burnTxHash", "==", normalized)
        .limit(1)
        .get();
    return snapshot.empty ? null : snapshot.docs[0];
}

async function fetchBizmoneyBalance({ config, context = {} }) {
    if (config.mode !== "live" || !config.baseUrl || !config.bizmoneyPath) {
        return null;
    }

    const requestPayload = buildRequestPayload(config.bizmoneyBodyTemplate, {}, {
        ...context,
        giftishowCustomAuthCode: config.customAuthCode,
        giftishowCustomAuthToken: config.customAuthToken,
        giftishowDevYn: config.devYn,
        giftishowUserId: config.providerUserId,
    });
    const payload = await callGiftishowApi(config, config.bizmoneyPath, {
        method: config.bizmoneyMethod,
        query: config.bizmoneyMethod === "GET" ? requestPayload : undefined,
        body: config.bizmoneyMethod === "GET" ? undefined : requestPayload,
    });
    const unwrapped = unwrapNestedResult(payload);
    const balance = Math.max(
        parseNumber(payload?.balance, 0),
        parseNumber(payload?.data?.balance, 0),
        parseNumber(unwrapped?.balance, 0),
        parseNumber(unwrapped?.bizmoneyBalance, 0),
        parseNumber(unwrapped?.balanceAmt, 0)
    );

    return {
        balanceKrw: balance,
        raw: payload,
    };
}

async function syncBizmoneyMetrics({ db, config, now = new Date(), context = {} }) {
    if (config.mode !== "live") {
        return {
            balanceKrw: 0,
            checkedAt: "",
            status: "mock",
        };
    }

    const metricsRef = db.collection("reward_reserve_metrics").doc(config.reserveDocId);
    const metricsSnap = await metricsRef.get().catch(() => null);
    const existingMetrics = metricsSnap?.exists ? buildRewardReserveSummary(metricsSnap.data() || {}) : buildRewardReserveSummary();
    if (!config.providerReady) {
        await metricsRef.set({
            bizmoneyCheckedAt: now,
            bizmoneyStatus: "config_missing",
            bizmoneyMissingConfig: config.missingProviderConfig,
            updatedAt: now,
        }, { merge: true });

        return {
            balanceKrw: existingMetrics.lastBizmoneyBalanceKrw,
            checkedAt: now.toISOString(),
            status: "config_missing",
            missingConfig: [...config.missingProviderConfig],
        };
    }
    const checkedAtMs = toTimestampMillis(existingMetrics.bizmoneyCheckedAt);
    if (checkedAtMs && (now.getTime() - checkedAtMs) < (15 * 60 * 1000)) {
        return {
            balanceKrw: existingMetrics.lastBizmoneyBalanceKrw,
            checkedAt: existingMetrics.bizmoneyCheckedAt,
            status: existingMetrics.bizmoneyStatus || "cached",
        };
    }

    try {
        const result = await fetchBizmoneyBalance({ config, context });
        const balanceKrw = Math.max(parseNumber(result?.balanceKrw, 0), 0);
        await metricsRef.set({
            lastBizmoneyBalanceKrw: balanceKrw,
            bizmoneyCheckedAt: now,
            bizmoneyStatus: "ok",
            updatedAt: now,
        }, { merge: true });

        return {
            balanceKrw,
            checkedAt: now.toISOString(),
            status: "ok",
        };
    } catch (error) {
        await db.collection("reward_reserve_metrics").doc(config.reserveDocId).set({
            bizmoneyCheckedAt: now,
            bizmoneyStatus: "error",
            bizmoneyErrorMessage: String(error?.message || "giftishow_bizmoney_failed"),
            updatedAt: now,
        }, { merge: true });

        return {
            balanceKrw: 0,
            checkedAt: now.toISOString(),
            status: "error",
            errorMessage: String(error?.message || "giftishow_bizmoney_failed"),
        };
    }
}

async function loadIssuanceUsage({ db, now = new Date() }) {
    const monthStart = getStartOfKstMonth(now);
    const weekStart = getStartOfKstWeek(now);
    const dayStart = getStartOfKstDay(now);

    const snapshot = await db.collection("reward_redemptions")
        .where("createdAt", ">=", monthStart)
        .get();

    const usage = {
        dailyPoints: 0,
        weeklyPoints: 0,
        monthlyPoints: 0,
        dailyHbt: 0,
        weeklyHbt: 0,
        monthlyHbt: 0,
        dailyCount: 0,
        weeklyCount: 0,
        monthlyCount: 0,
    };

    snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (!shouldCountTowardIssuanceUsage(data)) return;

        const createdAtMs = toTimestampMillis(data.createdAt);
        if (!createdAtMs) return;

        const pointCost = getStoredRewardPointCost(data);
        if (createdAtMs >= monthStart.getTime()) {
            usage.monthlyPoints += pointCost;
            usage.monthlyHbt += pointCost;
            usage.monthlyCount += 1;
        }
        if (createdAtMs >= weekStart.getTime()) {
            usage.weeklyPoints += pointCost;
            usage.weeklyHbt += pointCost;
            usage.weeklyCount += 1;
        }
        if (createdAtMs >= dayStart.getTime()) {
            usage.dailyPoints += pointCost;
            usage.dailyHbt += pointCost;
            usage.dailyCount += 1;
        }
    });

    return usage;
}

function buildLimitSummary(config = {}, usage = {}) {
    const dailyRemainingPoints = Math.max(config.dailyLimitPoints - usage.dailyPoints, 0);
    const weeklyRemainingPoints = Math.max(config.weeklyLimitPoints - usage.weeklyPoints, 0);
    const monthlyRemainingPoints = Math.max(config.monthlyLimitPoints - usage.monthlyPoints, 0);

    return {
        daily: {
            limitPoints: config.dailyLimitPoints,
            usedPoints: usage.dailyPoints,
            remainingPoints: dailyRemainingPoints,
            limitHbt: config.dailyLimitPoints,
            usedHbt: usage.dailyPoints,
            remainingHbt: dailyRemainingPoints,
            count: usage.dailyCount,
        },
        weekly: {
            limitPoints: config.weeklyLimitPoints,
            usedPoints: usage.weeklyPoints,
            remainingPoints: weeklyRemainingPoints,
            limitHbt: config.weeklyLimitPoints,
            usedHbt: usage.weeklyPoints,
            remainingHbt: weeklyRemainingPoints,
            count: usage.weeklyCount,
        },
        monthly: {
            limitPoints: config.monthlyLimitPoints,
            usedPoints: usage.monthlyPoints,
            remainingPoints: monthlyRemainingPoints,
            limitHbt: config.monthlyLimitPoints,
            usedHbt: usage.monthlyPoints,
            remainingHbt: monthlyRemainingPoints,
            count: usage.monthlyCount,
        },
    };
}

function buildIssuancePolicy({
    config,
    pricing = {},
    reserve = {},
    limitSummary = {},
    bizmoney = {},
}) {
    let issuanceEnabled = true;
    let blockedReason = "";

    if ((config.settlementAsset || DEFAULT_SETTLEMENT_ASSET) === "hbt" && pricing.quoteState !== "ready") {
        issuanceEnabled = false;
        blockedReason = "가격 기준이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.";
    }

    if (issuanceEnabled && config.mode === "live" && !config.providerReady) {
        issuanceEnabled = false;
        blockedReason = config.providerReadyMessage || "Giftishow 연동 설정이 비어 있어요.";
    }

    const lastBizmoneyBalanceKrw = Math.max(
        parseNumber(bizmoney.balanceKrw, 0),
        parseNumber(reserve.lastBizmoneyBalanceKrw, 0)
    );

    if (
        issuanceEnabled
        && config.mode === "live"
        && String(bizmoney.status || "").trim() === "error"
        && !(lastBizmoneyBalanceKrw > 0)
    ) {
        issuanceEnabled = false;
        blockedReason = "비즈머니 확인이 불안정해 쿠폰 발급을 잠시 멈췄어요.";
    }

    if (issuanceEnabled && config.mode === "live" && lastBizmoneyBalanceKrw > 0 && lastBizmoneyBalanceKrw < config.minBizmoneyKrw) {
        issuanceEnabled = false;
        blockedReason = "비즈머니 잔액이 최소 운영 기준 아래예요. 관제탑 확인이 필요해요.";
    }

    return {
        issuanceEnabled,
        blockedReason,
        lastBizmoneyBalanceKrw,
        minBizmoneyKrw: config.minBizmoneyKrw,
        limits: limitSummary,
    };
}

function buildCatalogAvailability(item = {}, policy = {}) {
    const blockedReasons = [];
    const limits = policy.limits || {};
    const itemCost = Math.max(parseNumber(item.pointCost, 0), parseNumber(item.hbtCost, 0));

    if (item.available === false) {
        blockedReasons.push("현재 재고 확인이 필요해요.");
    }
    if (policy.issuanceEnabled === false) {
        blockedReasons.push(policy.blockedReason);
    }
    if ((limits.daily?.remainingPoints ?? limits.daily?.remainingHbt ?? 0) < itemCost) {
        blockedReasons.push("오늘 교환 한도를 모두 사용했어요.");
    }
    if ((limits.weekly?.remainingPoints ?? limits.weekly?.remainingHbt ?? 0) < itemCost) {
        blockedReasons.push("이번 주 교환 한도를 모두 사용했어요.");
    }
    if ((limits.monthly?.remainingPoints ?? limits.monthly?.remainingHbt ?? 0) < itemCost) {
        blockedReasons.push("이번 달 교환 한도를 모두 사용했어요.");
    }
    if (policy.lastBizmoneyBalanceKrw > 0 && (policy.lastBizmoneyBalanceKrw - item.purchasePriceKrw) < policy.minBizmoneyKrw) {
        blockedReasons.push("비즈머니 운영 기준에 먼저 맞춰야 해요.");
    }

    return {
        ...item,
        redeemable: blockedReasons.length === 0,
        blockedReason: blockedReasons[0] || "",
    };
}

function buildRewardMarketSettings({ config, pricing, reserve, bizmoney, usage, userData = {} }) {
    const limitSummary = buildLimitSummary(config, usage);
    const policy = buildIssuancePolicy({
        config,
        pricing,
        reserve,
        limitSummary,
        bizmoney,
    });
    const savedRecipientPhone = resolveRewardRecipientPhone({
        requestedPhone: "",
        userData,
        authPhoneNumber: "",
    });

    return {
        policy,
        settings: {
            mode: config.mode,
            settlementAsset: config.settlementAsset || DEFAULT_SETTLEMENT_ASSET,
            settlementLabel: (config.settlementAsset || DEFAULT_SETTLEMENT_ASSET) === "hbt" ? "HBT" : "포인트",
            minRedeemPoints: config.minRedeemPoints,
            minRedeemHbt: config.minRedeemHbt,
            requiresBurnTx: config.mode === "live" && (config.settlementAsset || DEFAULT_SETTLEMENT_ASSET) === "hbt",
            pricingMode: pricing.pricingMode || config.pricingMode,
            quotedAt: pricing.quotedAt || "",
            nextRefreshAt: pricing.nextRefreshAt || "",
            dailyBandPct: pricing.dailyBandPct || config.dailyBandPct,
            weeklyBandPct: pricing.weeklyBandPct || config.weeklyBandPct,
            deliveryMode: config.deliveryMode,
            fallbackPolicy: config.fallbackPolicy,
            issuanceEnabled: policy.issuanceEnabled,
            issuanceBlockedReason: policy.blockedReason,
            phase1EndsAt: config.phase1EndsAt,
            limits: limitSummary,
            minBizmoneyKrw: config.minBizmoneyKrw,
            lastBizmoneyBalanceKrw: policy.lastBizmoneyBalanceKrw,
            providerReady: config.providerReady,
            providerReadyMessage: config.providerReadyMessage,
            missingProviderConfig: [...config.missingProviderConfig],
            requiresRecipientPhone: config.requiresRecipientPhone,
            savedRecipientPhone,
            maskedRecipientPhone: maskRecipientPhone(savedRecipientPhone),
            manualResendAvailable: config.manualResendAvailable,
        },
    };
}

async function buildRewardMarketSnapshot({ db, uid, config, userData = {} }) {
    const now = new Date();
    const pricing = await ensurePublishedPricing({ db, config, now });
    const [catalog, redemptions, reserve, bizmoney, usage] = await Promise.all([
        loadRewardCatalog({ db, config }),
        loadUserRedemptions({ db, uid }),
        loadRewardReserveSummary({ db, config }),
        syncBizmoneyMetrics({
            db,
            config,
            now,
            context: { userId: uid },
        }),
        loadIssuanceUsage({ db, now }),
    ]);

    const { policy, settings } = buildRewardMarketSettings({
        config,
        pricing,
        reserve,
        bizmoney,
        usage,
        userData,
    });

    const quotedCatalog = catalog
        .map((item) => quoteCatalogItem(item, pricing, config))
        .map((item) => buildCatalogAvailability(item, policy));

    return {
        settings,
        pricingMode: settings.pricingMode,
        quotedAt: settings.quotedAt,
        nextRefreshAt: settings.nextRefreshAt,
        dailyBandPct: settings.dailyBandPct,
        deliveryMode: settings.deliveryMode,
        manualResendAvailable: settings.manualResendAvailable,
        issuanceEnabled: settings.issuanceEnabled,
        issuanceBlockedReason: settings.issuanceBlockedReason,
        limits: settings.limits,
        pricing,
        catalog: quotedCatalog,
        redemptions,
        reserve: {
            ...reserve,
            lastBizmoneyBalanceKrw: settings.lastBizmoneyBalanceKrw,
            bizmoneyCheckedAt: bizmoney.checkedAt || reserve.bizmoneyCheckedAt || "",
            bizmoneyStatus: bizmoney.status || reserve.bizmoneyStatus || "",
        },
    };
}

function buildMockCouponCode() {
    const digits = Array.from({ length: 12 }, () => crypto.randomInt(0, 10)).join("");
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

function buildMockIssuedCoupon(product = {}, recipientPhone = "") {
    const validityDays = resolveRewardValidityDays(product);
    const expiresAt = new Date(Date.now() + (validityDays * 24 * 60 * 60 * 1000)).toISOString();
    return {
        providerOrderId: `mock_${Date.now().toString(36)}`,
        deliveryMethod: product.deliveryMethod || "pin",
        pinCode: buildMockCouponCode(),
        couponImgUrl: "",
        barcodeUrl: "",
        expiresAt,
        recipientPhone,
        providerResponseCode: "0000",
        providerResponseMessage: "mock_issued",
    };
}

function mapGiftishowOrderPayload(payload = {}, product = {}, recipientPhone = "") {
    const flattened = unwrapNestedResult(payload);
    const couponInfo = Array.isArray(payload?.couponInfoList) ? payload.couponInfoList[0] || {} : {};
    const merged = {
        ...payload,
        ...flattened,
        ...couponInfo,
    };

    return {
        providerOrderId: String(
            merged.orderId || merged.orderNo || merged.id || merged.sendRstCd || `gift_${Date.now().toString(36)}`
        ).trim(),
        deliveryMethod: String(merged.deliveryMethod || merged.issueMethod || product.deliveryMethod || "pin").trim(),
        pinCode: String(merged.pin || merged.pinCode || merged.pinNo || merged.couponNo || merged.couponNumber || "").trim(),
        couponImgUrl: String(merged.couponImgUrl || merged.barcodeUrl || merged.barcodeURL || merged.imageUrl || merged.imgUrl || "").trim(),
        barcodeUrl: String(merged.barcodeUrl || merged.couponImgUrl || merged.barcodeURL || merged.imageUrl || merged.imgUrl || "").trim(),
        expiresAt: toPlainDate(
            merged.expiresAt || merged.expiredAt || merged.expireDate || merged.validUntil || merged.validPrdEndDt,
            new Date(Date.now() + (resolveRewardValidityDays(product) * 24 * 60 * 60 * 1000)).toISOString()
        ),
        recipientPhone: normalizeRecipientPhone(
            merged.recipientPhone || merged.phone || merged.phoneNumber || merged.recverTelNo || recipientPhone
        ),
        providerResponseCode: String(merged.code || merged.resCode || merged.sendRstCd || "").trim(),
        providerResponseMessage: String(merged.message || merged.resMsg || merged.sendRstMsg || "").trim(),
    };
}

function buildProviderContext({
    config,
    uid,
    product,
    rewardName,
    recipientPhone,
    providerTrId,
    providerOrderId = "",
}) {
    return {
        userId: uid,
        sku: product.sku,
        providerGoodsId: product.providerGoodsId,
        goodsCode: product.providerGoodsId,
        goodsId: product.providerGoodsId,
        goodsName: product.displayName,
        displayName: product.displayName,
        brandName: product.brandName,
        faceValueKrw: product.faceValueKrw,
        hbtCost: product.hbtCost,
        rewardName,
        recipientPhone,
        deliveryMethod: product.deliveryMethod,
        deliveryMode: config.deliveryMode,
        providerTrId,
        trId: providerTrId,
        orderNo: providerOrderId,
        providerOrderId,
        fallbackPolicy: config.fallbackPolicy,
        giftishowCustomAuthCode: config.customAuthCode,
        giftishowCustomAuthToken: config.customAuthToken,
        giftishowDevYn: config.devYn,
        giftishowCallbackNo: config.callbackNo,
        giftishowUserId: config.providerUserId,
        giftishowTemplateId: config.templateId,
        giftishowBannerId: config.bannerId,
        giftishowMmsTitle: config.defaultMmsTitle,
        giftishowMmsMsg: config.defaultMmsMessage,
        giftishowDeliveryCode: resolveGiftishowDeliveryCode(product.deliveryMethod),
        giftishowSmsFlag: "Y",
        catalogStart: config.catalogStart,
        catalogSize: config.catalogSize,
    };
}

async function issueCouponWithProvider({
    config,
    uid,
    product,
    rewardName,
    recipientPhone,
    providerTrId,
}) {
    if (config.mode !== "live") {
        return buildMockIssuedCoupon(product, recipientPhone);
    }
    if (!config.providerReady) {
        const error = new Error(config.providerReadyMessage || "giftishow_provider_not_ready");
        error.code = "giftishow_provider_not_ready";
        error.missingConfig = [...config.missingProviderConfig];
        throw error;
    }

    const context = buildProviderContext({
        config,
        uid,
        product,
        rewardName,
        recipientPhone,
        providerTrId,
    });

    const body = buildRequestPayload(config.orderBodyTemplate, {
        goodsId: product.providerGoodsId,
        goodsName: product.displayName,
        brandName: product.brandName,
        faceValueKrw: product.faceValueKrw,
        issueMethod: product.deliveryMethod,
        recipientPhone,
        trId: providerTrId,
        userId: uid,
    }, context);

    const payload = await callGiftishowApi(config, config.orderPath, {
        method: config.orderMethod,
        query: config.orderMethod === "GET" ? body : undefined,
        body: config.orderMethod === "GET" ? undefined : body,
    });

    return mapGiftishowOrderPayload(payload, product, recipientPhone);
}

async function queryCouponStatusWithProvider({
    config,
    uid,
    product,
    rewardName,
    recipientPhone,
    providerTrId,
    providerOrderId = "",
}) {
    if (config.mode !== "live" || !config.couponStatusPath) {
        return null;
    }
    if (!config.providerReady) {
        const error = new Error(config.providerReadyMessage || "giftishow_provider_not_ready");
        error.code = "giftishow_provider_not_ready";
        error.missingConfig = [...config.missingProviderConfig];
        throw error;
    }

    const context = buildProviderContext({
        config,
        uid,
        product,
        rewardName,
        recipientPhone,
        providerTrId,
        providerOrderId,
    });

    const body = buildRequestPayload(config.couponStatusBodyTemplate, {
        trId: providerTrId,
        orderNo: providerOrderId,
        userId: uid,
    }, context);

    const payload = await callGiftishowApi(config, config.couponStatusPath, {
        method: config.couponStatusMethod,
        query: config.couponStatusMethod === "GET" ? body : undefined,
        body: config.couponStatusMethod === "GET" ? undefined : body,
    });

    return mapGiftishowOrderPayload(payload, product, recipientPhone);
}

async function resendCouponWithProvider({
    config,
    uid,
    redemption,
    reason = "",
    forceSms = false,
}) {
    if (config.mode !== "live") {
        return {
            providerResponseCode: "0000",
            providerResponseMessage: `mock_manual_resend:${reason || "manual_resend"}`,
        };
    }
    if (!config.providerReady) {
        const error = new Error(config.providerReadyMessage || "giftishow_provider_not_ready");
        error.code = "giftishow_provider_not_ready";
        error.missingConfig = [...config.missingProviderConfig];
        throw error;
    }

    if (!forceSms) {
        return queryCouponStatusWithProvider({
            config,
            uid,
            product: redemption,
            rewardName: `${redemption.brandName} ${redemption.displayName}`.trim(),
            recipientPhone: redemption.recipientPhone,
            providerTrId: redemption.providerTrId,
            providerOrderId: redemption.providerOrderId,
        });
    }

    if (!config.resendPath) {
        return null;
    }

    const context = buildProviderContext({
        config,
        uid,
        product: redemption,
        rewardName: `${redemption.brandName} ${redemption.displayName}`.trim(),
        recipientPhone: redemption.recipientPhone,
        providerTrId: redemption.providerTrId,
        providerOrderId: redemption.providerOrderId,
    });

    const body = buildRequestPayload(config.resendBodyTemplate, {
        trId: redemption.providerTrId,
        orderNo: redemption.providerOrderId,
        userId: uid,
        recipientPhone: redemption.recipientPhone,
        reason,
        smsFlag: "Y",
    }, context);

    const payload = await callGiftishowApi(config, config.resendPath, {
        method: config.resendMethod,
        query: config.resendMethod === "GET" ? body : undefined,
        body: config.resendMethod === "GET" ? undefined : body,
    });

    return mapGiftishowOrderPayload(payload, redemption, redemption.recipientPhone);
}

function isUsableCouponPayload(issuedCoupon = {}) {
    return Boolean(String(issuedCoupon.pinCode || "").trim() || String(issuedCoupon.couponImgUrl || issuedCoupon.barcodeUrl || "").trim());
}

function buildManualReviewDoc({
    uid,
    userData = {},
    product,
    config,
    reserve,
    normalizedPhone,
    providerTrId,
    reason,
    errorMessage,
    quoteVersion,
    quoteSource,
    quotedAt,
    pointCost,
    clientRequestId,
}) {
    return {
        userId: uid,
        sku: product.sku,
        brandName: product.brandName,
        displayName: product.displayName,
        category: product.category,
        provider: product.provider,
        providerGoodsId: product.providerGoodsId,
        providerTrId,
        status: "failed_manual_review",
        mode: config.mode,
        pricingMode: product.pricingMode || config.pricingMode,
        settlementAsset: config.settlementAsset || DEFAULT_SETTLEMENT_ASSET,
        clientRequestId,
        quoteVersion,
        quoteSource,
        quotedAt,
        faceValueKrw: product.faceValueKrw,
        purchasePriceKrw: reserve.purchasePriceKrw,
        marginKrw: reserve.marginKrw,
        gasBudgetKrw: reserve.gasBudgetKrw,
        operationsBudgetKrw: reserve.operationsBudgetKrw,
        pointCost,
        hbtCost: pointCost,
        deliveryMethod: product.deliveryMethod,
        deliveryMode: config.deliveryMode,
        fallbackPolicy: config.fallbackPolicy,
        healthGuide: product.healthGuide,
        productImageUrl: product.productImageUrl || "",
        brandLogoUrl: product.brandLogoUrl || "",
        recipientPhone: normalizedPhone,
        errorMessage: errorMessage || reason || "reward_issue_manual_review",
        manualReviewReason: reason || "reward_issue_manual_review",
        updatedAt: new Date(),
        userLabel: String(userData.customDisplayName || userData.displayName || "회원").trim(),
    };
}

function buildRewardMarketResult(docSnap) {
    return {
        ...serializeRedemptionDoc(docSnap),
        success: true,
    };
}

function buildProviderTrId() {
    const datePart = getKstDayKey(new Date()).replace(/-/g, "");
    const randomPart = crypto.randomBytes(4).toString("hex");
    return `hs_${datePart}_${randomPart}`.slice(0, 25);
}

function createReserveLedgerRef(db) {
    return db.collection("reward_reserve_ledger").doc();
}

function shouldChargePointsImmediately(config = {}) {
    return String(config.mode || DEFAULT_REWARD_MARKET_MODE).trim().toLowerCase() === "live";
}

function shouldCountTowardIssuanceUsage(data = {}) {
    const mode = String(data.mode || DEFAULT_REWARD_MARKET_MODE).trim().toLowerCase();
    const status = String(data.status || "").trim();
    return mode === "live"
        && data.pointsCharged === true
        && ["issued", "pending_issue"].includes(status);
}

function canDismissRewardRedemption(data = {}) {
    const status = String(data.status || "").trim();
    const mode = String(data.mode || DEFAULT_REWARD_MARKET_MODE).trim().toLowerCase();
    if (status === "issued" && mode !== "live") return true;
    if (["failed_manual_review", "cancelled"].includes(status)) return true;
    return status === "pending_issue" && mode !== "live";
}

async function refundChargedRewardPoints({
    db,
    FieldValue,
    userRef,
    redemptionRef,
    pointCost = 0,
    normalizedPhone = "",
    reason = "reward_issue_reverted",
}) {
    if (!(parseNumber(pointCost, 0) > 0)) return false;

    let refunded = false;
    await db.runTransaction(async (transaction) => {
        const [freshUserSnap, freshRedemptionSnap] = await Promise.all([
            transaction.get(userRef),
            transaction.get(redemptionRef),
        ]);
        if (!freshRedemptionSnap.exists) return;

        const redemptionData = freshRedemptionSnap.data() || {};
        if (redemptionData.pointsCharged !== true || redemptionData.pointsRefundedAt) {
            return;
        }

        const userUpdate = {
            coins: FieldValue.increment(parseNumber(pointCost, 0)),
        };
        const freshUserData = freshUserSnap.data() || {};
        if (normalizedPhone && normalizedPhone !== normalizeRecipientPhone(freshUserData.rewardRecipientPhone)) {
            userUpdate.rewardRecipientPhone = normalizedPhone;
        }

        transaction.set(userRef, userUpdate, { merge: true });
        transaction.set(redemptionRef, {
            pointsCharged: false,
            pointsRefundedAt: FieldValue.serverTimestamp(),
            pointRefundReason: String(reason || "reward_issue_reverted").trim(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        refunded = true;
    });

    return refunded;
}

async function dismissRewardCoupon({
    db,
    FieldValue,
    HttpsError,
    uid,
    redemptionId = "",
}) {
    const normalizedId = String(redemptionId || "").trim();
    if (!normalizedId) {
        throw new HttpsError("invalid-argument", "지울 쿠폰을 다시 선택해 주세요.");
    }

    const redemptionRef = db.collection("reward_redemptions").doc(normalizedId);
    const redemptionSnap = await redemptionRef.get();
    if (!redemptionSnap.exists) {
        throw new HttpsError("not-found", "쿠폰 기록을 찾을 수 없어요.");
    }

    const redemption = redemptionSnap.data() || {};
    if (String(redemption.userId || "").trim() !== String(uid || "").trim()) {
        throw new HttpsError("permission-denied", "다른 사용자의 쿠폰 기록은 지울 수 없어요.");
    }

    if (redemption.hiddenByUserAt) {
        return { success: true, dismissed: true, alreadyHidden: true, redemptionId: normalizedId };
    }

    if (!canDismissRewardRedemption(redemption)) {
        throw new HttpsError("failed-precondition", "발급 완료된 쿠폰은 보관함에서 지울 수 없어요.");
    }

    await redemptionRef.set({
        hiddenByUserAt: FieldValue.serverTimestamp(),
        hiddenByUserUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
        success: true,
        dismissed: true,
        redemptionId: normalizedId,
    };
}

async function redeemRewardCouponLegacy({
    db,
    FieldValue,
    HttpsError,
    uid,
    userData = {},
    config,
    sku,
    recipientPhone = "",
    burnTxHash = "",
    explorerUrl = "",
    networkTag = "",
    quoteVersion = "",
    quoteSource = "",
    quotedHbtCost = 0,
    verifyBurnTx = null,
    authPhoneNumber = "",
}) {
    const normalizedSku = normalizeSku(sku);
    if (!normalizedSku) {
        throw new HttpsError("invalid-argument", "교환할 상품을 선택해 주세요.");
    }

    const now = new Date();
    const pricing = await ensurePublishedPricing({ db, config, now });
    const reserveSummary = await loadRewardReserveSummary({ db, config });
    const bizmoney = await syncBizmoneyMetrics({ db, config, now, context: { userId: uid } });
    const usage = await loadIssuanceUsage({ db, now });
    const policy = buildIssuancePolicy({
        config,
        pricing,
        reserve: reserveSummary,
        limitSummary: buildLimitSummary(config, usage),
        bizmoney,
    });

    const catalog = await loadRewardCatalog({ db, config });
    const quotedCatalog = catalog
        .map((item) => quoteCatalogItem(item, pricing, config))
        .map((item) => buildCatalogAvailability(item, policy));
    const product = quotedCatalog.find((item) => item.sku === normalizedSku);

    if (!product) {
        throw new HttpsError("not-found", "선택한 보상 상품을 찾을 수 없어요.");
    }
    if (product.hbtCost < config.minRedeemHbt) {
        throw new HttpsError("failed-precondition", `${config.minRedeemHbt.toLocaleString("ko-KR")} HBT 이상 상품만 교환할 수 있어요.`);
    }

    const normalizedPhone = resolveRewardRecipientPhone({
        requestedPhone: recipientPhone,
        userData,
        authPhoneNumber,
    });
    const reserve = computeReserveBreakdown(product);
    const rewardName = `${product.brandName} ${product.displayName}`.trim();
    const burnHash = String(burnTxHash || "").trim();
    const burnExplorerUrl = burnHash && explorerUrl ? `${explorerUrl}/tx/${burnHash}` : "";
    const quoteMatchesCurrent = !quoteVersion || String(quoteVersion).trim() === String(product.quoteVersion || "").trim();
    const requestedQuotedHbtCost = quoteMatchesCurrent
        ? Math.max(parseNumber(quotedHbtCost, product.hbtCost), config.minRedeemHbt)
        : product.hbtCost;
    const effectiveQuoteVersion = quoteMatchesCurrent
        ? String(quoteVersion || product.quoteVersion || "").trim()
        : String(product.quoteVersion || "").trim();
    const effectiveQuoteSource = quoteMatchesCurrent
        ? String(quoteSource || product.quoteSource || "").trim()
        : String(product.quoteSource || "").trim();
    const effectiveQuotedAt = product.quotedAt || pricing.quotedAt || "";

    if (config.mode === "live" && !burnHash) {
        throw new HttpsError("failed-precondition", "실발급 교환은 온체인 소각 내역이 필요해요.");
    }
    if (config.mode === "live" && !normalizedPhone) {
        throw new HttpsError("failed-precondition", "실발급에는 쿠폰 수령 연락처가 필요해요.");
    }

    const existingRedemptionDoc = burnHash
        ? await findRedemptionByBurnTxHash(db, burnHash)
        : null;
    if (existingRedemptionDoc) {
        return {
            ...buildRewardMarketResult(existingRedemptionDoc),
            existing: true,
        };
    }

    const redemptionRef = config.mode === "live" && burnHash
        ? db.collection("reward_redemptions").doc(`burn_${burnHash.toLowerCase()}`)
        : db.collection("reward_redemptions").doc();
    const reserveLedgerRef = createReserveLedgerRef(db);
    const txRecordRef = db.collection("blockchain_transactions").doc();
    const providerTrId = buildProviderTrId();

    if (normalizedPhone && normalizedPhone !== normalizeRecipientPhone(userData.rewardRecipientPhone)) {
        await db.collection("users").doc(uid).set({
            rewardRecipientPhone: normalizedPhone,
        }, { merge: true });
    }

    if (config.mode === "live" && typeof verifyBurnTx === "function") {
        await verifyBurnTx({
            burnTxHash: burnHash,
            userData,
            expectedHbtCost: requestedQuotedHbtCost,
            sku: product.sku,
        });
    }

    if (!product.redeemable) {
        await redemptionRef.set(buildManualReviewDoc({
            uid,
            userData,
            product,
            config,
            reserve,
            normalizedPhone,
            burnHash,
            burnExplorerUrl,
            networkTag,
            providerTrId,
            reason: product.blockedReason || policy.blockedReason || "reward_redemption_blocked",
            errorMessage: product.blockedReason || policy.blockedReason || "reward_redemption_blocked",
            quoteVersion: effectiveQuoteVersion,
            quoteSource: effectiveQuoteSource,
            quotedAt: effectiveQuotedAt,
            hbtCost: requestedQuotedHbtCost,
        }), { merge: true });

        throw new HttpsError("failed-precondition", product.blockedReason || "현재는 쿠폰 발급이 잠시 어려워요.");
    }

    if (policy.lastBizmoneyBalanceKrw > 0 && (policy.lastBizmoneyBalanceKrw - reserve.purchasePriceKrw) < config.minBizmoneyKrw) {
        await redemptionRef.set(buildManualReviewDoc({
            uid,
            userData,
            product,
            config,
            reserve,
            normalizedPhone,
            burnHash,
            burnExplorerUrl,
            networkTag,
            providerTrId,
            reason: "bizmoney_below_operational_floor",
            errorMessage: "bizmoney_below_operational_floor",
            quoteVersion: effectiveQuoteVersion,
            quoteSource: effectiveQuoteSource,
            quotedAt: effectiveQuotedAt,
            hbtCost: requestedQuotedHbtCost,
        }), { merge: true });

        throw new HttpsError("failed-precondition", "비즈머니 운영 기준이 부족해 관리자 확인이 필요해요.");
    }

    if (config.mode === "live") {
        await redemptionRef.set({
            userId: uid,
            sku: product.sku,
            brandName: product.brandName,
            displayName: product.displayName,
            category: product.category,
            provider: product.provider,
            providerGoodsId: product.providerGoodsId,
            providerTrId,
            status: "pending_issue",
            mode: config.mode,
            pricingMode: product.pricingMode || config.pricingMode,
            quoteVersion: effectiveQuoteVersion,
            quoteSource: effectiveQuoteSource,
            quotedAt: effectiveQuotedAt || null,
            faceValueKrw: product.faceValueKrw,
            purchasePriceKrw: reserve.purchasePriceKrw,
            marginKrw: reserve.marginKrw,
            gasBudgetKrw: reserve.gasBudgetKrw,
            operationsBudgetKrw: reserve.operationsBudgetKrw,
            hbtCost: requestedQuotedHbtCost,
            deliveryMethod: product.deliveryMethod,
            deliveryMode: config.deliveryMode,
            fallbackPolicy: config.fallbackPolicy,
            healthGuide: product.healthGuide,
            productImageUrl: product.productImageUrl || "",
            brandLogoUrl: product.brandLogoUrl || "",
            recipientPhone: normalizedPhone,
            burnTxHash: burnHash,
            burnExplorerUrl,
            network: networkTag,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            userLabel: String(userData.customDisplayName || userData.displayName || "회원").trim(),
        }, { merge: true });
    }

    let issuedCoupon = null;
    try {
        issuedCoupon = await issueCouponWithProvider({
            config,
            uid,
            product: { ...product, hbtCost: requestedQuotedHbtCost },
            rewardName,
            recipientPhone: normalizedPhone,
            providerTrId,
        });
    } catch (error) {
        const recoveredCoupon = await queryCouponStatusWithProvider({
            config,
            uid,
            product: { ...product, hbtCost: requestedQuotedHbtCost },
            rewardName,
            recipientPhone: normalizedPhone,
            providerTrId,
        }).catch(() => null);

        if (isUsableCouponPayload(recoveredCoupon)) {
            issuedCoupon = recoveredCoupon;
        } else {
            await redemptionRef.set(buildManualReviewDoc({
                uid,
                userData,
                product,
                config,
                reserve,
                normalizedPhone,
                burnHash,
                burnExplorerUrl,
                networkTag,
                providerTrId,
                reason: error?.code === "giftishow_timeout"
                    ? "giftishow_timeout_manual_review"
                    : "giftishow_issue_failed_manual_review",
                errorMessage: error?.message || "reward_issue_failed",
                quoteVersion: effectiveQuoteVersion,
                quoteSource: effectiveQuoteSource,
                quotedAt: effectiveQuotedAt,
                hbtCost: requestedQuotedHbtCost,
            }), { merge: true });
            throw new HttpsError("internal", "쿠폰 발급 응답이 불안정해 수동 확인으로 넘겼어요.");
        }
    }

    if (!isUsableCouponPayload(issuedCoupon)) {
        await redemptionRef.set(buildManualReviewDoc({
            uid,
            userData,
            product,
            config,
            reserve,
            normalizedPhone,
            burnHash,
            burnExplorerUrl,
            networkTag,
            providerTrId,
            reason: "provider_coupon_payload_missing",
            errorMessage: "provider_coupon_payload_missing",
            quoteVersion: effectiveQuoteVersion,
            quoteSource: effectiveQuoteSource,
            quotedAt: effectiveQuotedAt,
            hbtCost: requestedQuotedHbtCost,
        }), { merge: true });
        throw new HttpsError("internal", "쿠폰 이미지나 PIN을 확인하지 못해 수동 확인이 필요해요.");
    }

    const expiresAtDate = issuedCoupon?.expiresAt ? new Date(issuedCoupon.expiresAt) : null;
    const serializedExpiresAt = expiresAtDate && !Number.isNaN(expiresAtDate.getTime()) ? expiresAtDate : null;
    const today = getKstDayKey(now);

    const batch = db.batch();
    batch.set(redemptionRef, {
        userId: uid,
        sku: product.sku,
        brandName: product.brandName,
        displayName: product.displayName,
        category: product.category,
        provider: product.provider,
        providerGoodsId: product.providerGoodsId,
        providerTrId,
        providerOrderId: issuedCoupon.providerOrderId,
        providerResponseCode: issuedCoupon.providerResponseCode || "",
        providerResponseMessage: issuedCoupon.providerResponseMessage || "",
        status: "issued",
        mode: config.mode,
        pricingMode: product.pricingMode || config.pricingMode,
        quoteVersion: effectiveQuoteVersion,
        quoteSource: effectiveQuoteSource,
        quotedAt: effectiveQuotedAt || null,
        faceValueKrw: product.faceValueKrw,
        purchasePriceKrw: reserve.purchasePriceKrw,
        marginKrw: reserve.marginKrw,
        gasBudgetKrw: reserve.gasBudgetKrw,
        operationsBudgetKrw: reserve.operationsBudgetKrw,
        hbtCost: requestedQuotedHbtCost,
        deliveryMethod: issuedCoupon.deliveryMethod || product.deliveryMethod,
        deliveryMode: config.deliveryMode,
        fallbackPolicy: config.fallbackPolicy,
        pinCode: issuedCoupon.pinCode,
        couponImgUrl: issuedCoupon.couponImgUrl || issuedCoupon.barcodeUrl || "",
        barcodeUrl: issuedCoupon.barcodeUrl || issuedCoupon.couponImgUrl || "",
        healthGuide: product.healthGuide,
        productImageUrl: product.productImageUrl || "",
        brandLogoUrl: product.brandLogoUrl || "",
        recipientPhone: issuedCoupon.recipientPhone || normalizedPhone,
        burnTxHash: burnHash,
        burnExplorerUrl,
        network: networkTag,
        issuedAt: FieldValue.serverTimestamp(),
        expiresAt: serializedExpiresAt,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        userLabel: String(userData.customDisplayName || userData.displayName || "회원").trim(),
    }, { merge: true });
    batch.set(txRecordRef, {
        userId: uid,
        type: "reward_redemption",
        amount: requestedQuotedHbtCost,
        rewardName,
        rewardSku: product.sku,
        faceValueKrw: product.faceValueKrw,
        providerOrderId: issuedCoupon.providerOrderId,
        burnTxHash: burnHash,
        burnExplorerUrl,
        quoteVersion: effectiveQuoteVersion,
        quoteSource: effectiveQuoteSource,
        date: today,
        timestamp: FieldValue.serverTimestamp(),
        status: "success",
        network: networkTag,
    });
    batch.set(reserveLedgerRef, {
        userId: uid,
        redemptionId: redemptionRef.id,
        sku: product.sku,
        rewardName,
        eventType: "issued",
        mode: config.mode,
        pricingMode: product.pricingMode || config.pricingMode,
        quoteVersion: effectiveQuoteVersion,
        marginKrw: reserve.marginKrw,
        gasBudgetKrw: reserve.gasBudgetKrw,
        operationsBudgetKrw: reserve.operationsBudgetKrw,
        purchasePriceKrw: reserve.purchasePriceKrw,
        faceValueKrw: product.faceValueKrw,
        hbtCost: requestedQuotedHbtCost,
        createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(
        db.collection("reward_reserve_metrics").doc(config.reserveDocId),
        {
            totalMarginKrw: FieldValue.increment(reserve.marginKrw),
            gasBudgetKrw: FieldValue.increment(reserve.gasBudgetKrw),
            operationsBudgetKrw: FieldValue.increment(reserve.operationsBudgetKrw),
            issuedCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
    await batch.commit();

    const finalSnap = await redemptionRef.get();
    return buildRewardMarketResult(finalSnap);
}

async function redeemRewardCoupon({
    db,
    FieldValue,
    HttpsError,
    uid,
    userData = {},
    config,
    sku,
    recipientPhone = "",
    quoteVersion = "",
    quoteSource = "",
    quotedPointCost = 0,
    clientRequestId = "",
    authPhoneNumber = "",
}) {
    const normalizedSku = normalizeSku(sku);
    if (!normalizedSku) {
        throw new HttpsError("invalid-argument", "교환할 상품을 선택해 주세요.");
    }

    const normalizedRequestId = normalizeClientRequestId(clientRequestId);
    if (!normalizedRequestId) {
        throw new HttpsError("invalid-argument", "교환 요청을 다시 시작해 주세요.");
    }

    const now = new Date();
    const pricing = await ensurePublishedPricing({ db, config, now });
    const reserveSummary = await loadRewardReserveSummary({ db, config });
    const bizmoney = await syncBizmoneyMetrics({ db, config, now, context: { userId: uid } });
    const usage = await loadIssuanceUsage({ db, now });
    const policy = buildIssuancePolicy({
        config,
        pricing,
        reserve: reserveSummary,
        limitSummary: buildLimitSummary(config, usage),
        bizmoney,
    });

    const catalog = await loadRewardCatalog({ db, config });
    const quotedCatalog = catalog
        .map((item) => quoteCatalogItem(item, pricing, config))
        .map((item) => buildCatalogAvailability(item, policy));
    const product = quotedCatalog.find((item) => item.sku === normalizedSku);

    if (!product) {
        throw new HttpsError("not-found", "선택한 보상 상품을 찾을 수 없어요.");
    }
    if (product.pointCost < config.minRedeemPoints) {
        throw new HttpsError(
            "failed-precondition",
            `${config.minRedeemPoints.toLocaleString("ko-KR")}P 이상 상품만 교환할 수 있어요.`
        );
    }

    const normalizedPhone = resolveRewardRecipientPhone({
        requestedPhone: recipientPhone,
        userData,
        authPhoneNumber,
    });
    const reserve = computeReserveBreakdown(product);
    const rewardName = `${product.brandName} ${product.displayName}`.trim();
    const quoteMatchesCurrent = !quoteVersion || String(quoteVersion).trim() === String(product.quoteVersion || "").trim();
    const requestedQuotedPointCost = quoteMatchesCurrent
        ? Math.max(parseNumber(quotedPointCost, product.pointCost), product.pointCost, config.minRedeemPoints)
        : product.pointCost;
    const effectiveQuoteVersion = quoteMatchesCurrent
        ? String(quoteVersion || product.quoteVersion || "").trim()
        : String(product.quoteVersion || "").trim();
    const effectiveQuoteSource = quoteMatchesCurrent
        ? String(quoteSource || product.quoteSource || "").trim()
        : String(product.quoteSource || "").trim();
    const effectiveQuotedAt = product.quotedAt || pricing.quotedAt || "";

    if (config.mode === "live" && !normalizedPhone) {
        throw new HttpsError("failed-precondition", "실발급에는 쿠폰 수령 연락처가 필요해요.");
    }

    const redemptionRef = db.collection("reward_redemptions").doc(buildRedemptionRequestDocId(uid, normalizedRequestId));
    const existingRedemptionSnap = await redemptionRef.get();
    if (existingRedemptionSnap.exists) {
        return {
            ...buildRewardMarketResult(existingRedemptionSnap),
            existing: true,
        };
    }

    if (!product.redeemable) {
        await redemptionRef.set(buildManualReviewDoc({
            uid,
            userData,
            product,
            config,
            reserve,
            normalizedPhone,
            providerTrId: buildProviderTrId(),
            reason: product.blockedReason || policy.blockedReason || "reward_redemption_blocked",
            errorMessage: product.blockedReason || policy.blockedReason || "reward_redemption_blocked",
            quoteVersion: effectiveQuoteVersion,
            quoteSource: effectiveQuoteSource,
            quotedAt: effectiveQuotedAt,
            pointCost: requestedQuotedPointCost,
            clientRequestId: normalizedRequestId,
        }), { merge: true });

        throw new HttpsError("failed-precondition", product.blockedReason || "현재는 이 쿠폰을 발급할 수 없어요.");
    }

    if (policy.lastBizmoneyBalanceKrw > 0 && (policy.lastBizmoneyBalanceKrw - reserve.purchasePriceKrw) < config.minBizmoneyKrw) {
        await redemptionRef.set(buildManualReviewDoc({
            uid,
            userData,
            product,
            config,
            reserve,
            normalizedPhone,
            providerTrId: buildProviderTrId(),
            reason: "bizmoney_below_operational_floor",
            errorMessage: "bizmoney_below_operational_floor",
            quoteVersion: effectiveQuoteVersion,
            quoteSource: effectiveQuoteSource,
            quotedAt: effectiveQuotedAt,
            pointCost: requestedQuotedPointCost,
            clientRequestId: normalizedRequestId,
        }), { merge: true });

        throw new HttpsError("failed-precondition", "비즈머니 운영 기준이 부족해 관제탑 확인이 필요해요.");
    }

    const providerTrId = buildProviderTrId();
    const userRef = db.collection("users").doc(uid);
    const reserveLedgerRef = createReserveLedgerRef(db);
    const shouldChargePointsNow = shouldChargePointsImmediately(config);
    let existingResult = null;
    await db.runTransaction(async (transaction) => {
        const [freshRedemptionSnap, freshUserSnap] = await Promise.all([
            transaction.get(redemptionRef),
            transaction.get(userRef),
        ]);
        if (freshRedemptionSnap.exists) {
            existingResult = buildRewardMarketResult(freshRedemptionSnap);
            return;
        }

        const freshUserData = freshUserSnap.data() || {};
        const currentPoints = Math.max(parseNumber(freshUserData.coins, 0), 0);
        if (currentPoints < requestedQuotedPointCost) {
            throw new HttpsError(
                "failed-precondition",
                `포인트가 부족해요. 현재 ${currentPoints.toLocaleString("ko-KR")}P예요.`
            );
        }

        transaction.set(redemptionRef, {
            userId: uid,
            sku: product.sku,
            brandName: product.brandName,
            displayName: product.displayName,
            category: product.category,
            provider: product.provider,
            providerGoodsId: product.providerGoodsId,
            providerTrId,
            status: "pending_issue",
            mode: config.mode,
            pricingMode: product.pricingMode || config.pricingMode,
            settlementAsset: config.settlementAsset || DEFAULT_SETTLEMENT_ASSET,
            clientRequestId: normalizedRequestId,
            quoteVersion: effectiveQuoteVersion,
            quoteSource: effectiveQuoteSource,
            quotedAt: effectiveQuotedAt || null,
            faceValueKrw: product.faceValueKrw,
            purchasePriceKrw: reserve.purchasePriceKrw,
            marginKrw: reserve.marginKrw,
            gasBudgetKrw: reserve.gasBudgetKrw,
            operationsBudgetKrw: reserve.operationsBudgetKrw,
            pointCost: requestedQuotedPointCost,
            hbtCost: requestedQuotedPointCost,
            deliveryMethod: product.deliveryMethod,
            deliveryMode: config.deliveryMode,
            fallbackPolicy: config.fallbackPolicy,
            healthGuide: product.healthGuide,
            productImageUrl: product.productImageUrl || "",
            brandLogoUrl: product.brandLogoUrl || "",
            recipientPhone: normalizedPhone,
            pointsCharged: shouldChargePointsNow,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            userLabel: String(userData.customDisplayName || userData.displayName || "회원").trim(),
        }, { merge: true });

        const userUpdate = {};
        if (shouldChargePointsNow) {
            userUpdate.coins = FieldValue.increment(-requestedQuotedPointCost);
        }
        if (normalizedPhone && normalizedPhone !== normalizeRecipientPhone(freshUserData.rewardRecipientPhone)) {
            userUpdate.rewardRecipientPhone = normalizedPhone;
        }
        if (Object.keys(userUpdate).length > 0) {
            transaction.set(userRef, userUpdate, { merge: true });
        }
    });

    if (existingResult) {
        return {
            ...existingResult,
            existing: true,
        };
    }

    let issuedCoupon = null;
    try {
        issuedCoupon = await issueCouponWithProvider({
            config,
            uid,
            product: { ...product, pointCost: requestedQuotedPointCost, hbtCost: requestedQuotedPointCost },
            rewardName,
            recipientPhone: normalizedPhone,
            providerTrId,
        });
    } catch (error) {
        const recoveredCoupon = await queryCouponStatusWithProvider({
            config,
            uid,
            product: { ...product, pointCost: requestedQuotedPointCost, hbtCost: requestedQuotedPointCost },
            rewardName,
            recipientPhone: normalizedPhone,
            providerTrId,
        }).catch(() => null);

        if (isUsableCouponPayload(recoveredCoupon)) {
            issuedCoupon = recoveredCoupon;
        } else {
            await redemptionRef.set(buildManualReviewDoc({
                uid,
                userData,
                product,
                config,
                reserve,
                normalizedPhone,
                providerTrId,
                reason: error?.code === "giftishow_timeout"
                    ? "giftishow_timeout_manual_review"
                    : "giftishow_issue_failed_manual_review",
                errorMessage: error?.message || "reward_issue_failed",
                quoteVersion: effectiveQuoteVersion,
                quoteSource: effectiveQuoteSource,
                quotedAt: effectiveQuotedAt,
                pointCost: requestedQuotedPointCost,
                clientRequestId: normalizedRequestId,
            }), { merge: true });
            throw new HttpsError("internal", "쿠폰 발급 응답이 불안정해 수동 확인 대상으로 넘겼어요.");
        }
    }

    if (!isUsableCouponPayload(issuedCoupon)) {
        await redemptionRef.set(buildManualReviewDoc({
            uid,
            userData,
            product,
            config,
            reserve,
            normalizedPhone,
            providerTrId,
            reason: "provider_coupon_payload_missing",
            errorMessage: "provider_coupon_payload_missing",
            quoteVersion: effectiveQuoteVersion,
            quoteSource: effectiveQuoteSource,
            quotedAt: effectiveQuotedAt,
            pointCost: requestedQuotedPointCost,
            clientRequestId: normalizedRequestId,
        }), { merge: true });
        throw new HttpsError("internal", "쿠폰 이미지나 PIN 정보를 확인하지 못해 수동 확인이 필요해요.");
    }

    const expiresAtDate = issuedCoupon?.expiresAt ? new Date(issuedCoupon.expiresAt) : null;
    const serializedExpiresAt = expiresAtDate && !Number.isNaN(expiresAtDate.getTime()) ? expiresAtDate : null;

    const batch = db.batch();
    batch.set(redemptionRef, {
        userId: uid,
        sku: product.sku,
        brandName: product.brandName,
        displayName: product.displayName,
        category: product.category,
        provider: product.provider,
        providerGoodsId: product.providerGoodsId,
        providerTrId,
        providerOrderId: issuedCoupon.providerOrderId,
        providerResponseCode: issuedCoupon.providerResponseCode || "",
        providerResponseMessage: issuedCoupon.providerResponseMessage || "",
        status: "issued",
        mode: config.mode,
        pricingMode: product.pricingMode || config.pricingMode,
        settlementAsset: config.settlementAsset || DEFAULT_SETTLEMENT_ASSET,
        clientRequestId: normalizedRequestId,
        quoteVersion: effectiveQuoteVersion,
        quoteSource: effectiveQuoteSource,
        quotedAt: effectiveQuotedAt || null,
        faceValueKrw: product.faceValueKrw,
        purchasePriceKrw: reserve.purchasePriceKrw,
        marginKrw: reserve.marginKrw,
        gasBudgetKrw: reserve.gasBudgetKrw,
        operationsBudgetKrw: reserve.operationsBudgetKrw,
        pointCost: requestedQuotedPointCost,
        hbtCost: requestedQuotedPointCost,
        deliveryMethod: issuedCoupon.deliveryMethod || product.deliveryMethod,
        deliveryMode: config.deliveryMode,
        fallbackPolicy: config.fallbackPolicy,
        pinCode: issuedCoupon.pinCode,
        couponImgUrl: issuedCoupon.couponImgUrl || issuedCoupon.barcodeUrl || "",
        barcodeUrl: issuedCoupon.barcodeUrl || issuedCoupon.couponImgUrl || "",
        healthGuide: product.healthGuide,
        productImageUrl: product.productImageUrl || "",
        brandLogoUrl: product.brandLogoUrl || "",
        recipientPhone: issuedCoupon.recipientPhone || normalizedPhone,
        pointsCharged: shouldChargePointsNow,
        issuedAt: FieldValue.serverTimestamp(),
        expiresAt: serializedExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
        userLabel: String(userData.customDisplayName || userData.displayName || "회원").trim(),
    }, { merge: true });
    batch.set(reserveLedgerRef, {
        userId: uid,
        redemptionId: redemptionRef.id,
        sku: product.sku,
        rewardName,
        eventType: "issued",
        mode: config.mode,
        pricingMode: product.pricingMode || config.pricingMode,
        settlementAsset: config.settlementAsset || DEFAULT_SETTLEMENT_ASSET,
        quoteVersion: effectiveQuoteVersion,
        marginKrw: reserve.marginKrw,
        gasBudgetKrw: reserve.gasBudgetKrw,
        operationsBudgetKrw: reserve.operationsBudgetKrw,
        purchasePriceKrw: reserve.purchasePriceKrw,
        faceValueKrw: product.faceValueKrw,
        pointCost: requestedQuotedPointCost,
        hbtCost: requestedQuotedPointCost,
        chargedPoints: shouldChargePointsNow ? requestedQuotedPointCost : 0,
        createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(
        db.collection("reward_reserve_metrics").doc(config.reserveDocId),
        {
            totalMarginKrw: FieldValue.increment(reserve.marginKrw),
            gasBudgetKrw: FieldValue.increment(reserve.gasBudgetKrw),
            operationsBudgetKrw: FieldValue.increment(reserve.operationsBudgetKrw),
            issuedCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
    await batch.commit();

    const finalSnap = await redemptionRef.get();
    return buildRewardMarketResult(finalSnap);
}

async function adminResendRewardCoupon({
    db,
    FieldValue,
    HttpsError,
    adminUid,
    config,
    redemptionId,
    reason = "",
    forceSms = false,
}) {
    const normalizedId = String(redemptionId || "").trim();
    const normalizedReason = String(reason || "").trim() || "manual_resend";
    if (!normalizedId) {
        throw new HttpsError("invalid-argument", "재확인할 쿠폰을 선택해 주세요.");
    }

    const redemptionRef = db.collection("reward_redemptions").doc(normalizedId);
    const redemptionSnap = await redemptionRef.get();
    if (!redemptionSnap.exists) {
        throw new HttpsError("not-found", "쿠폰 이력을 찾을 수 없어요.");
    }

    const redemption = serializeRedemptionDoc(redemptionSnap);
    const providerResult = await resendCouponWithProvider({
        config,
        uid: redemptionSnap.data()?.userId || "",
        redemption,
        reason: normalizedReason,
        forceSms,
    }).catch((error) => ({
        providerResponseCode: "",
        providerResponseMessage: String(error?.message || "manual_resend_failed"),
    }));

    const now = new Date();
    const nextManualResendCount = redemption.manualResendCount + 1;
    const nextStatus = isUsableCouponPayload(providerResult)
        ? "issued"
        : redemption.status === "cancelled"
            ? "cancelled"
            : redemption.status || "failed_manual_review";

    await redemptionRef.set({
        status: nextStatus,
        pinCode: providerResult?.pinCode || redemption.pinCode || "",
        couponImgUrl: providerResult?.couponImgUrl || providerResult?.barcodeUrl || redemption.couponImgUrl || redemption.barcodeUrl || "",
        barcodeUrl: providerResult?.barcodeUrl || providerResult?.couponImgUrl || redemption.barcodeUrl || redemption.couponImgUrl || "",
        expiresAt: providerResult?.expiresAt ? new Date(providerResult.expiresAt) : redemptionSnap.data()?.expiresAt || null,
        providerOrderId: providerResult?.providerOrderId || redemption.providerOrderId || "",
        providerResponseCode: providerResult?.providerResponseCode || "",
        providerResponseMessage: providerResult?.providerResponseMessage || "",
        lastManualResendAt: now,
        lastManualResendBy: adminUid,
        lastManualResendReason: normalizedReason,
        manualResendCount: nextManualResendCount,
        updatedAt: now,
    }, { merge: true });

    await db.collection("reward_reserve_ledger").add({
        redemptionId: normalizedId,
        userId: redemptionSnap.data()?.userId || "",
        eventType: "manual_resend",
        deliveryMode: redemption.deliveryMode || DEFAULT_DELIVERY_MODE,
        fallbackPolicy: redemption.fallbackPolicy || DEFAULT_FALLBACK_POLICY,
        reason: normalizedReason,
        forceSms: !!forceSms,
        adminUid,
        providerResponseCode: providerResult?.providerResponseCode || "",
        providerResponseMessage: providerResult?.providerResponseMessage || "",
        createdAt: FieldValue.serverTimestamp(),
    });

    const updatedSnap = await redemptionRef.get();
    return {
        ...buildRewardMarketResult(updatedSnap),
        manualResendCount: nextManualResendCount,
    };
}

async function syncRewardMarketOps({ db, config, now = new Date() }) {
    const pricing = await ensurePublishedPricing({ db, config, now });
    const bizmoney = await syncBizmoneyMetrics({
        db,
        config,
        now,
        context: { userId: "system" },
    });

    return {
        pricing,
        bizmoney,
        providerReady: config.providerReady,
        missingProviderConfig: [...config.missingProviderConfig],
    };
}

module.exports = {
    REWARD_MARKET_MIN_REDEMPTION_HBT,
    buildRewardMarketConfig,
    buildRewardMarketSnapshot,
    redeemRewardCoupon,
    dismissRewardCoupon,
    adminResendRewardCoupon,
    syncRewardMarketOps,
    __test: {
        buildRewardMarketConfig,
        normalizePricingMode,
        normalizeRecipientPhone,
        isValidRecipientPhone,
        resolveRewardRecipientPhone,
        buildPublishedPricing,
        buildLimitSummary,
        buildIssuancePolicy,
        quoteCatalogItem,
        buildCatalogAvailability,
        resolveCollectionItems,
        mapGiftishowGoodsItem,
        isPublicRewardCatalogItem,
        filterPublicRewardCatalogItems,
        callGiftishowApi,
        buildGiftishowHttpBody,
        resolveRewardValidityDays,
        buildMockIssuedCoupon,
        shouldChargePointsImmediately,
        shouldCountTowardIssuanceUsage,
        canDismissRewardRedemption,
        normalizeFeedData,
        computeRawKrwPerHbt,
        getKstDayKey,
        getKstWeekKey,
    },
};
