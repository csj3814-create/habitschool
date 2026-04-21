/**
 * diet-analysis.js
 * AI 식단 분석 클라이언트 모듈
 * Gemini Vision API를 통한 초가공식품 판별 + 미량영양소 분석
 */

import { auth, functions } from './firebase-config.js?v=167';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { showToast } from './ui-helpers.js?v=167';
import { escapeHtml } from './security.js?v=167';

const analyzeDietFn = httpsCallable(functions, 'analyzeDiet');
const analyzeSleepMindFn = httpsCallable(functions, 'analyzeSleepMind');
const analyzeBloodTestFn = httpsCallable(functions, 'analyzeBloodTest');
const analyzeStepScreenshotFn = httpsCallable(functions, 'analyzeStepScreenshot');
const classifySharedHealthImageFn = httpsCallable(functions, 'classifySharedHealthImage');

export async function requestSharedTargetClassification(imageUrl, context = {}) {
    if (!auth.currentUser || !imageUrl) {
        return null;
    }

    try {
        const result = await classifySharedHealthImageFn({
            imageUrl,
            fileName: String(context?.fileName || '').trim(),
            fileCount: Number(context?.fileCount || 0) || 0
        });
        return result.data?.classification || null;
    } catch (error) {
        console.warn('공유 타깃 분류 실패:', error?.message || error);
        return null;
    }
}

/**
 * 수면/마음 AI 분석 요청
 * @param {string} imageUrl - 수면 캡처 이미지 URL (선택)
 * @param {string} textData - 감사일기/명상 텍스트 (선택)
 * @param {string} analysisType - 'sleep' 또는 'mind'
 * @returns {object|null} 분석 결과 또는 null
 */
export async function requestSleepMindAnalysis(imageUrl, textData, analysisType) {
    if (!auth.currentUser) {
        showToast('로그인이 필요합니다.');
        return null;
    }

    try {
        const payload = { analysisType };
        if (imageUrl) payload.imageUrl = imageUrl;
        if (textData) payload.textData = textData;
        const result = await analyzeSleepMindFn(payload);
        return result.data.analysis;
    } catch (error) {
        console.error('수면/마음 분석 오류:', error);
        if (error.code === 'functions/unauthenticated') {
            showToast('로그인이 필요합니다.');
        } else if (error.code === 'functions/internal') {
            showToast('AI 분석에 실패했습니다. 다시 시도해주세요.');
        } else {
            showToast('수면/마음 분석 중 오류가 발생했습니다.');
        }
        return null;
    }
}

/**
 * 식단 사진 AI 분석 요청
 * @param {string} imageUrl - Firebase Storage 이미지 URL
 * @returns {object|null} 분석 결과 또는 null
 */
export async function requestDietAnalysis(imageUrl) {
    if (!auth.currentUser) {
        showToast('⚠️ 로그인이 필요합니다.');
        return null;
    }
    if (!imageUrl) return null;

    try {
        const result = await analyzeDietFn({ imageUrl });
        return result.data.analysis;
    } catch (error) {
        console.error('식단 분석 오류:', error);
        if (error.code === 'functions/unauthenticated') {
            showToast('⚠️ 로그인이 필요합니다.');
        } else if (error.code === 'functions/internal') {
            showToast('⚠️ AI 분석에 실패했습니다. 다시 시도해주세요.');
        } else {
            showToast('⚠️ 식단 분석 중 오류가 발생했습니다.');
        }
        return null;
    }
}

/**
 * 분석 결과 UI 렌더링
 * @param {HTMLElement} container - 결과를 넣을 컨테이너
 * @param {object} analysis - analyzeDiet 반환 결과
 */
