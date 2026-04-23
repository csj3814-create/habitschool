const crypto = require("crypto");

const REWARD_MARKET_MIN_REDEMPTION_HBT = 2000;
const REWARD_RESERVE_DOC_ID = "main";
const REWARD_PRICING_DOC_ID = "main";
const REWARD_MARKET_FEED_DOC_ID = "main";

const DEFAULT_REWARD_MARKET_MODE = "mock";
const DEFAULT_PRICING_MODE = "phase1_fixed_internal";
const DEFAULT_DELIVERY_MODE = "app_vault";
const DEFAULT_FALLBACK_POLICY = "manual_resend";
const DEFAULT_QUOTE_REFRESH_HOURS = 24;
const DEFAULT_DAILY_BAND_PCT = 10;
const DEFAULT_WEEKLY_BAND_PCT = 25;
const DEFAULT_FIXED_INTERNAL_KRW_PER_HBT = 1;
const DEFAULT_DAILY_LIMIT_HBT = 20000;
const DEFAULT_WEEKLY_LIMIT_HBT = 100000;
const DEFAULT_MONTHLY_LIMIT_HBT = 300000;
const DEFAULT_MIN_BIZMONEY_KRW = 30000;
const DEFAULT_GIFTISHOW_TIMEOUT_MS = 15000;
const DEFAULT_PHASE1_ENDS_AT = "2026-05-23T00:00:00+09:00";

const DEFAULT_REWARD_CATALOG = Object.freeze([
    {
        sku: "baemin-2000-salad",
        brandName: "배달의민족",
        displayName: "배민 상품권 2,000원",
        category: "meal",
        faceValueKrw: 2000,
        purchasePriceKrw: 1900,
        provider: "giftishow",
        providerGoodsId: "BAEMIN_2000",
        healthGuide: "배민 상품권으로 샐러드 맛집이나 건강식을 찾아보세요.",
        available: true,
        stockLabel: "테스트 등록",
        deliveryMethod: "pin",
        sortOrder: 10,
    },
    {
        sku: "marketkurly-5000-fresh",
        brandName: "마켓컬리",
        displayName: "마켓컬리 5,000원",
        category: "grocery",
        faceValueKrw: 5000,
        purchasePriceKrw: 4800,
        provider: "giftishow",
        providerGoodsId: "KURLY_5000",
        healthGuide: "마켓컬리에서 샐러드나 단백질 간식을 골라보세요.",
        available: true,
        stockLabel: "테스트 등록",
        deliveryMethod: "pin",
        sortOrder: 20,
    },
    {
        sku: "mega-2000-decaf",
        brandName: "메가커피",
        displayName: "메가커피 2,000원",
        category: "drink",
        faceValueKrw: 2000,
        purchasePriceKrw: 1900,
        provider: "giftishow",
        providerGoodsId: "MEGA_2000",
        healthGuide: "메가커피에서 디카페인이나 당을 줄인 옵션을 골라보세요.",
        available: true,
        stockLabel: "테스트 등록",
        deliveryMethod: "pin",
        sortOrder: 30,
    },
]);

