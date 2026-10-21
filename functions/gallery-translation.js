// 갤러리 글 자동 번역의 칸 고르기·지문·적용 (해외 3단계 E5-2, 2026-10-21 대표: "처음 볼 때 번역해 저장").
//
// 번역은 글 문서(gallery_posts)의 translations.{en|ko}[칸] = { s: 원문 지문, t: 번역 } 에 붙는다.
// - 원문이 바뀌면 지문이 달라져 그 번역은 쓰지 않는다(다시 번역한다).
// - 글이 다시 만들어질 때(기록 저장·공유 설정 변경) 원문이 그대로인 칸만 남긴다. 숨긴 글이나 지운 댓글의
//   번역이 문서에 남아 읽히면 안 되기 때문이다.
// 이 파일은 js/gallery-translation.js 를 서버용(CommonJS)으로 옮긴 것이다. 고칠 때는 두 파일을 함께 고친다
// (tests/gallery-translation.test.js 가 두 쪽 결과를 맞춰 본다).

const GALLERY_TRANSLATION_LOCALES = Object.freeze(['en', 'ko']);
const MAX_TRANSLATION_TEXT = 1000;
const MAX_TRANSLATION_ENTRIES = 200;
const DIET_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const DIET_TEXT_KEYS = ['summary', 'insulinComment', 'suggestion'];
const EXERCISE_TEXT_KEYS = ['exerciseType', 'timeAnalysis', 'feedback', 'formTip'];
const HANGUL = /[가-힣]/;
const LATIN_WORD = /[A-Za-z]{2,}/;

