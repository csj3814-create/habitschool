/**
 * Client helpers for AI food, exercise, sleep/mind, blood-test, and step screenshot analysis.
 */

import { auth, functions } from './firebase-config.js?v=226';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { showToast } from './ui-helpers.js?v=226';
import { escapeHtml } from './security.js?v=226';
import { getLocale, isEnglishLocale, t } from './i18n.js?v=226';

const analyzeDietFn = httpsCallable(functions, 'analyzeDiet');
const analyzeSleepMindFn = httpsCallable(functions, 'analyzeSleepMind');
const analyzeBloodTestFn = httpsCallable(functions, 'analyzeBloodTest');
const analyzeStepScreenshotFn = httpsCallable(functions, 'analyzeStepScreenshot');
const classifySharedHealthImageFn = httpsCallable(functions, 'classifySharedHealthImage');

function analysisLocalePayload(extra = {}) {
    return { ...extra, locale: getLocale() };
}

function requireSignedIn(messageKey = 'auth.loginRequired') {
    if (auth.currentUser) return true;
    showToast(isEnglishLocale() ? t(messageKey) : '로그인이 필요합니다.');
    return false;
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

export async function requestSleepMindAnalysis(imageUrl, textData, analysisType) {
    if (!requireSignedIn()) return null;

    try {
        const payload = analysisLocalePayload({ analysisType });
        if (imageUrl) payload.imageUrl = imageUrl;
        if (textData) payload.textData = textData;
        const result = await analyzeSleepMindFn(payload);
        return result.data.analysis;
    } catch (error) {
        console.error('Sleep/mind analysis error:', error);
        showToast(isEnglishLocale() ? t('toast.analysisFailed') : '수면/마음 분석 중 오류가 발생했습니다.');
        return null;
    }
}

export async function requestDietAnalysis(imageUrl) {
    if (!requireSignedIn()) return null;
    if (!imageUrl) return null;

    try {
        const result = await analyzeDietFn(analysisLocalePayload({ imageUrl }));
        return result.data.analysis;
    } catch (error) {
        console.error('Diet analysis error:', error);
        showToast(isEnglishLocale() ? t('toast.aiFailed') : 'AI 분석에 실패했습니다. 다시 시도해 주세요.');
        return null;
    }
}

export function renderDietAnalysisResult(container, analysis) {
    if (!container || !analysis) return;

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
    const gradeOrder = { A: 5, B: 4, C: 3, D: 2, F: 1 };
    const avgGradeNum = valid.reduce((sum, item) => sum + (gradeOrder[item.grade] || 3), 0) / valid.length;
    const avgGrade = avgGradeNum >= 4.5 ? 'A' : avgGradeNum >= 3.5 ? 'B' : avgGradeNum >= 2.5 ? 'C' : avgGradeNum >= 1.5 ? 'D' : 'F';
    const gradeColors = { A: '#2E7D32', B: '#558B2F', C: '#F9A825', D: '#EF6C00', F: '#C62828' };
    const ultraText = ultraCount > 0
        ? (en ? t('diet.daySummary.ultra', { count: ultraCount }) : `초가공 ${ultraCount}개`)
        : (en ? t('diet.daySummary.noUltra') : '초가공 없음');

    container.innerHTML = `
        <div class="diet-day-summary">
            <div class="diet-day-grade" style="background:${gradeColors[avgGrade]};">${avgGrade}</div>
            <div class="diet-day-stats">
                <span>🌿 ${en ? t('diet.daySummary.wholeFoods', { value: avgNatural }) : `자연식품 ${avgNatural}%`}</span>
                <span>${ultraCount > 0 ? '⚠️' : '✅'} ${escapeHtml(ultraText)}</span>
            </div>
        </div>`;
    container.style.display = 'block';
}

export function renderExerciseAnalysisResult(analysis, container) {
    if (!container || !analysis) return;

    const en = isEnglishLocale();
    const intensityColors = {
        '저강도': '#2196F3',
        '중강도': '#4CAF50',
        '고강도': '#FF9800',
        '초고강도': '#F44336'
    };
    const intensityEmoji = {
        '저강도': '🚶',
        '중강도': '🏃',
        '고강도': '🔥',
        '초고강도': '💥'
    };
    const intensityLabels = {
        '저강도': t('exercise.intensity.low'),
        '중강도': t('exercise.intensity.moderate'),
        '고강도': t('exercise.intensity.high'),
        '초고강도': t('exercise.intensity.veryHigh')
    };
    const intensity = analysis.intensity || '중강도';
    const displayIntensity = en ? (intensityLabels[intensity] || intensity) : intensity;
    const progress = Math.min(Number(analysis.recommendedDailyProgress || 0), 150);
    const progressColor = progress >= 80 ? '#4CAF50' : progress >= 50 ? '#FF9800' : '#F44336';
    const progressLabel = progress >= 100
        ? (en ? t('exercise.progress.complete') : '달성! 🎉')
        : progress >= 80
            ? (en ? t('exercise.progress.almost') : '거의 달성')
            : progress >= 50
                ? (en ? t('exercise.progress.half') : '절반 이상')
                : (en ? t('exercise.progress.keepGoing') : '조금 더 노력');
    const exerciseType = analysis.exerciseType
        ? `<div style="font-size:12px; color:#555; margin-top:4px;">${en ? t('exercise.type') : '인식'}: ${escapeHtml(analysis.exerciseType)}</div>`
        : '';
    const formTip = analysis.formTip
        ? `<div class="diet-suggestion-box" style="margin-top:10px;">💬 ${escapeHtml(analysis.formTip)}</div>`
        : '';

    container.innerHTML = `
        <div class="diet-analysis-card" style="border-left: 4px solid ${intensityColors[intensity] || '#4CAF50'};">
            <div class="diet-grade-row">
                <div class="diet-grade-badge" style="background:${intensityColors[intensity] || '#4CAF50'}; font-size: 14px; min-width: 60px;">${intensityEmoji[intensity] || '🏃'} ${escapeHtml(displayIntensity)}</div>
                <div class="diet-grade-info">
                    <div class="diet-grade-label">${en ? t('exercise.intensityTitle') : '운동 강도 분석'}</div>
                    <div class="diet-grade-summary">${escapeHtml(analysis.timeAnalysis || '')}</div>
                    ${exerciseType}
                </div>
            </div>
            <div class="diet-natural-ratio" style="margin-top: 12px;">
                <span>🎯 ${en ? t('exercise.dailyProgress') : '일일 권장량 달성률'}</span>
                <div class="diet-ratio-bar-bg">
                    <div class="diet-ratio-bar-fill" style="width:${Math.min(progress, 100)}%; background:${progressColor};"></div>
                </div>
                <span class="diet-ratio-val" style="color:${progressColor}; font-weight:bold;">${progress}% ${escapeHtml(progressLabel)}</span>
            </div>
            <div class="diet-insight-box" style="margin-top: 12px;">
                <div class="diet-insight-icon">🏋️</div>
                <div class="diet-insight-text">
                    <div class="diet-insight-label">${en ? t('exercise.coachFeedback') : 'AI 트레이너 피드백'}</div>
                    <div>${escapeHtml(analysis.feedback || '')}</div>
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

export async function requestBloodTestAnalysis(imageUrl) {
    if (!requireSignedIn()) return null;
    if (!imageUrl) return null;

    try {
        const result = await analyzeBloodTestFn(analysisLocalePayload({ imageUrl }));
        return result.data.analysis;
    } catch (error) {
        console.error('Blood test analysis error:', error);
        showToast(isEnglishLocale() ? t('toast.aiFailed') : 'AI 분석에 실패했습니다. 사진이 선명한지 확인해 주세요.');
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
        bmi: 'BMI'
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
        showToast(isEnglishLocale() ? t('toast.aiFailed') : '분석 실패. 다시 시도해 주세요.');
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
