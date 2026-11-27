/**
 * Client helpers for AI food, exercise, sleep/mind, blood-test, and step screenshot analysis.
 */

import { auth, functions } from './firebase-config.js?v=619';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { showToast } from './ui-helpers.js?v=619';
import { escapeHtml } from './security.js?v=619';
import { getLocale, isEnglishLocale, t } from './i18n.js?v=619';
import { WEEKLY_ACTIVITY_TARGET_MINUTES } from './le8-score.js?v=619';
import { DIET_CHECK_KEYS, countDayChecks, dietMealGrade, averageDietGrade } from './diet-checks.js?v=619';

const analyzeDietFn = httpsCallable(functions, 'analyzeDiet');
const analyzeExerciseFn = httpsCallable(functions, 'analyzeExercise');
// 큰 영상은 서버가 파일 API 에 올린 뒤 분석해 기본 70초를 넘길 수 있다 (functions 240초 — 앱은 그보다 조금 더 기다린다).
const analyzeExerciseVideoFn = httpsCallable(functions, 'analyzeExerciseVideo', { timeout: 245000 });
const analyzeSleepMindFn = httpsCallable(functions, 'analyzeSleepMind');
const analyzeBloodTestFn = httpsCallable(functions, 'analyzeBloodTest');
const analyzeStepScreenshotFn = httpsCallable(functions, 'analyzeStepScreenshot');
const analyzeBodyCompositionFn = httpsCallable(functions, 'analyzeBodyComposition');
const classifySharedHealthImageFn = httpsCallable(functions, 'classifySharedHealthImage');

function analysisLocalePayload(extra = {}) {
    return { ...extra, locale: getLocale() };
}

// "다시 분석" 때 회원이 적은 정정. 비었으면 아예 싣지 않는다 — 첫 분석의 요청은 그대로다.
// 서버도 300자에서 자른다(functions/runtime.js normalizeAnalysisCorrection).
export const ANALYSIS_CORRECTION_MAX_CHARS = 300;

function withCorrection(payload, correction) {
    const text = String(correction || '').trim().slice(0, ANALYSIS_CORRECTION_MAX_CHARS);
    return text ? { ...payload, correction: text } : payload;
}

function requireSignedIn(messageKey = 'auth.loginRequired') {
    if (auth.currentUser) return true;
    showToast(isEnglishLocale() ? t(messageKey) : '로그인이 필요합니다.');
    return false;
}

// 아는 실패는 사람 말로, 모르는 실패는 코드를 붙여서 내보낸다.
// 여기서 코드를 삼키면 "분석이 실패했대요"만 제보로 돌아오고, 토큰 만료인지
// 타임아웃인지 서버 오류인지 영영 가릴 수 없다.
const ANALYSIS_ERROR_KEYS = {
    'unauthenticated': 'analysis.signedOut',
    'deadline-exceeded': 'analysis.tooSlow',
    'resource-exhausted': 'analysis.busy',
    'unavailable': 'analysis.offline'
};