function normalizeSku(value = "") {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function parseNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
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

function safeParseJsonObject(raw = "") {
    if (!String(raw || "").trim()) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

function normalizePricingMode(value = "") {
    return String(value || DEFAULT_PRICING_MODE).trim().toLowerCase() === "phase2_hybrid_band"
        ? "phase2_hybrid_band"
        : "phase1_fixed_internal";
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

function normalizeRewardCatalogItem(item = {}, fallbackSku = "") {
    const sku = normalizeSku(item.sku || item.providerGoodsId || fallbackSku || crypto.randomUUID());
    const reserve = computeReserveBreakdown(item);

    return {
        sku,
        brandName: String(item.brandName || item.brand || "해빛 마켓").trim(),
        displayName: String(item.displayName || item.name || sku).trim(),
        category: String(item.category || "general").trim(),
        faceValueKrw: reserve.faceValueKrw || REWARD_MARKET_MIN_REDEMPTION_HBT,
        purchasePriceKrw: reserve.purchasePriceKrw,
        provider: String(item.provider || "giftishow").trim(),
        providerGoodsId: String(item.providerGoodsId || item.goodsId || item.id || sku).trim(),
        healthGuide: String(
            item.healthGuide
            || item.healthCopy
            || "건강한 선택으로 보상을 생활 속 루틴과 연결해 보세요."
        ).trim(),
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

function resolveCollectionItems(payload = null) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.goods)) return payload.goods;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
    if (payload.data && Array.isArray(payload.data.goods)) return payload.data.goods;
    if (payload.result && Array.isArray(payload.result.items)) return payload.result.items;
    if (payload.result && Array.isArray(payload.result.goods)) return payload.result.goods;
    return [];
}

function mapGiftishowGoodsItem(raw = {}, index = 0) {
    const brandName = String(raw.brandName || raw.brandNm || raw.brand || "").trim();
    const displayName = String(raw.goodsName || raw.goodsNm || raw.name || raw.productName || "").trim();
    const providerGoodsId = String(raw.goodsId || raw.goodsNo || raw.goodsCd || raw.id || raw.productCode || "").trim();
    const faceValueKrw = Math.max(
        parseNumber(raw.faceValue, 0),
        parseNumber(raw.price, 0),
        parseNumber(raw.sellPrice, 0),
        parseNumber(raw.sellPriceAmt, 0),
        parseNumber(raw.cnsmPriceAmt, 0),
        parseNumber(raw.goodsPrice, 0)
    );
    const purchasePriceKrw = Math.max(
        parseNumber(raw.salePrice, 0),
        parseNumber(raw.buyPrice, 0),
        parseNumber(raw.purchasePrice, 0),
        parseNumber(raw.supplyPrice, 0),
        parseNumber(raw.sellPriceAmt, 0)
    );
    const stockQuantity = parseNumber(raw.stockQty, parseNumber(raw.stockQuantity, parseNumber(raw.stock, 0)));
    const soldOutFlag = String(raw.soldOut || raw.soldout || raw.stockYn || raw.saleYn || "").trim().toLowerCase();
    const available = soldOutFlag
        ? !["y", "soldout", "false", "0", "n"].includes(soldOutFlag)
        : stockQuantity !== 0;

    return normalizeRewardCatalogItem({
        sku: providerGoodsId || `${brandName}-${displayName}-${index + 1}`,
        brandName: brandName || "기프티쇼",
        displayName: displayName || `기프티쇼 상품 ${index + 1}`,
        category: String(raw.category || raw.lclsName || "general").trim(),
        faceValueKrw: faceValueKrw || REWARD_MARKET_MIN_REDEMPTION_HBT,
        purchasePriceKrw: purchasePriceKrw || faceValueKrw || REWARD_MARKET_MIN_REDEMPTION_HBT,
        provider: "giftishow",
        providerGoodsId,
        healthGuide: String(raw.healthGuide || "").trim(),
        available,
        stockLabel: stockQuantity > 0 ? `재고 ${stockQuantity}` : "재고 확인 필요",
        deliveryMethod: String(raw.deliveryMethod || raw.issueMethod || "pin").trim(),
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

    return {
        mode,
        pricingMode,
        minRedeemHbt: Math.max(
            parseNumber(env.REWARD_MARKET_MIN_REDEEM_HBT, REWARD_MARKET_MIN_REDEMPTION_HBT),
            REWARD_MARKET_MIN_REDEMPTION_HBT
        ),
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
        dailyLimitHbt: Math.max(parseNumber(env.REWARD_MARKET_DAILY_LIMIT_HBT, DEFAULT_DAILY_LIMIT_HBT), REWARD_MARKET_MIN_REDEMPTION_HBT),
        weeklyLimitHbt: Math.max(parseNumber(env.REWARD_MARKET_WEEKLY_LIMIT_HBT, DEFAULT_WEEKLY_LIMIT_HBT), REWARD_MARKET_MIN_REDEMPTION_HBT),
        monthlyLimitHbt: Math.max(parseNumber(env.REWARD_MARKET_MONTHLY_LIMIT_HBT, DEFAULT_MONTHLY_LIMIT_HBT), REWARD_MARKET_MIN_REDEMPTION_HBT),
        minBizmoneyKrw: Math.max(parseNumber(env.REWARD_MARKET_MIN_BIZMONEY_KRW, DEFAULT_MIN_BIZMONEY_KRW), 0),
        phase1EndsAt: String(env.REWARD_MARKET_PHASE1_ENDS_AT || DEFAULT_PHASE1_ENDS_AT).trim() || DEFAULT_PHASE1_ENDS_AT,

        baseUrl: String(env.GIFTISHOW_API_BASE_URL || "").trim().replace(/\/+$/, ""),
        goodsPath: String(env.GIFTISHOW_GOODS_PATH || "/goods").trim() || "/goods",
        goodsMethod: String(env.GIFTISHOW_GOODS_METHOD || "GET").trim().toUpperCase() || "GET",
        goodsBodyTemplate: safeParseJsonObject(env.GIFTISHOW_GOODS_BODY_JSON || ""),
        orderPath: String(env.GIFTISHOW_ORDER_PATH || "/order").trim() || "/order",
        orderMethod: String(env.GIFTISHOW_ORDER_METHOD || "POST").trim().toUpperCase() || "POST",
        orderBodyTemplate: safeParseJsonObject(env.GIFTISHOW_ORDER_BODY_JSON || ""),
        couponStatusPath: String(env.GIFTISHOW_COUPON_STATUS_PATH || "/coupons").trim() || "/coupons",
        couponStatusMethod: String(env.GIFTISHOW_COUPON_STATUS_METHOD || "POST").trim().toUpperCase() || "POST",
        couponStatusBodyTemplate: safeParseJsonObject(env.GIFTISHOW_COUPON_STATUS_BODY_JSON || ""),
        resendPath: String(env.GIFTISHOW_RESEND_PATH || "/resend").trim() || "/resend",
        resendMethod: String(env.GIFTISHOW_RESEND_METHOD || "POST").trim().toUpperCase() || "POST",
        resendBodyTemplate: safeParseJsonObject(env.GIFTISHOW_RESEND_BODY_JSON || ""),
        bizmoneyPath: String(env.GIFTISHOW_BIZMONEY_PATH || "/bizmoney").trim() || "/bizmoney",
        bizmoneyMethod: String(env.GIFTISHOW_BIZMONEY_METHOD || "POST").trim().toUpperCase() || "POST",
        bizmoneyBodyTemplate: safeParseJsonObject(env.GIFTISHOW_BIZMONEY_BODY_JSON || ""),
        headers: safeParseJsonObject(env.GIFTISHOW_API_HEADERS_JSON || ""),
        catalogLiveEnabled: String(env.GIFTISHOW_CATALOG_LIVE || "true").trim().toLowerCase() !== "false",
        timeoutMs: Math.max(parseNumber(env.GIFTISHOW_API_TIMEOUT_MS, DEFAULT_GIFTISHOW_TIMEOUT_MS), 1000),

        feedDocPath: String(env.REWARD_MARKET_FEED_DOC_PATH || "").trim(),
        pricingDocPath: String(env.REWARD_MARKET_PRICING_DOC_PATH || "").trim(),
        hbtUsdtTwap7d: parseNumber(env.REWARD_MARKET_HBT_USDT_TWAP_7D, 0),
        usdtKrw: parseNumber(env.REWARD_MARKET_USDT_KRW, 0),
        feedSource: String(env.REWARD_MARKET_FEED_SOURCE || "firestore").trim() || "firestore",
    };
}

const buildRewardMarketConfig = getRewardMarketConfig;

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
    const url = `${config.baseUrl}${endpointPath}`;
    const headers = {
        "Content-Type": "application/json",
        ...config.headers,
        ...(options.headers || {}),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("giftishow_timeout"), options.timeoutMs || config.timeoutMs);

    try {
        const response = await fetch(url, {
            method: options.method || "GET",
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
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

    const payload = await callGiftishowApi(config, config.goodsPath, {
        method: config.goodsMethod,
        body: config.goodsMethod === "GET"
            ? undefined
            : buildRequestPayload(config.goodsBodyTemplate, {}, {}),
    });

    return resolveCollectionItems(payload)
        .map((item, index) => mapGiftishowGoodsItem(item, index))
        .filter((item) => !!item.sku);
}

async function loadRewardCatalog({ db, config }) {
    const seededItems = buildFallbackCatalog();
    const seededBySku = new Map(seededItems.map((item) => [item.sku, item]));

    const liveItems = await loadGiftishowCatalog(config).catch(() => []);
    if (liveItems.length > 0) {
        return liveItems
            .map((item) => ({
                ...item,
                healthGuide: item.healthGuide || seededBySku.get(item.sku)?.healthGuide
                    || "건강한 선택으로 보상을 생활 속 루틴과 연결해 보세요.",
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder);
    }

    const catalogSnapshot = await db.collection("reward_catalog").get();
    if (catalogSnapshot.empty) {
        return seededItems;
    }

    return catalogSnapshot.docs
        .map((docSnap) => normalizeRewardCatalogItem(docSnap.data() || {}, docSnap.id))
        .sort((a, b) => a.sortOrder - b.sortOrder);
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
    const quotedHbtCost = publishedPricing.quoteState === "ready" && krwPerHbt > 0
        ? roundUpHbt(item.faceValueKrw / krwPerHbt)
        : Math.max(item.faceValueKrw, config.minRedeemHbt || REWARD_MARKET_MIN_REDEMPTION_HBT);

    return {
        ...item,
        hbtCost: quotedHbtCost,
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
    return {
        id: docSnap.id,
        sku: String(data.sku || "").trim(),
        brandName: String(data.brandName || "").trim(),
        displayName: String(data.displayName || "").trim(),
        category: String(data.category || "").trim(),
        provider: String(data.provider || "").trim(),
        providerGoodsId: String(data.providerGoodsId || "").trim(),
        hbtCost: parseNumber(data.hbtCost, 0),
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

    const body = config.bizmoneyMethod === "GET"
        ? undefined
        : buildRequestPayload(config.bizmoneyBodyTemplate, {}, context);
    const payload = await callGiftishowApi(config, config.bizmoneyPath, {
        method: config.bizmoneyMethod,
        body,
    });
    const unwrapped = unwrapNestedResult(payload);
    const balance = Math.max(
        parseNumber(payload?.balance, 0),
        parseNumber(payload?.data?.balance, 0),
        parseNumber(unwrapped?.balance, 0),
        parseNumber(unwrapped?.bizmoneyBalance, 0)
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

    const activeStatuses = new Set(["issued", "pending_issue", "failed_manual_review", "failed"]);
    const usage = {
        dailyHbt: 0,
        weeklyHbt: 0,
        monthlyHbt: 0,
        dailyCount: 0,
        weeklyCount: 0,
        monthlyCount: 0,
    };

    snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const status = String(data.status || "").trim();
        if (!activeStatuses.has(status)) return;

        const createdAtMs = toTimestampMillis(data.createdAt);
        if (!createdAtMs) return;

        const hbtCost = Math.max(parseNumber(data.hbtCost, 0), 0);
        if (createdAtMs >= monthStart.getTime()) {
            usage.monthlyHbt += hbtCost;
            usage.monthlyCount += 1;
        }
        if (createdAtMs >= weekStart.getTime()) {
            usage.weeklyHbt += hbtCost;
            usage.weeklyCount += 1;
        }
        if (createdAtMs >= dayStart.getTime()) {
            usage.dailyHbt += hbtCost;
            usage.dailyCount += 1;
        }
    });

    return usage;
}

function buildLimitSummary(config = {}, usage = {}) {
    const dailyRemainingHbt = Math.max(config.dailyLimitHbt - usage.dailyHbt, 0);
    const weeklyRemainingHbt = Math.max(config.weeklyLimitHbt - usage.weeklyHbt, 0);
    const monthlyRemainingHbt = Math.max(config.monthlyLimitHbt - usage.monthlyHbt, 0);

    return {
        daily: {
            limitHbt: config.dailyLimitHbt,
            usedHbt: usage.dailyHbt,
            remainingHbt: dailyRemainingHbt,
            count: usage.dailyCount,
        },
        weekly: {
            limitHbt: config.weeklyLimitHbt,
            usedHbt: usage.weeklyHbt,
            remainingHbt: weeklyRemainingHbt,
            count: usage.weeklyCount,
        },
        monthly: {
            limitHbt: config.monthlyLimitHbt,
            usedHbt: usage.monthlyHbt,
            remainingHbt: monthlyRemainingHbt,
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

    if (pricing.quoteState !== "ready") {
        issuanceEnabled = false;
        blockedReason = "가격 기준이 아직 준비되지 않았어요. 잠시 뒤 다시 시도해 주세요.";
    }

    const lastBizmoneyBalanceKrw = Math.max(
        parseNumber(bizmoney.balanceKrw, 0),
        parseNumber(reserve.lastBizmoneyBalanceKrw, 0)
    );

    if (issuanceEnabled && config.mode === "live" && lastBizmoneyBalanceKrw > 0 && lastBizmoneyBalanceKrw < config.minBizmoneyKrw) {
        issuanceEnabled = false;
        blockedReason = "비즈머니 잔액이 최소 운영 기준 아래예요. 관리자 확인이 필요해요.";
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

    if (item.available === false) {
        blockedReasons.push("현재 재고 확인이 필요해요.");
    }
    if (policy.issuanceEnabled === false) {
        blockedReasons.push(policy.blockedReason);
    }
    if ((limits.daily?.remainingHbt || 0) < item.hbtCost) {
        blockedReasons.push("오늘 교환 한도를 모두 사용했어요.");
    }
    if ((limits.weekly?.remainingHbt || 0) < item.hbtCost) {
        blockedReasons.push("이번 주 교환 한도를 모두 사용했어요.");
    }
    if ((limits.monthly?.remainingHbt || 0) < item.hbtCost) {
        blockedReasons.push("이번 달 교환 한도를 모두 사용했어요.");
    }
    if (policy.lastBizmoneyBalanceKrw > 0 && (policy.lastBizmoneyBalanceKrw - item.purchasePriceKrw) < policy.minBizmoneyKrw) {
        blockedReasons.push("비즈머니 운영 기준을 먼저 맞춰야 해요.");
    }

    return {
        ...item,
        redeemable: blockedReasons.length === 0,
        blockedReason: blockedReasons[0] || "",
    };
}

function buildRewardMarketSettings({ config, pricing, reserve, bizmoney, usage }) {
    const limitSummary = buildLimitSummary(config, usage);
    const policy = buildIssuancePolicy({
        config,
        pricing,
        reserve,
        limitSummary,
        bizmoney,
    });

    return {
        policy,
        settings: {
            mode: config.mode,
            minRedeemHbt: config.minRedeemHbt,
            requiresBurnTx: config.mode === "live",
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
        },
    };
}

async function buildRewardMarketSnapshot({ db, uid, config }) {
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
    const expiresAt = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();
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
            new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString()
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
    if (config.mode !== "live" || !config.baseUrl) {
        return buildMockIssuedCoupon(product, recipientPhone);
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
        body,
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
    if (config.mode !== "live" || !config.baseUrl || !config.couponStatusPath) {
        return null;
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
        body,
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
    if (config.mode !== "live" || !config.baseUrl) {
        return {
            providerResponseCode: "0000",
            providerResponseMessage: `mock_manual_resend:${reason || "manual_resend"}`,
        };
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
        body,
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
    burnHash,
    burnExplorerUrl,
    networkTag,
    providerTrId,
    reason,
    errorMessage,
    quoteVersion,
    quoteSource,
    quotedAt,
    hbtCost,
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
        quoteVersion,
        quoteSource,
        quotedAt,
        faceValueKrw: product.faceValueKrw,
        purchasePriceKrw: reserve.purchasePriceKrw,
        marginKrw: reserve.marginKrw,
        gasBudgetKrw: reserve.gasBudgetKrw,
        operationsBudgetKrw: reserve.operationsBudgetKrw,
        hbtCost,
        deliveryMethod: product.deliveryMethod,
        deliveryMode: config.deliveryMode,
        fallbackPolicy: config.fallbackPolicy,
        healthGuide: product.healthGuide,
        recipientPhone: normalizedPhone,
        burnTxHash: burnHash,
        burnExplorerUrl,
        network: networkTag,
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

async function redeemRewardCoupon({
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

    const normalizedPhone = normalizeRecipientPhone(recipientPhone);
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
    const reserveLedgerRef = db.collection("reward_reserve_ledger").doc();
    const txRecordRef = db.collection("blockchain_transactions").doc();
    const providerTrId = buildProviderTrId();

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
    };
}

module.exports = {
    REWARD_MARKET_MIN_REDEMPTION_HBT,
    buildRewardMarketConfig,
    buildRewardMarketSnapshot,
    redeemRewardCoupon,
    adminResendRewardCoupon,
    syncRewardMarketOps,
    __test: {
        normalizePricingMode,
        buildPublishedPricing,
        buildLimitSummary,
        buildIssuancePolicy,
        quoteCatalogItem,
        buildCatalogAvailability,
        normalizeFeedData,
        computeRawKrwPerHbt,
        getKstDayKey,
        getKstWeekKey,
    },
};