/** FNV-1a 32비트. 브라우저와 서버가 같은 값을 내야 한다. */
function hashText(text = '') {
    let hash = 0x811c9dc5;
    const value = String(text);
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/** 번역할 수 있는 글 칸. 이름(닉네임)·숫자·등급은 넣지 않는다. */
function collectGalleryTranslatableFields(post = {}) {
    const fields = [];
    const push = (key, value) => {
        const text = cleanText(value);
        if (text && text.length <= MAX_TRANSLATION_TEXT) fields.push({ key, text });
    };
    const diet = post?.dietAnalysis && typeof post.dietAnalysis === 'object' ? post.dietAnalysis : {};
    for (const slot of DIET_SLOTS) {
        const entry = diet[slot];
        if (!entry || typeof entry !== 'object') continue;
        for (const name of DIET_TEXT_KEYS) push(`dietAnalysis|${slot}|${name}`, entry[name]);
        (Array.isArray(entry.foods) ? entry.foods : []).forEach((food, index) => push(`dietAnalysis|${slot}|foods|${index}`, food?.name));
    }
    for (const listName of ['cardioList', 'strengthList']) {
        const list = Array.isArray(post?.exercise?.[listName]) ? post.exercise[listName] : [];
        list.forEach((item) => {
            const mediaId = cleanText(item?.mediaId);
            if (!mediaId || !item?.aiAnalysis) return;
            for (const name of EXERCISE_TEXT_KEYS) push(`exercise|${listName}|${mediaId}|${name}`, item.aiAnalysis[name]);
        });
    }
    const sleep = post?.sleepAndMind?.sleepAnalysis;
    if (sleep && typeof sleep === 'object') {
        push('sleep|summary', sleep.summary);
        push('sleep|sleepDuration', sleep.details?.sleepDuration);
        push('sleep|sleepQuality', sleep.details?.sleepQuality);
    }
    push('gratitude', post?.sleepAndMind?.gratitude);
    (Array.isArray(post?.comments) ? post.comments : []).forEach((comment) => {
        const id = cleanText(comment?.id);
        if (id) push(`comment|${id}`, comment.text);
    });
    return fields;
}

/** 보는 사람 언어와 글의 글자가 다를 때만 번역한다. 영어 화면은 한글이 든 글, 한국어 화면은 한글 없이 영어 낱말만 있는 글. */
function needsTranslation(text = '', locale = 'en') {
    const value = String(text);
    if (locale === 'ko') return !HANGUL.test(value) && LATIN_WORD.test(value);
    return HANGUL.test(value);
}

function readEntries(post, locale) {
    const entries = post?.translations?.[locale];
    return entries && typeof entries === 'object' && !Array.isArray(entries) ? entries : {};
}

/** 지금 원문과 지문이 맞는 번역만 { 칸: 번역 } 으로. */
function getValidTranslations(post = {}, locale = 'en') {
    const entries = readEntries(post, locale);
    const result = {};
    for (const { key, text } of collectGalleryTranslatableFields(post)) {
        const entry = entries[key];
        if (entry && typeof entry.t === 'string' && entry.s === hashText(text)) result[key] = entry.t;
    }
    return result;
}

/** 번역이 필요한데 아직 맞는 번역이 없는 칸. */
function pendingTranslationFields(post = {}, locale = 'en') {
    const valid = getValidTranslations(post, locale);
    return collectGalleryTranslatableFields(post)
        .filter(({ key, text }) => !(key in valid) && needsTranslation(text, locale));
}

/** 글이 다시 만들어질 때·댓글을 지울 때: 지금 글에 있고 원문이 그대로인 칸의 번역만 남긴다. 비면 null. */
function pruneGalleryTranslations(translations, post = {}) {
    if (!translations || typeof translations !== 'object') return null;
    const fields = collectGalleryTranslatableFields(post);
    const result = {};
    for (const locale of GALLERY_TRANSLATION_LOCALES) {
        const entries = translations[locale];
        if (!entries || typeof entries !== 'object') continue;
        const kept = {};
        let count = 0;
        for (const { key, text } of fields) {
            const entry = entries[key];
            if (count >= MAX_TRANSLATION_ENTRIES) break;
            if (!entry || typeof entry.t !== 'string' || entry.s !== hashText(text)) continue;
            kept[key] = { s: entry.s, t: entry.t.slice(0, MAX_TRANSLATION_TEXT) };
            count += 1;
        }
        if (count > 0) result[locale] = kept;
    }
    return Object.keys(result).length > 0 ? result : null;
}

/** 번역을 끼운 글 사본. 원문 글은 건드리지 않는다. */
function applyGalleryTranslations(post = {}, fields = {}) {
    const keys = Object.keys(fields || {});
    if (keys.length === 0) return post;
    const copy = JSON.parse(JSON.stringify(post));
    // Firestore Timestamp 같은 값은 JSON 으로 옮기면 모양이 바뀐다. 글자 칸만 바꾸고 나머지는 원래 값을 그대로 둔다.
    for (const name of ['timestamp', 'updatedAt']) if (post && name in post) copy[name] = post[name];
    if (Array.isArray(post?.comments)) {
        copy.comments = post.comments.map((comment) => {
            const translated = fields[`comment|${comment?.id}`];
            return translated ? { ...comment, text: translated } : comment;
        });
    }
    for (const key of keys) {
        const parts = key.split('|');
        if (parts[0] === 'dietAnalysis') {
            const entry = copy.dietAnalysis?.[parts[1]];
            if (!entry) continue;
            if (parts[2] === 'foods') {
                const food = entry.foods?.[Number(parts[3])];
                if (food) food.name = fields[key];
            } else {
                entry[parts[2]] = fields[key];
            }
        } else if (parts[0] === 'exercise') {
            const item = (copy.exercise?.[parts[1]] || []).find((candidate) => candidate?.mediaId === parts[2]);
            if (item?.aiAnalysis) item.aiAnalysis[parts[3]] = fields[key];
        } else if (parts[0] === 'sleep') {
            const sleep = copy.sleepAndMind?.sleepAnalysis;
            if (!sleep) continue;
            if (parts[1] === 'summary') sleep.summary = fields[key];
            else if (sleep.details) sleep.details[parts[1]] = fields[key];
        } else if (parts[0] === 'gratitude') {
            if (copy.sleepAndMind) copy.sleepAndMind.gratitude = fields[key];
        }
    }
    return copy;
}

module.exports = {
    GALLERY_TRANSLATION_LOCALES,
    MAX_TRANSLATION_TEXT,
    hashText,
    collectGalleryTranslatableFields,
    needsTranslation,
    getValidTranslations,
    pendingTranslationFields,
    pruneGalleryTranslations,
    applyGalleryTranslations,
};