function analysisFailureMessage(error, fallback) {
    // Firebase callable 오류 코드는 'functions/deadline-exceeded' 형태로 온다.
    const code = String(error?.code || '').replace(/^functions\//, '').trim();
    const known = ANALYSIS_ERROR_KEYS[code];
    if (known) return t(known);
    return code ? `${fallback} (${code})` : fallback;
}

export async function requestSharedTargetClassification(imageUrl, context = {}) {
    if (!auth.currentUser || !imageUrl) return null;

    try {
        const result = await classifySharedHealthImageFn(analysisLocalePayload({
            imageUrl,
            fileName: String(context?.fileName || '').trim(),
            fileCount: Number(context?.fileCount || 0) || 0
        }));
        return result.data?.classification || null;
    } catch (error) {
        console.warn('Shared image classification failed:', error?.message || error);
        return null;
    }
}

/**
 * 서버에 있는 공유 파일로 분류한다. 폰이 사진을 줄여 다시 올리지 않는다.
 * fallback 이면 부르는 쪽이 예전처럼 사진을 보낸다(큰 파일, 낡은 함수, 일시적인 실패).
 * 마감선에 걸린 것은 이미 오래 기다린 것이다. 다시 돌리지 않고 회원이 고르게 한다.
 */
export async function requestSharedUploadClassification(sharedUploadId, context = {}) {
    if (!auth.currentUser || !sharedUploadId) return { classification: null, fallback: true };

    try {
        const result = await classifySharedHealthImageFn({
            sharedUploadId,
            fileCount: Number(context?.fileCount || 0) || 0
        });
        return {
            classification: result.data?.classification || null,
            fallback: result.data?.fallback === true
        };
    } catch (error) {
        const code = String(error?.code || '').replace(/^functions\//, '');
        console.warn('[shared-import] 서버 분류 실패:', code || error?.message || error);
        return { classification: null, fallback: code !== 'deadline-exceeded' };
    }
}

export async function requestSleepMindAnalysis(imageUrl, textData, analysisType, { correction = '' } = {}) {
    if (!requireSignedIn()) return null;

    try {
        const payload = withCorrection(analysisLocalePayload({ analysisType }), correction);
        if (imageUrl) payload.imageUrl = imageUrl;
        if (textData) payload.textData = textData;
        const result = await analyzeSleepMindFn(payload);
        return result.data.analysis;
    } catch (error) {
        console.error('Sleep/mind analysis error:', error);
        showToast(analysisFailureMessage(
            error,
            isEnglishLocale() ? t('toast.analysisFailed') : '수면/마음 분석 중 오류가 발생했습니다.'
        ));
        return null;
    }
}

export async function requestDietAnalysis(imageUrl, { correction = '' } = {}) {
    if (!requireSignedIn()) return null;
    if (!imageUrl) return null;

    try {
        const result = await analyzeDietFn(withCorrection(analysisLocalePayload({ imageUrl }), correction));
        return result.data.analysis;
    } catch (error) {
        console.error('Diet analysis error:', error);
        showToast(analysisFailureMessage(
            error,
            isEnglishLocale() ? t('toast.aiFailed') : 'AI 분석에 실패했습니다. 다시 시도해 주세요.'
        ));
        return null;
    }
}

export async function requestExerciseAnalysis(imageUrl, { correction = '' } = {}) {
    if (!requireSignedIn()) return null;
    if (!imageUrl) return null;

    try {
        const result = await analyzeExerciseFn(withCorrection(analysisLocalePayload({ imageUrl }), correction));
        return result.data.analysis;
    } catch (error) {
        console.error('Exercise analysis error:', error);
        showToast(analysisFailureMessage(
            error,
            isEnglishLocale() ? t('toast.aiFailed') : 'AI 분석에 실패했습니다. 다시 시도해 주세요.'
        ));
        return null;
    }
}

// 하이퍼랩스는 시간을 지운 영상이라 분(分)은 돌려주지 않는다. 종류·강도·자세만
// 온다. 시간은 사용자가 적고, 이 분석은 거기에 곱할 강도를 준다.
export async function requestExerciseVideoAnalysis(videoUrl, { correction = '' } = {}) {
    if (!requireSignedIn()) return null;
    if (!videoUrl) return null;

    try {
        const result = await analyzeExerciseVideoFn(withCorrection(analysisLocalePayload({ videoUrl }), correction));
        return result.data.analysis;
    } catch (error) {
        console.error('Exercise video analysis error:', error);
        showToast(analysisFailureMessage(
            error,
            isEnglishLocale() ? t('toast.aiFailed') : 'AI 분석에 실패했습니다. 다시 시도해 주세요.'
        ));
        return null;
    }
}

const DIET_GRADE_COLORS = Object.freeze({ S: '#1565C0', A: '#2E7D32', B: '#558B2F', C: '#F9A825', D: '#EF6C00', F: '#C62828' });

function dietText(en, key, ko, params) {
    return en ? t(key, params) : ko;
}

/**
 * 식단 분석 카드. 2판(체크 5개, 2026-11-20)은 새 카드로, 그 전에 저장된 기록은
 * 예전 카드(미량영양소 점수)로 그린다 — 예전 기록을 다시 계산할 근거가 없다.
 *
 * options.canFix: 기록 화면에서만 true. 「고치기」 단추를 그린다(갤러리에는 다시 분석이 없다).
 */
export function renderDietAnalysisResult(container, analysis, options = {}) {
    if (!container || !analysis) return;
    if (Number(analysis.version) === 2) {
        renderDietAnalysisV2(container, analysis, options);
        return;
    }
    renderLegacyDietAnalysisResult(container, analysis);
}

function dietFoodsHtml(analysis, en) {
    const categoryIcons = { natural: '🌿', processed: '🍳', ultraprocessed: '⚠️' };
    const categoryLabels = en
        ? { natural: t('diet.category.natural'), processed: t('diet.category.processed'), ultraprocessed: t('diet.category.ultraprocessed') }
        : { natural: '자연식품', processed: '가공식품', ultraprocessed: '초가공' };
    return (analysis.foods || []).map((food) => {
        const category = String(food?.category || '').trim();
        const icon = categoryIcons[category] || '🍽️';
        const label = categoryLabels[category] || (en ? t('diet.category.other') : '기타');
        return `<div class="diet-food-item">
            <span class="diet-food-icon">${icon}</span>
            <span class="diet-food-name">${escapeHtml(food?.name || '')}</span>
            <span class="diet-food-cat" data-cat="${escapeHtml(category)}">${escapeHtml(label)}</span>
        </div>`;
    }).join('');
}

const DIET_CHECK_ICONS = Object.freeze({ vegetables: '🥬', protein: '🍗', ultraprocessed: '🚫', carbs: '🍚', sodium: '🧂' });

function dietCheckLabel(key, en) {
    const ko = { vegetables: '채소', protein: '단백질', ultraprocessed: '초가공', carbs: '탄수화물', sodium: '나트륨' };
    return en ? t(`diet.check.${key}`) : ko[key];
}

/** 등급 아래 한 줄: 무엇 때문에 이 등급인지. */
function dietGradeReason(analysis, en) {
    const failed = DIET_CHECK_KEYS.filter((key) => analysis.checks?.[key] !== true);
    if (failed.length === 0) return dietText(en, 'diet.reason.allPass', '체크 5개를 모두 통과했어요');
    if (failed.length === 1) {
        const key = failed[0];
        if (key === 'carbs') {
            return analysis.carbsAmount === 'large'
                ? dietText(en, 'diet.reason.oneFix.carbsLess', '밥·면 양만 줄이면 S예요')
                : dietText(en, 'diet.reason.oneFix.carbsWhole', '잡곡으로 바꾸면 S예요');
        }
        const ko = {
            vegetables: '채소만 더하면 S예요',
            protein: '단백질 반찬만 더하면 S예요',
            ultraprocessed: '초가공식품만 빼면 S예요',
            sodium: '짠 음식만 줄이면 S예요'
        };
        return dietText(en, `diet.reason.oneFix.${key}`, ko[key]);
    }
    const names = failed.map((key) => dietCheckLabel(key, en)).join(' · ');
    return dietText(en, 'diet.reason.missing', `아쉬운 점: ${names}`, { names });
}

/** 3칸 막대 (단백질 없음/조금/충분, 나트륨 낮음/보통/높음) */
function dietLevelHtml({ title, value, levels, labels, color, note }) {
    const index = levels.indexOf(value);
    if (index < 0) return '';
    const cells = levels.map((_, i) => `<span${i === index ? ` style="background:${color};"` : ''}></span>`).join('');
    return `<div class="diet-level">
        <div class="diet-level-head"><span>${title}</span><span class="diet-level-value" style="color:${color};">${escapeHtml(labels[index])}${note ? ` · ${escapeHtml(note)}` : ''}</span></div>
        <div class="diet-level-bar">${cells}</div>
        <div class="diet-level-scale">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}</div>
    </div>`;
}

function renderDietAnalysisV2(container, analysis, { canFix = false } = {}) {
    const en = isEnglishLocale();
    const isMeal = analysis.mealType === 'meal';
    const foodsHtml = dietFoodsHtml(analysis, en);

    let headHtml;
    let checksHtml = '';
    if (isMeal) {
        // 저장된 글자가 아니라 체크 수로 정한다(5=S … 0=F). 11-21~23 분석은 예전 표로 적혀 있다.
        const grade = dietMealGrade(analysis) || 'F';
        const gradeLabels = en
            ? { S: t('diet.grade.S'), A: t('diet.grade.A'), B: t('diet.grade.B'), C: t('diet.grade.C'), D: t('diet.grade.D'), F: t('diet.grade.F') }
            : { S: '만점', A: '우수', B: '양호', C: '보통', D: '개선 필요', F: '위험' };
        const count = Number(analysis.checkCount) || 0;
        headHtml = `<div class="diet-grade-row">
            <div class="diet-grade-badge" style="background:${DIET_GRADE_COLORS[grade]};">${escapeHtml(grade)}</div>
            <div class="diet-grade-info">
                <div class="diet-grade-label">${escapeHtml(gradeLabels[grade])} · ${dietText(en, 'diet.checkCount', `체크 ${count}/5`, { n: count })}</div>
                <div class="diet-grade-summary">${escapeHtml(dietGradeReason(analysis, en))}</div>
            </div>
        </div>`;
        checksHtml = `<div class="diet-checks">${DIET_CHECK_KEYS.map((key) => {
            const ok = analysis.checks?.[key] === true;
            return `<div class="diet-check ${ok ? 'pass' : 'fail'}">
                <span class="diet-check-icon">${DIET_CHECK_ICONS[key]}</span>
                <span class="diet-check-mark">${ok ? '✓' : '✕'}</span>
                <span class="diet-check-label">${escapeHtml(dietCheckLabel(key, en))}</span>
            </div>`;
        }).join('')}</div>`;
    } else {
        const good = analysis.snackVerdict === 'good';
        const isDrink = analysis.mealType === 'drink';
        const label = good
            ? (isDrink ? dietText(en, 'diet.snack.goodDrink', '좋은 음료') : dietText(en, 'diet.snack.good', '좋은 간식'))
            : (isDrink ? dietText(en, 'diet.snack.mehDrink', '아쉬운 음료') : dietText(en, 'diet.snack.meh', '아쉬운 간식'));
        headHtml = `<div class="diet-grade-row">
            <div class="diet-grade-badge diet-snack-badge ${good ? 'good' : 'meh'}">${isDrink ? '🥤' : (good ? '🍎' : '🍪')}</div>
            <div class="diet-grade-info">
                <div class="diet-grade-label">${escapeHtml(label)}</div>
                <div class="diet-grade-summary">${dietText(en, 'diet.snack.rule', '간식은 등급 대신 두 가지만 봐요')}</div>
            </div>
        </div>`;
        const noUltra = !(analysis.foods || []).some((food) => food?.category === 'ultraprocessed');
        const sweetKo = { low: '거의 없음', moderate: '적당', high: '강함' };
        const sweet = analysis.sweetness;
        checksHtml = `<div class="diet-snack-rows">
            <div class="diet-snack-row ${noUltra ? 'pass' : 'fail'}"><span>${noUltra ? '✓' : '✕'}</span><span class="diet-snack-name">🚫 ${dietText(en, 'diet.check.ultraprocessed', '초가공')}</span><span>${noUltra ? dietText(en, 'diet.snack.none', '없음') : dietText(en, 'diet.snack.some', '있음')}</span></div>
            ${sweet ? `<div class="diet-snack-row ${sweet === 'high' ? 'fail' : 'pass'}"><span>${sweet === 'high' ? '✕' : '✓'}</span><span class="diet-snack-name">🍬 ${dietText(en, 'diet.snack.sweetness', '단맛')}</span><span>${escapeHtml(dietText(en, `diet.sweet.${sweet}`, sweetKo[sweet]))}</span></div>` : ''}
        </div>`;
    }

    const proteinLabels = en
        ? [t('diet.level.none'), t('diet.level.some'), t('diet.level.enough')]
        : ['없음', '조금', '충분'];
    const sodiumLabels = en
        ? [t('diet.level.low'), t('diet.level.normal'), t('diet.level.high')]
        : ['낮음', '보통', '높음'];
    const grams = Number.isFinite(Number(analysis.proteinGramsMin)) && Number.isFinite(Number(analysis.proteinGramsMax)) && analysis.proteinGramsMax > 0
        ? (en ? t('diet.proteinGrams', { min: analysis.proteinGramsMin, max: analysis.proteinGramsMax }) : `약 ${analysis.proteinGramsMin}~${analysis.proteinGramsMax}g`)
        : '';
    const proteinColors = { none: '#E57373', some: '#FFB74D', enough: '#7CB342' };
    const sodiumColors = { low: '#7CB342', normal: '#FFB74D', high: '#E57373' };
    const levelsHtml = isMeal ? [
        dietLevelHtml({
            title: `🍗 ${dietCheckLabel('protein', en)}`,
            value: analysis.proteinLevel,
            levels: ['none', 'some', 'enough'],
            labels: proteinLabels,
            color: proteinColors[analysis.proteinLevel] || '#999',
            note: grams
        }),
        dietLevelHtml({
            title: `🧂 ${dietCheckLabel('sodium', en)}`,
            value: analysis.sodiumLevel,
            levels: ['low', 'normal', 'high'],
            labels: sodiumLabels,
            color: sodiumColors[analysis.sodiumLevel] || '#999',
            note: analysis.sodiumSources || ''
        })
    ].join('') : '';

    const chips = [];
    if (isMeal && analysis.carbsNote) {
        const amountKo = { small: '적게', moderate: '적당', large: '많이' };
        const amount = analysis.carbsAmount ? dietText(en, `diet.carbsAmount.${analysis.carbsAmount}`, amountKo[analysis.carbsAmount]) : '';
        chips.push(`🍚 ${escapeHtml(analysis.carbsNote)}${amount ? ` · ${escapeHtml(amount)}` : ''}`);
    }
    if (Number.isFinite(Number(analysis.colorCount)) && analysis.colorCount > 0) {
        chips.push(`🎨 ${dietText(en, 'diet.colorCount', `색깔 ${analysis.colorCount}가지`, { n: analysis.colorCount })}`);
    }
    if (Number.isFinite(Number(analysis.fiberGrams)) && analysis.fiberGrams > 0) {
        chips.push(`🌾 ${dietText(en, 'diet.fiberGrams', `섬유질 약 ${analysis.fiberGrams}g`, { n: analysis.fiberGrams })}`);
    }
    const chipsHtml = chips.length ? `<div class="diet-chips">${chips.map((chip) => `<span class="diet-chip">${chip}</span>`).join('')}</div>` : '';

    const fixHtml = canFix
        ? `<button type="button" class="diet-fix-btn">✏️ ${dietText(en, 'diet.fix', '음식이 틀렸나요? 고치기')}</button>`
        : '';

    container.innerHTML = `
        <div class="diet-analysis-card diet-analysis-v2">
            ${headHtml}
            ${checksHtml}
            ${analysis.suggestion ? `<div class="diet-suggestion-box">💬 ${escapeHtml(analysis.suggestion)}</div>` : ''}
            <div class="diet-v2-section">
                <div class="diet-foods-list">${foodsHtml}</div>
                ${fixHtml}
            </div>
            ${levelsHtml || chipsHtml ? `<div class="diet-v2-section">${levelsHtml}${chipsHtml}</div>` : ''}
            ${analysis.insulinComment ? `<div class="diet-insight-box">
                <div class="diet-insight-icon">💡</div>
                <div class="diet-insight-text">
                    <div class="diet-insight-label">${dietText(en, 'diet.glucoseNote', '혈당 한마디')}</div>
                    <div>${escapeHtml(analysis.insulinComment)}</div>
                </div>
            </div>` : ''}
        </div>`;
    container.style.display = 'block';
}

function renderLegacyDietAnalysisResult(container, analysis) {
    const en = isEnglishLocale();
    const gradeColors = {
        A: '#2E7D32',
        B: '#558B2F',
        C: '#F9A825',
        D: '#EF6C00',
        F: '#C62828'
    };
    const gradeLabels = en
        ? { A: t('diet.grade.A'), B: t('diet.grade.B'), C: t('diet.grade.C'), D: t('diet.grade.D'), F: t('diet.grade.F') }
        : { A: '최우수', B: '양호', C: '보통', D: '개선 필요', F: '위험' };
    const categoryIcons = { natural: '🌿', processed: '🍳', ultraprocessed: '⚠️' };
    const categoryLabels = en
        ? { natural: t('diet.category.natural'), processed: t('diet.category.processed'), ultraprocessed: t('diet.category.ultraprocessed') }
        : { natural: '자연식품', processed: '가공식품', ultraprocessed: '초가공' };

    const grade = analysis.grade || 'C';
    const gradeColor = gradeColors[grade] || '#888';
    const foodsHtml = (analysis.foods || []).map((food) => {
        const category = String(food?.category || '').trim();
        const icon = categoryIcons[category] || '🍽️';
        const label = categoryLabels[category] || (en ? t('diet.category.other') : '기타');
        return `<div class="diet-food-item">
            <span class="diet-food-icon">${icon}</span>
            <span class="diet-food-name">${escapeHtml(food?.name || '')}</span>
            <span class="diet-food-cat" data-cat="${escapeHtml(category)}">${escapeHtml(label)}</span>
        </div>`;
    }).join('');

    const scores = analysis.scores || {};
    const scoreItems = [
        { key: 'vitamins', label: `💊 ${en ? t('diet.score.vitamins') : '비타민'}`, color: '#FF9800' },
        { key: 'minerals', label: `⚙️ ${en ? t('diet.score.minerals') : '무기질'}`, color: '#2196F3' },
        { key: 'fiber', label: `🌾 ${en ? t('diet.score.fiber') : '식이섬유'}`, color: '#4CAF50' },
        { key: 'antioxidants', label: `🛡️ ${en ? t('diet.score.antioxidants') : '항산화'}`, color: '#9C27B0' }
    ];
    const scoresHtml = scoreItems.map((item) => {
        const value = Math.max(0, Math.min(100, Number(scores[item.key] || 0)));
        return `<div class="diet-score-row">
            <span class="diet-score-label">${item.label}</span>
            <div class="diet-score-bar-bg">
                <div class="diet-score-bar-fill" style="width:${value}%; background:${item.color};"></div>
            </div>
            <span class="diet-score-val">${value}</span>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="diet-analysis-card">
            <div class="diet-grade-row">
                <div class="diet-grade-badge" style="background:${gradeColor};">${escapeHtml(grade)}</div>
                <div class="diet-grade-info">
                    <div class="diet-grade-label">${escapeHtml(gradeLabels[grade] || '')}</div>
                    <div class="diet-grade-summary">${escapeHtml(analysis.summary || '')}</div>
                </div>
            </div>
            <div class="diet-natural-ratio">
                <span>🌿 ${en ? t('diet.naturalRatio') : '자연식품 비율'}</span>
                <div class="diet-ratio-bar-bg">
                    <div class="diet-ratio-bar-fill" style="width:${Math.max(0, Math.min(100, Number(analysis.naturalRatio || 0)))}%;"></div>
                </div>
                <span class="diet-ratio-val">${Number(analysis.naturalRatio || 0)}%</span>
            </div>
            <div class="diet-foods-list">${foodsHtml}</div>
            <div class="diet-scores-section">
                <div class="diet-scores-title">${en ? t('diet.micronutrientScore') : '미량영양소 점수'}</div>
                ${scoresHtml}
            </div>
            <div class="diet-insight-box">
                <div class="diet-insight-icon">💡</div>
                <div class="diet-insight-text">
                    <div class="diet-insight-label">${en ? t('diet.insulinImpact') : '인슐린 대사 영향'}</div>
                    <div>${escapeHtml(analysis.insulinComment || '')}</div>
                </div>
            </div>
            ${analysis.suggestion ? `<div class="diet-suggestion-box">💬 ${escapeHtml(analysis.suggestion)}</div>` : ''}
        </div>`;
    container.style.display = 'block';
}

export function renderDietDaySummary(container, analyses) {
    if (!container || !analyses || analyses.length === 0) {
        if (container) container.style.display = 'none';
        return;
    }

    const valid = analyses.filter((analysis) => analysis && analysis.grade);
    if (valid.length === 0) {
        container.style.display = 'none';
        return;
    }

    const en = isEnglishLocale();
    const avgNatural = Math.round(valid.reduce((sum, item) => (
        sum + Number(item.naturalRatio || 0)
    ), 0) / valid.length);
    const ultraCount = valid.reduce((count, item) => (
        count + (item.foods || []).filter((food) => food.category === 'ultraprocessed').length
    ), 0);
    const avgGrade = averageDietGrade(valid) || 'C';
    const gradeColors = DIET_GRADE_COLORS;
    const ultraText = ultraCount > 0
        ? (en ? t('diet.daySummary.ultra', { count: ultraCount }) : `초가공 ${ultraCount}개`)
        : (en ? t('diet.daySummary.noUltra') : '초가공 없음');

    // 2판 식사가 있으면 오늘 끼니 중 채소·단백질을 챙긴 끼니 수를 함께 보여 준다.
    const today = countDayChecks(analyses);
    const checksText = today.meals > 0
        ? (en
            ? t('diet.daySummary.checks', { veg: today.checks.vegetables, protein: today.checks.protein, meals: today.meals })
            : `오늘 채소 ${today.checks.vegetables}/${today.meals}끼 · 단백질 ${today.checks.protein}/${today.meals}끼`)
        : '';

    container.innerHTML = `
        <div class="diet-day-summary">
            <div class="diet-day-grade" style="background:${gradeColors[avgGrade]};">${avgGrade}</div>
            <div class="diet-day-stats">
                <span>🌿 ${en ? t('diet.daySummary.wholeFoods', { value: avgNatural }) : `자연식품 ${avgNatural}%`}</span>
                <span>${ultraCount > 0 ? '⚠️' : '✅'} ${escapeHtml(ultraText)}</span>
                ${checksText ? `<span class="diet-day-checks">📅 ${escapeHtml(checksText)}</span>` : ''}
            </div>
        </div>`;
    container.style.display = 'block';
}

/**
 * 문장에 남은 반복 횟수를 지운다. functions/runtime.js 의 같은 이름 함수와
 * **같은 규칙**이어야 한다(tests/exercise-video-analysis 가 둘을 같은 예로 돌려
 * 대조한다).
 *
 * 서버는 오늘부터 오는 응답을 막고, 이것은 **이미 저장된 기록**을 맡는다.
 * 2026-09-19 이전 영상에는 "런지 · 약 3회" 같은 문장이 그대로 남아 있고,
 * 그 숫자가 틀렸다는 것이 이 기능을 뺀 이유다. 백필 대신 그리는 자리에서
 * 지운다 — 기록 화면과 갤러리가 이 함수 하나를 함께 쓴다.
 */
function stripRepCounts(value) {
    if (!value) return value;
    return String(value)
        .replace(/(약\s*)?\d+\s*회(씩)?/g, '')
        .replace(/(about\s+)?\d+\s*reps?/gi, '')
        .replace(/\s*[·,]\s*(?=[·,]|$)/g, '')
        .replace(/^\s*[·,]\s*/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export function renderExerciseAnalysisResult(analysis, container) {
    if (!container || !analysis) return;

    const en = isEnglishLocale();

    // 운동 사진이 아니라고 판단한 경우. 강도 배지를 붙이면 안 된다 —
    // 배지는 "이만큼 운동했다"는 말인데 여기엔 그런 근거가 없다.
    if (analysis.isExercise === false) {
        container.innerHTML = `
            <div class="diet-analysis-card" style="border-left: 4px solid #9E9E9E;">
                <div class="diet-insight-box">
                    <div class="diet-insight-icon">🤔</div>
                    <div class="diet-insight-text">
                        <div class="diet-insight-label">${en ? 'Not a workout photo' : '운동 사진으로 보이지 않아요'}</div>
                        <div>${escapeHtml(analysis.feedback || (en
                            ? 'Nothing in this photo reads as exercise.'
                            : '운동 기록으로 볼 만한 것이 사진에 없습니다.'))}</div>
                    </div>
                </div>
                ${analysis.timeAnalysis ? `<div style="font-size:12px; color:#777; margin-top:8px;">${escapeHtml(stripRepCounts(analysis.timeAnalysis))}</div>` : ''}
            </div>`;
        container.style.display = 'block';
        return;
    }
    const intensityColors = {
        '저강도': '#2196F3',
        '중강도': '#4CAF50',
        '고강도': '#FF9800',
        '초고강도': '#F44336'
    };
    const intensityLabels = {
        '저강도': t('exercise.intensity.low'),
        '중강도': t('exercise.intensity.moderate'),
        '고강도': t('exercise.intensity.high'),
        '초고강도': t('exercise.intensity.veryHigh')
    };
    const intensity = analysis.intensity || '중강도';
    const displayIntensity = en ? (intensityLabels[intensity] || intensity) : intensity;
    // 자는 하나다 — 주 150분. 하루 30분짜리 별도 달성률을 여기서 또 그리면,
    // 같은 사람이 운동 탭 막대와 이 카드에서 다른 숫자를 보고 어느 쪽을 믿을지
    // 모르게 된다. 이 카드는 '이번 운동이 주간 목표에 얼마를 보탰나'만 말한다.
    const weightedMinutes = Number(analysis.weightedMinutes);
    const hasMinutes = Number.isFinite(weightedMinutes) && weightedMinutes > 0;
    const weeklyShare = hasMinutes
        ? Math.min(100, Math.round((weightedMinutes / WEEKLY_ACTIVITY_TARGET_MINUTES) * 100))
        : 0;
    const shareColor = weeklyShare >= 50 ? '#4CAF50' : weeklyShare >= 20 ? '#FF9800' : '#2196F3';
    const weeklyContribution = hasMinutes
        ? `
            <div class="diet-natural-ratio" style="margin-top: 12px;">
                <span>🎯 ${en
                    ? `${weightedMinutes} min toward this week's ${WEEKLY_ACTIVITY_TARGET_MINUTES}`
                    : `주 ${WEEKLY_ACTIVITY_TARGET_MINUTES}분 목표에 ${weightedMinutes}분 적립`}</span>
                <div class="diet-ratio-bar-bg">
                    <div class="diet-ratio-bar-fill" style="width:${weeklyShare}%; background:${shareColor};"></div>
                </div>
                <span class="diet-ratio-val" style="color:${shareColor}; font-weight:bold;">${weeklyShare}%</span>
            </div>`
        : '';
    // 반복 횟수는 보여 주지 않는다. 하이퍼랩스 영상에서 센 숫자는 실제와 크게
    // 어긋난다 — 70회가 3회로 나온 제보가 2026-09-19 에 있었다.
    const exerciseType = analysis.exerciseType
        ? `<div style="font-size:12px; color:#555; margin-top:4px;">${en ? t('exercise.type') : '인식'}: ${escapeHtml(analysis.exerciseType)}</div>`
        : '';
    const formTip = analysis.formTip
        ? `<div class="diet-suggestion-box" style="margin-top:10px;">💬 ${escapeHtml(stripRepCounts(analysis.formTip))}</div>`
        : '';

    container.innerHTML = `
        <div class="diet-analysis-card" style="border-left: 4px solid ${intensityColors[intensity] || '#4CAF50'};">
            <div class="diet-grade-row">
                <div class="diet-grade-badge exercise-intensity-badge" style="background:${intensityColors[intensity] || '#4CAF50'};">${escapeHtml(displayIntensity)}</div>
                <div class="diet-grade-info">
                    <div class="diet-grade-label">${en ? t('exercise.intensityTitle') : '운동 강도 분석'}</div>
                    <div class="diet-grade-summary">${escapeHtml(stripRepCounts(analysis.timeAnalysis) || '')}</div>
                    ${exerciseType}
                </div>
            </div>
            ${weeklyContribution}
            <div class="diet-insight-box" style="margin-top: 12px;">
                <div class="diet-insight-icon">🏋️</div>
                <div class="diet-insight-text">
                    <div class="diet-insight-label">${en ? t('exercise.coachFeedback') : 'AI 트레이너 피드백'}</div>
                    <div>${escapeHtml(stripRepCounts(analysis.feedback) || '')}</div>
                </div>
            </div>
            ${formTip}
        </div>`;
    container.style.display = 'block';
}

export function renderSleepMindAnalysisResult(analysis, container) {
    if (!container || !analysis) return;

    const en = isEnglishLocale();
    const gradeColors = {
        A: '#2E7D32',
        B: '#558B2F',
        C: '#F9A825',
        D: '#EF6C00',
        F: '#C62828'
    };
    const gradeEmoji = { A: '😊', B: '🙂', C: '😐', D: '😟', F: '😢' };
    const typeLabel = analysis.type === 'sleep'
        ? `🌙 ${en ? t('mind.sleepAnalysis') : '수면 분석'}`
        : `🧘 ${en ? t('mind.mindAnalysis') : '마음 분석'}`;
    const grade = analysis.grade || 'C';
    const gradeColor = gradeColors[grade] || '#888';
    const details = analysis.details || {};
    let detailsHtml = '';
    if (details.sleepDuration) detailsHtml += `<div style="font-size:13px;">⏱️ ${en ? t('mind.sleepDuration') : '수면 시간'}: <strong>${escapeHtml(details.sleepDuration)}</strong></div>`;
    if (details.sleepQuality) detailsHtml += `<div style="font-size:13px;">💤 ${en ? t('mind.sleepQuality') : '수면 질'}: ${escapeHtml(details.sleepQuality)}</div>`;
    if (details.emotionTone) detailsHtml += `<div style="font-size:13px;">💭 ${en ? t('mind.emotionTone') : '감정 톤'}: <strong>${escapeHtml(details.emotionTone)}</strong></div>`;
    if (details.stressLevel) detailsHtml += `<div style="font-size:13px;">⚡ ${en ? t('mind.stressLevel') : '스트레스'}: <strong>${escapeHtml(details.stressLevel)}</strong></div>`;

    container.innerHTML = `
        <div class="diet-analysis-card" style="border-left: 4px solid ${gradeColor};">
            <div class="diet-grade-row">
                <div class="diet-grade-badge" style="background:${gradeColor}; font-size: 16px;">${gradeEmoji[grade] || '🧘'} ${escapeHtml(grade)}</div>
                <div class="diet-grade-info">
                    <div class="diet-grade-label">${typeLabel}</div>
                    <div class="diet-grade-summary">${escapeHtml(analysis.summary || '')}</div>
                </div>
            </div>
            ${detailsHtml ? `<div style="margin-top:10px; display:flex; flex-direction:column; gap:4px;">${detailsHtml}</div>` : ''}
            <div class="diet-insight-box" style="margin-top: 12px;">
                <div class="diet-insight-icon">${analysis.type === 'sleep' ? '🌙' : '🧘'}</div>
                <div class="diet-insight-text">
                    <div class="diet-insight-label">${en ? t('mind.coachFeedback') : 'AI 코치 피드백'}</div>
                    <div>${escapeHtml(analysis.feedback || '')}</div>
                </div>
            </div>
            ${analysis.tip ? `<div class="diet-suggestion-box" style="margin-top:10px;">💬 ${escapeHtml(analysis.tip)}</div>` : ''}
        </div>`;
    container.style.display = 'block';
}

/**
 * 체성분 결과 사진 판독.
 *
 * 값을 저장하지 않고 돌려주기만 한다. 화면이 입력칸을 채우고 사람이 확인한 뒤
 * 기존 저장 버튼으로 저장한다 — OCR 이 흘린 소수점이 그대로 BMI 와 대사건강
 * 점수에 들어가면 화면은 멀쩡한 채로 틀린 조언을 하게 된다.
 */
export async function requestBodyCompositionAnalysis(imageUrl) {
    if (!requireSignedIn()) return null;
    if (!imageUrl) return null;

    try {
        const result = await analyzeBodyCompositionFn(analysisLocalePayload({ imageUrl }));
        const analysis = result.data?.analysis;
        if (!analysis) return null;
        if (analysis.notBodyComposition) {
            showToast(isEnglishLocale() ? t('toast.bodyCompNotDetected') : '체성분 측정 결과 화면이 아닌 것 같아요. 저울 화면이나 Fitdays 결과 화면을 찍어 주세요.');
            return null;
        }
        return { analysis, stale: result.data?.stale === true };
    } catch (error) {
        console.error('Body composition analysis error:', error);
        showToast(analysisFailureMessage(
            error,
            isEnglishLocale() ? t('toast.aiFailed') : 'AI 분석에 실패했습니다. 사진이 선명한지 확인해 주세요.'
        ));
        return null;
    }
}

// 결과지가 여러 장이면 주소를 배열로 넘긴다. 서버가 한 결과로 합쳐 읽는다.
export async function requestBloodTestAnalysis(imageUrlOrUrls) {
    if (!requireSignedIn()) return null;
    const imageUrls = (Array.isArray(imageUrlOrUrls) ? imageUrlOrUrls : [imageUrlOrUrls]).filter(Boolean);
    if (imageUrls.length === 0) return null;

    try {
        const result = await analyzeBloodTestFn(analysisLocalePayload({ imageUrl: imageUrls[0], imageUrls }));
        const analysis = result.data.analysis;
        // 서버가 건강 정보로 옮긴 값. 화면이 같은 값으로 입력칸을 채운다 —
        // 채우지 않으면 다음 '저장' 때 칸에 남은 옛 값이 새 값을 덮는다.
        if (analysis && result.data.profileApplied) {
            Object.defineProperty(analysis, 'profileApplied', { value: result.data.profileApplied, enumerable: false });
        }
        return analysis;
    } catch (error) {
        console.error('Blood test analysis error:', error);
        showToast(analysisFailureMessage(
            error,
            isEnglishLocale() ? t('toast.aiFailed') : 'AI 분석에 실패했습니다. 사진이 선명한지 확인해 주세요.'
        ));
        return null;
    }
}

export function renderBloodTestResult(container, analysis) {
    if (!container || !analysis) return;

    const en = isEnglishLocale();
    const gradeColors = { A: '#2E7D32', B: '#558B2F', C: '#F9A825', D: '#EF6C00', F: '#C62828' };
    const statusColors = { normal: '#2E7D32', borderline: '#F9A825', abnormal: '#C62828' };
    const statusLabels = en
        ? { normal: 'Normal', borderline: 'Borderline', abnormal: 'Abnormal' }
        : { normal: '정상', borderline: '경계', abnormal: '이상' };
    const metricLabels = {
        glucose: en ? 'Fasting glucose' : '공복혈당',
        hba1c: en ? 'HbA1c' : '당화혈색소',
        triglyceride: en ? 'Triglycerides' : '중성지방',
        totalCholesterol: en ? 'Total cholesterol' : '총콜레스테롤',
        hdl: 'HDL',
        ldl: 'LDL',
        ast: 'AST(GOT)',
        alt: 'ALT(GPT)',
        ggt: 'GGT',
        creatinine: en ? 'Creatinine' : '크레아티닌',
        gfr: 'eGFR',
        uricAcid: en ? 'Uric acid' : '요산',
        hemoglobin: en ? 'Hemoglobin' : '헤모글로빈',
        vitaminD: en ? 'Vitamin D' : '비타민 D',
        tsh: 'TSH',
        bpSystolic: en ? 'Systolic BP' : '수축기혈압',
        bpDiastolic: en ? 'Diastolic BP' : '이완기혈압',
        bmi: 'BMI',
        height: en ? 'Height' : '키',
        weight: en ? 'Weight' : '체중',
        waist: en ? 'Waist' : '허리둘레'
    };
    const grade = analysis.overallGrade || 'C';
    const gradeColor = gradeColors[grade] || '#888';
    const metricsHtml = Object.entries(analysis.metrics || {}).map(([key, metric]) => {
        if (!metric || metric.value == null) return '';
        const label = metricLabels[key] || key;
        const statusColor = statusColors[metric.status] || '#888';
        const statusLabel = statusLabels[metric.status] || metric.status;
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f0f0f0;">
            <div>
                <span style="font-weight:600; font-size:13px;">${escapeHtml(label)}</span>
                <span style="font-size:11px; color:#aaa; margin-left:4px;">${escapeHtml(metric.reference || '')}</span>
            </div>
            <div style="text-align:right;">
                <span style="font-weight:700; font-size:15px; color:${statusColor};">${escapeHtml(String(metric.value))}</span>
                <span style="font-size:11px; color:#888;"> ${escapeHtml(metric.unit || '')}</span>
                <span style="display:inline-block; margin-left:6px; font-size:10px; padding:2px 6px; border-radius:4px; background:${statusColor}15; color:${statusColor}; font-weight:600;">${escapeHtml(statusLabel)}</span>
            </div>
        </div>`;
    }).filter(Boolean).join('');
    const riskHtml = (analysis.riskItems || []).map((risk) =>
        `<span style="display:inline-block; padding:3px 8px; margin:2px; border-radius:12px; background:#FFEBEE; color:#C62828; font-size:12px;">⚠️ ${escapeHtml(risk)}</span>`
    ).join('');

    container.innerHTML = `
        <div style="padding:12px 0;">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
                <div style="width:50px; height:50px; border-radius:50%; background:${gradeColor}15; display:flex; align-items:center; justify-content:center;">
                    <span style="font-size:24px; font-weight:800; color:${gradeColor};">${escapeHtml(grade)}</span>
                </div>
                <div style="flex:1;">
                    <div style="font-size:14px; font-weight:600; color:#333;">${escapeHtml(analysis.summary || '')}</div>
                    <div style="font-size:12px; color:#888; margin-top:2px;">${en ? 'Risk factors' : '위험인자'} ${Number(analysis.riskFactors || 0)}</div>
                </div>
            </div>
            ${riskHtml ? `<div style="margin-bottom:12px;">${riskHtml}</div>` : ''}
            <div>${metricsHtml}</div>
            ${analysis.advice ? `<div style="margin-top:12px; padding:10px 12px; background:#E8F5E9; border-radius:8px; font-size:13px; color:#2E7D32; line-height:1.5;">💬 ${escapeHtml(analysis.advice)}</div>` : ''}
        </div>`;
    container.style.display = 'block';
}

export async function requestStepScreenshotAnalysis(imageUrl) {
    if (!requireSignedIn()) return null;
    try {
        const result = await analyzeStepScreenshotFn(analysisLocalePayload({ imageUrl }));
        if (result.data?.success && result.data.analysis) {
            if (result.data.analysis.notHealthApp) {
                showToast(isEnglishLocale() ? t('toast.notHealthScreenshot') : '건강/만보기 앱 캡처가 아닌 것 같습니다.');
                return null;
            }
            return { analysis: result.data.analysis, imageHash: result.data.imageHash };
        }
        return null;
    } catch (error) {
        console.error('Step screenshot analysis error:', error);
        showToast(analysisFailureMessage(
            error,
            isEnglishLocale() ? t('toast.aiFailed') : '분석 실패. 다시 시도해 주세요.'
        ));
        return null;
    }
}

window.requestDietAnalysis = requestDietAnalysis;
window.renderDietAnalysisResult = renderDietAnalysisResult;
window.renderDietDaySummary = renderDietDaySummary;
window.renderExerciseAnalysisResult = renderExerciseAnalysisResult;
window.requestSleepMindAnalysis = requestSleepMindAnalysis;
window.renderSleepMindAnalysisResult = renderSleepMindAnalysisResult;
window.requestSharedTargetClassification = requestSharedTargetClassification;
window.requestBloodTestAnalysis = requestBloodTestAnalysis;
window.renderBloodTestResult = renderBloodTestResult;
window.requestStepScreenshotAnalysis = requestStepScreenshotAnalysis;
window.requestBodyCompositionAnalysis = requestBodyCompositionAnalysis;