export function renderDietAnalysisResult(container, analysis) {
    if (!container || !analysis) return;

    const gradeColors = {
        'A': '#2E7D32', 'B': '#558B2F', 'C': '#F9A825', 'D': '#EF6C00', 'F': '#C62828'
    };
    const gradeLabels = {
        'A': '최우수', 'B': '우수', 'C': '보통', 'D': '개선필요', 'F': '위험'
    };
    const categoryIcons = {
        'natural': '🟢', 'processed': '🟡', 'ultraprocessed': '🔴'
    };
    const categoryLabels = {
        'natural': '자연식품', 'processed': '전통가공', 'ultraprocessed': '초가공'
    };

    const grade = analysis.grade || 'C';
    const gradeColor = gradeColors[grade] || '#888';

    // 음식 목록 HTML
    const foodsHtml = (analysis.foods || []).map(f => {
        const icon = categoryIcons[f.category] || '⚪';
        const label = categoryLabels[f.category] || '기타';
        return `<div class="diet-food-item">
            <span class="diet-food-icon">${icon}</span>
            <span class="diet-food-name">${escapeHtml(f.name)}</span>
            <span class="diet-food-cat" data-cat="${escapeHtml(f.category)}">${label}</span>
        </div>`;
    }).join('');

    // 미량영양소 바
    const scores = analysis.scores || {};
    const scoreItems = [
        { key: 'vitamins', label: '💊 비타민', color: '#FF9800' },
        { key: 'minerals', label: '⚡ 무기질', color: '#2196F3' },
        { key: 'fiber', label: '🌾 섬유질', color: '#4CAF50' },
        { key: 'antioxidants', label: '🛡️ 항산화', color: '#9C27B0' }
    ];
    const scoresHtml = scoreItems.map(s => {
        const val = scores[s.key] || 0;
        return `<div class="diet-score-row">
            <span class="diet-score-label">${s.label}</span>
            <div class="diet-score-bar-bg">
                <div class="diet-score-bar-fill" style="width:${val}%; background:${s.color};"></div>
            </div>
            <span class="diet-score-val">${val}</span>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="diet-analysis-card">
            <div class="diet-grade-row">
                <div class="diet-grade-badge" style="background:${gradeColor};">${grade}</div>
                <div class="diet-grade-info">
                    <div class="diet-grade-label">${gradeLabels[grade] || ''}</div>
                    <div class="diet-grade-summary">${analysis.summary || ''}</div>
                </div>
            </div>
            <div class="diet-natural-ratio">
                <span>🌿 자연식품 비율</span>
                <div class="diet-ratio-bar-bg">
                    <div class="diet-ratio-bar-fill" style="width:${analysis.naturalRatio || 0}%;"></div>
                </div>
                <span class="diet-ratio-val">${analysis.naturalRatio || 0}%</span>
            </div>
            <div class="diet-foods-list">${foodsHtml}</div>
            <div class="diet-scores-section">
                <div class="diet-scores-title">미량영양소 점수</div>
                ${scoresHtml}
            </div>
            <div class="diet-insight-box">
                <div class="diet-insight-icon">🧬</div>
                <div class="diet-insight-text">
                    <div class="diet-insight-label">인슐린 저항성 영향</div>
                    <div>${escapeHtml(analysis.insulinComment || '')}</div>
                </div>
            </div>
            ${analysis.suggestion ? `<div class="diet-suggestion-box">💡 ${escapeHtml(analysis.suggestion)}</div>` : ''}
        </div>
    `;
    container.style.display = 'block';
}

/**
 * 요약 바 렌더링 (식단 탭 상단용)
 */
export function renderDietDaySummary(container, analyses) {
    if (!container || !analyses || analyses.length === 0) {
        if (container) container.style.display = 'none';
        return;
    }

    // 유효한 분석만 필터
    const valid = analyses.filter(a => a && a.grade);
    if (valid.length === 0) {
        container.style.display = 'none';
        return;
    }

    // 평균 자연식품 비율
    const avgNatural = Math.round(valid.reduce((s, a) => s + (a.naturalRatio || 0), 0) / valid.length);

    // 초가공식품 수
    let ultraCount = 0;
    valid.forEach(a => {
        (a.foods || []).forEach(f => { if (f.category === 'ultraprocessed') ultraCount++; });
    });

    // 평균 등급
    const gradeOrder = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1 };
    const avgGradeNum = valid.reduce((s, a) => s + (gradeOrder[a.grade] || 3), 0) / valid.length;
    const avgGrade = avgGradeNum >= 4.5 ? 'A' : avgGradeNum >= 3.5 ? 'B' : avgGradeNum >= 2.5 ? 'C' : avgGradeNum >= 1.5 ? 'D' : 'F';

    const gradeColors = { 'A': '#2E7D32', 'B': '#558B2F', 'C': '#F9A825', 'D': '#EF6C00', 'F': '#C62828' };

    container.innerHTML = `
        <div class="diet-day-summary">
            <div class="diet-day-grade" style="background:${gradeColors[avgGrade]};">${avgGrade}</div>
            <div class="diet-day-stats">
                <span>🌿 자연식품 ${avgNatural}%</span>
                <span>${ultraCount > 0 ? `🔴 초가공 ${ultraCount}개` : '✅ 초가공 없음'}</span>
            </div>
        </div>
    `;
    container.style.display = 'block';
}

/**
 * 운동 분석 결과 UI 렌더링
 * @param {object} analysis - analyzeExercise 반환 결과
 * @param {HTMLElement} container - 결과를 넣을 컨테이너
 */
export function renderExerciseAnalysisResult(analysis, container) {
    if (!container || !analysis) return;

    const intensityColors = {
        '저강도': '#2196F3',
        '중강도': '#4CAF50',
        '고강도': '#FF9800',
        '초고강도': '#F44336'
    };
    const intensityEmoji = {
        '저강도': '🟦',
        '중강도': '🟩',
        '고강도': '🟧',
        '초고강도': '🟥'
    };

    const intensity = analysis.intensity || '중강도';
    const progress = Math.min(analysis.recommendedDailyProgress || 0, 150);
    const progressColor = progress >= 80 ? '#4CAF50' : progress >= 50 ? '#FF9800' : '#F44336';
    const progressLabel = progress >= 100 ? '달성! 🎉' : progress >= 80 ? '거의 달성' : progress >= 50 ? '절반 이상' : '조금 더 노력';

    const exerciseType = analysis.exerciseType ? `<div style="font-size:12px; color:#555; margin-top:4px;">인식: ${escapeHtml(analysis.exerciseType)}</div>` : '';
    const formTip = analysis.formTip ? `
        <div class="diet-suggestion-box" style="margin-top:10px;">💡 ${escapeHtml(analysis.formTip)}</div>
    ` : '';

    container.innerHTML = `
        <div class="diet-analysis-card" style="border-left: 4px solid ${intensityColors[intensity] || '#4CAF50'};">
            <div class="diet-grade-row">
                <div class="diet-grade-badge" style="background:${intensityColors[intensity] || '#4CAF50'}; font-size: 14px; min-width: 60px;">${intensityEmoji[intensity] || '🏃'} ${intensity}</div>
                <div class="diet-grade-info">
                    <div class="diet-grade-label">운동 강도 분석</div>
                    <div class="diet-grade-summary">${escapeHtml(analysis.timeAnalysis || '')}</div>
                    ${exerciseType}
                </div>
            </div>
            <div class="diet-natural-ratio" style="margin-top: 12px;">
                <span>🎯 일일 권장량 달성률</span>
                <div class="diet-ratio-bar-bg">
                    <div class="diet-ratio-bar-fill" style="width:${Math.min(progress, 100)}%; background:${progressColor};"></div>
                </div>
                <span class="diet-ratio-val" style="color:${progressColor}; font-weight:bold;">${progress}% ${progressLabel}</span>
            </div>
            <div class="diet-insight-box" style="margin-top: 12px;">
                <div class="diet-insight-icon">🏋️</div>
                <div class="diet-insight-text">
                    <div class="diet-insight-label">AI 트레이너 피드백</div>
                    <div>${escapeHtml(analysis.feedback || '')}</div>
                </div>
            </div>
            ${formTip}
        </div>
    `;
    container.style.display = 'block';
}

/**
 * 수면/마음 분석 결과 UI 렌더링
 * @param {object} analysis - analyzeSleepMind 반환 결과
 * @param {HTMLElement} container - 결과를 넣을 컨테이너
 */
export function renderSleepMindAnalysisResult(analysis, container) {
    if (!container || !analysis) return;

    const gradeColors = {
        'A': '#2E7D32', 'B': '#558B2F', 'C': '#F9A825', 'D': '#EF6C00', 'F': '#C62828'
    };
    const gradeEmoji = {
        'A': '🌟', 'B': '👍', 'C': '😐', 'D': '😟', 'F': '😰'
    };
    const typeLabel = analysis.type === 'sleep' ? '💤 수면 분석' : '🧘 마음 분석';
    const grade = analysis.grade || 'C';
    const gradeColor = gradeColors[grade] || '#888';

    const details = analysis.details || {};
    let detailsHtml = '';
    if (details.sleepDuration) detailsHtml += `<div style="font-size:13px;">⏱ 수면 시간: <strong>${escapeHtml(details.sleepDuration)}</strong></div>`;
    if (details.sleepQuality) detailsHtml += `<div style="font-size:13px;">📊 수면 품질: ${escapeHtml(details.sleepQuality)}</div>`;
    if (details.emotionTone) detailsHtml += `<div style="font-size:13px;">💭 감정 톤: <strong>${escapeHtml(details.emotionTone)}</strong></div>`;
    if (details.stressLevel) detailsHtml += `<div style="font-size:13px;">😤 스트레스: <strong>${escapeHtml(details.stressLevel)}</strong></div>`;

    container.innerHTML = `
        <div class="diet-analysis-card" style="border-left: 4px solid ${gradeColor};">
            <div class="diet-grade-row">
                <div class="diet-grade-badge" style="background:${gradeColor}; font-size: 16px;">${gradeEmoji[grade] || '🧘'} ${grade}</div>
                <div class="diet-grade-info">
                    <div class="diet-grade-label">${typeLabel}</div>
                    <div class="diet-grade-summary">${escapeHtml(analysis.summary || '')}</div>
                </div>
            </div>
            ${detailsHtml ? `<div style="margin-top:10px; display:flex; flex-direction:column; gap:4px;">${detailsHtml}</div>` : ''}
            <div class="diet-insight-box" style="margin-top: 12px;">
                <div class="diet-insight-icon">${analysis.type === 'sleep' ? '🛏️' : '🧠'}</div>
                <div class="diet-insight-text">
                    <div class="diet-insight-label">AI 코치 피드백</div>
                    <div>${escapeHtml(analysis.feedback || '')}</div>
                </div>
            </div>
            ${analysis.tip ? `<div class="diet-suggestion-box" style="margin-top:10px;">💡 ${escapeHtml(analysis.tip)}</div>` : ''}
        </div>
    `;
    container.style.display = 'block';
}

// 전역 노출
window.requestDietAnalysis = requestDietAnalysis;
window.renderDietAnalysisResult = renderDietAnalysisResult;
window.renderDietDaySummary = renderDietDaySummary;
window.renderExerciseAnalysisResult = renderExerciseAnalysisResult;
window.requestSleepMindAnalysis = requestSleepMindAnalysis;
window.renderSleepMindAnalysisResult = renderSleepMindAnalysisResult;
window.requestSharedTargetClassification = requestSharedTargetClassification;

// ========================================
// 혈액검사 결과지 AI 분석
// ========================================

/**
 * 혈액검사 결과지 AI 분석 요청
 */
export async function requestBloodTestAnalysis(imageUrl) {
    if (!auth.currentUser) {
        showToast('⚠️ 로그인이 필요합니다.');
        return null;
    }
    if (!imageUrl) return null;

    try {
        const result = await analyzeBloodTestFn({ imageUrl });
        return result.data.analysis;
    } catch (error) {
        console.error('혈액검사 분석 오류:', error);
        if (error.code === 'functions/unauthenticated') {
            showToast('⚠️ 로그인이 필요합니다.');
        } else if (error.code === 'functions/internal') {
            showToast('⚠️ AI 분석에 실패했습니다. 사진이 선명한지 확인해주세요.');
        } else {
            showToast('⚠️ 혈액검사 분석 중 오류가 발생했습니다.');
        }
        return null;
    }
}

/**
 * 혈액검사 분석 결과 UI 렌더링
 */
export function renderBloodTestResult(container, analysis) {
    if (!container || !analysis) return;

    const gradeColors = {
        'A': '#2E7D32', 'B': '#558B2F', 'C': '#F9A825', 'D': '#EF6C00', 'F': '#C62828'
    };
    const statusColors = {
        'normal': '#2E7D32', 'borderline': '#F9A825', 'abnormal': '#C62828'
    };
    const statusLabels = {
        'normal': '정상', 'borderline': '경계', 'abnormal': '이상'
    };
    const metricLabels = {
        'glucose': '공복혈당', 'hba1c': '당화혈색소', 'triglyceride': '중성지방',
        'totalCholesterol': '총콜레스테롤', 'hdl': 'HDL', 'ldl': 'LDL',
        'ast': 'AST(GOT)', 'alt': 'ALT(GPT)', 'ggt': '감마GT',
        'creatinine': '크레아티닌', 'gfr': 'eGFR', 'uricAcid': '요산',
        'hemoglobin': '헤모글로빈', 'vitaminD': '비타민D', 'tsh': 'TSH',
        'bpSystolic': '수축기혈압', 'bpDiastolic': '이완기혈압', 'bmi': 'BMI'
    };

    const grade = analysis.overallGrade || 'C';
    const gradeColor = gradeColors[grade] || '#888';
    const metrics = analysis.metrics || {};

    // 수치 항목 HTML
    const metricsHtml = Object.entries(metrics).map(([key, m]) => {
        if (!m || m.value == null) return '';
        const label = metricLabels[key] || key;
        const statusColor = statusColors[m.status] || '#888';
        const statusLabel = statusLabels[m.status] || m.status;
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f0f0f0;">
            <div>
                <span style="font-weight:600; font-size:13px;">${escapeHtml(label)}</span>
                <span style="font-size:11px; color:#aaa; margin-left:4px;">${escapeHtml(m.reference || '')}</span>
            </div>
            <div style="text-align:right;">
                <span style="font-weight:700; font-size:15px; color:${statusColor};">${m.value}</span>
                <span style="font-size:11px; color:#888;"> ${escapeHtml(m.unit || '')}</span>
                <span style="display:inline-block; margin-left:6px; font-size:10px; padding:2px 6px; border-radius:4px; background:${statusColor}15; color:${statusColor}; font-weight:600;">${statusLabel}</span>
            </div>
        </div>`;
    }).filter(Boolean).join('');

    // 위험 항목
    const riskHtml = (analysis.riskItems || []).map(r =>
        `<span style="display:inline-block; padding:3px 8px; margin:2px; border-radius:12px; background:#FFEBEE; color:#C62828; font-size:12px;">⚠️ ${escapeHtml(r)}</span>`
    ).join('');

    container.innerHTML = `
        <div style="padding:12px 0;">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
                <div style="width:50px; height:50px; border-radius:50%; background:${gradeColor}15; display:flex; align-items:center; justify-content:center;">
                    <span style="font-size:24px; font-weight:800; color:${gradeColor};">${grade}</span>
                </div>
                <div style="flex:1;">
                    <div style="font-size:14px; font-weight:600; color:#333;">${escapeHtml(analysis.summary || '')}</div>
                    <div style="font-size:12px; color:#888; margin-top:2px;">위험인자 ${analysis.riskFactors || 0}개</div>
                </div>
            </div>
            ${riskHtml ? `<div style="margin-bottom:12px;">${riskHtml}</div>` : ''}
            <div>${metricsHtml}</div>
            ${analysis.advice ? `<div style="margin-top:12px; padding:10px 12px; background:#E8F5E9; border-radius:8px; font-size:13px; color:#2E7D32; line-height:1.5;">💡 ${escapeHtml(analysis.advice)}</div>` : ''}
        </div>
    `;
    container.style.display = 'block';
}

window.requestBloodTestAnalysis = requestBloodTestAnalysis;
window.renderBloodTestResult = renderBloodTestResult;
window.requestStepScreenshotAnalysis = requestStepScreenshotAnalysis;

// ========================================
// 걸음수 스크린샷 AI 분석
// ========================================

/**
 * 걸음수 스크린샷 AI 분석 요청
 * @param {string} imageUrl - Firebase Storage 이미지 URL
 * @returns {{ analysis: object, imageHash: string } | null}
 */
export async function requestStepScreenshotAnalysis(imageUrl) {
    if (!auth.currentUser) {
        showToast('⚠️ 로그인이 필요합니다.');
        return null;
    }
    try {
        const result = await analyzeStepScreenshotFn({ imageUrl });
        if (result.data?.success && result.data.analysis) {
            if (result.data.analysis.notHealthApp) {
                showToast('⚠️ 건강/만보기 앱 캡처가 아닌 것 같습니다.');
                return null;
            }
            return { analysis: result.data.analysis, imageHash: result.data.imageHash };
        }
        return null;
    } catch (e) {
        console.error('걸음수 스크린샷 분석 오류:', e);
        showToast('⚠️ 분석 실패. 다시 시도해주세요.');
        return null;
    }
}
