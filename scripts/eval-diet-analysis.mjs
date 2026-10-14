/**
 * 식단 AI 분석 정확도 비교 (2026-10-14)
 *
 * "AI 분석 정확도가 낮다" 는 반응에 무엇을 바꿀지 정하기 전에 잰다.
 * 같은 원본 사진을 여러 조건으로 분석해 음식 이름을 얼마나 맞히는지 비교한다.
 *
 * 먼저 알아 둘 것(2026-10-14 실측): Gemini 2.5 는 기본 설정에서 사진 크기와 상관없이
 * 이미지 하나를 258 토큰으로 줄여 본다. 640px 이든 1280px 이든 같다. 그래서 올리는
 * 해상도만 키우는 것은 거의 의미가 없고, mediaResolution: HIGH(1,806 토큰)를 켜야
 * 모델이 실제로 더 자세히 본다. 해상도는 HIGH 와 함께일 때만 비교한다.
 *
 *   640px · 기본 · 생각 0      ← 지금 앱 (js/data-manager.js compressImage 기본값)
 *   1280px · 기본 · 생각 0     (올리는 크기만 키운 경우 — 차이가 없어야 정상)
 *   640px · HIGH · 생각 0
 *   1280px · HIGH · 생각 0
 *   640px · 기본 · 생각 512
 *   1280px · HIGH · 생각 512
 *
 * 프롬프트·모델은 운영과 같다(functions/runtime.js 의 DIET_ANALYSIS_PROMPT, gemini-2.5-flash).
 *
 * 사용법:
 *   1) 분석
 *      GEMINI_API_KEY=... node scripts/eval-diet-analysis.mjs run --photos <원본 폴더> --out <결과 폴더>
 *      (키는 `firebase functions:secrets:access GEMINI_API_KEY --project staging` 으로 얻는다.
 *       화면·파일에 남기지 말 것)
 *   2) 정답 적기 — <결과 폴더>/truth.json 을 채운다 (run 이 빈 틀을 만든다)
 *      { "사진파일명": [["오징어채", "오징어채무침"], ["배추김치", "김치"]] }
 *      안쪽 배열 하나가 음식 하나, 그 안은 같은 음식으로 볼 이름들이다.
 *   3) 채점
 *      node scripts/eval-diet-analysis.mjs score --out <결과 폴더>
 *
 * 사진은 이 컴퓨터와 Gemini 밖으로 나가지 않는다. 결과 폴더를 저장소에 넣지 말 것.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const require = createRequire(import.meta.url);

function requireFrom(name, candidates) {
    for (const base of candidates) {
        try { return require(join(base, 'node_modules', name)); } catch (_) { /* 다음 후보 */ }
    }
    return require(name);
}
// 워크트리에는 node_modules 가 없을 수 있다. 본 저장소 것을 찾아 쓴다.
const MAIN_REPO = resolve(REPO, '..', '..', '..');
const sharp = requireFrom('sharp', [REPO, MAIN_REPO]);
const { GoogleGenerativeAI } = requireFrom('@google/generative-ai', [join(REPO, 'functions'), join(MAIN_REPO, 'functions')]);

const HIGH = 'MEDIA_RESOLUTION_HIGH';
export const VARIANTS = [
    { id: 'now_640', label: '640·기본·생각0 (지금)', size: 640, quality: 0.6, thinking: 0, media: null },
    { id: 'up_1280', label: '1280·기본·생각0', size: 1280, quality: 0.82, thinking: 0, media: null },
    { id: 'high_640', label: '640·HIGH·생각0', size: 640, quality: 0.6, thinking: 0, media: HIGH },
    { id: 'high_1280', label: '1280·HIGH·생각0', size: 1280, quality: 0.82, thinking: 0, media: HIGH },
    { id: 'think_640', label: '640·기본·생각512', size: 640, quality: 0.6, thinking: 512, media: null },
    { id: 'best_1280', label: '1280·HIGH·생각512', size: 1280, quality: 0.82, thinking: 512, media: HIGH },
];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const MODEL_TIMEOUT_MS = 60000;

function readProductionPrompt() {
    const source = readFileSync(join(REPO, 'functions', 'runtime.js'), 'utf8');
    const marker = 'const DIET_ANALYSIS_PROMPT = `';
    const start = source.indexOf(marker);
    if (start < 0) throw new Error('DIET_ANALYSIS_PROMPT 를 찾지 못했다');
    const end = source.indexOf('`;', start + marker.length);
    return source.slice(start + marker.length, end);
}

/** 앱과 같은 방식으로 줄인다: EXIF 회전 → 긴 변 맞춰 안쪽으로 → JPEG. 이미 작으면 키우지 않는다. */
export async function compressLikeApp(buffer, size, quality) {
    return sharp(buffer)
        .rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: Math.round(quality * 100) })
        .toBuffer();
}

function withTimeout(promise, ms) {
    let timer;
    return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); })
    ]);
}

async function analyze(genAI, prompt, jpeg, { thinking, media }) {
    const generationConfig = {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: thinking }
    };
    if (media) generationConfig.mediaResolution = media;
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig });
    const startedAt = Date.now();
    const result = await withTimeout(model.generateContent([
        prompt,
        { inlineData: { data: jpeg.toString('base64'), mimeType: 'image/jpeg' } }
    ]), MODEL_TIMEOUT_MS);
    const ms = Date.now() - startedAt;
    const text = result.response.text();
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
    const usage = result.response.usageMetadata || {};
    return {
        ms,
        imageTokens: (usage.promptTokensDetails || []).find((d) => d.modality === 'IMAGE')?.tokenCount || 0,
        foods: (Array.isArray(parsed.foods) ? parsed.foods : []).map((f) => String(f?.name || '').trim()).filter(Boolean),
        grade: parsed.grade || '',
        tokens: { prompt: usage.promptTokenCount || 0, output: usage.candidatesTokenCount || 0, thinking: usage.thoughtsTokenCount || 0 }
    };
}

async function run({ photos, out, limit }) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY 가 없다');
    const files = readdirSync(photos)
        .filter((name) => IMAGE_EXTENSIONS.has(extname(name).toLowerCase()))
        .sort()
        .slice(0, limit || undefined);
    if (!files.length) throw new Error(`${photos} 에 사진이 없다`);
    mkdirSync(join(out, 'images'), { recursive: true });

    const resultsPath = join(out, 'results.json');
    const results = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : {};
    const prompt = readProductionPrompt();
    const genAI = new GoogleGenerativeAI(key);

    for (const [index, name] of files.entries()) {
        let original;
        try {
            original = readFileSync(join(photos, name));
            await sharp(original).metadata();
        } catch (error) {
            console.warn(`[${index + 1}/${files.length}] ${name} 열 수 없음 (HEIC 면 JPEG 로 내보내 주세요): ${error.message}`);
            continue;
        }
        results[name] = results[name] || {};
        const preview = await compressLikeApp(original, 1280, 0.82);
        writeFileSync(join(out, 'images', `${basename(name, extname(name))}.jpg`), preview);

        for (const variant of VARIANTS) {
            if (results[name][variant.id]?.foods) continue; // 이어서 돌릴 수 있게
            const jpeg = await compressLikeApp(original, variant.size, variant.quality);
            let entry;
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    entry = { bytes: jpeg.length, ...(await analyze(genAI, prompt, jpeg, variant)) };
                    break;
                } catch (error) {
                    entry = { bytes: jpeg.length, error: error.message };
                }
            }
            results[name][variant.id] = entry;
            writeFileSync(resultsPath, JSON.stringify(results, null, 2));
        }
        console.log(`[${index + 1}/${files.length}] ${name}: ${VARIANTS.map((v) => `${v.id}=${(results[name][v.id].foods || ['오류']).join('/')}`).join(' | ')}`);
    }

    const truthPath = join(out, 'truth.json');
    if (!existsSync(truthPath)) {
        writeFileSync(truthPath, JSON.stringify(Object.fromEntries(Object.keys(results).map((n) => [n, []])), null, 2));
    }
    console.log(`\n결과: ${resultsPath}\n정답 틀: ${truthPath}`);
}

const normalize = (value) => String(value || '').replace(/\s+/g, '').replace(/[()（）]/g, '').toLowerCase();

/** 예측 이름이 정답 음식 하나와 같은가 — 이름 중 하나가 다른 쪽을 품으면 같다고 본다. */
export function matchesFood(predicted, synonyms) {
    const p = normalize(predicted);
    if (!p) return false;
    return synonyms.some((name) => {
        const t = normalize(name);
        return t && (p.includes(t) || t.includes(p));
    });
}

/**
 * 한 사진·한 조건의 점수.
 *  recall    정답 음식 중 찾아낸 비율 (빠뜨림)
 *  precision 말한 음식 중 맞은 비율 (지어냄·잘못 읽음)
 */
export function scorePhoto(predictedFoods = [], truth = []) {
    const found = truth.filter((synonyms) => predictedFoods.some((p) => matchesFood(p, synonyms)));
    const correct = predictedFoods.filter((p) => truth.some((synonyms) => matchesFood(p, synonyms)));
    return {
        truthCount: truth.length,
        predictedCount: predictedFoods.length,
        found: found.length,
        correct: correct.length,
        missed: truth.filter((s) => !found.includes(s)).map((s) => s[0]),
        wrong: predictedFoods.filter((p) => !correct.includes(p))
    };
}

function score({ out }) {
    const results = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8'));
    const truth = JSON.parse(readFileSync(join(out, 'truth.json'), 'utf8'));
    const judged = Object.keys(results).filter((n) => Array.isArray(truth[n]) && truth[n].length);
    if (!judged.length) throw new Error('truth.json 에 정답이 하나도 없다');

    const rows = VARIANTS.map((variant) => {
        let found = 0; let truthCount = 0; let correct = 0; let predicted = 0; let ms = 0; let n = 0; let errors = 0; let perfect = 0;
        for (const name of judged) {
            const entry = results[name][variant.id];
            if (!entry?.foods) { errors += 1; continue; }
            const s = scorePhoto(entry.foods, truth[name]);
            found += s.found; truthCount += s.truthCount; correct += s.correct; predicted += s.predictedCount;
            if (s.missed.length === 0 && s.wrong.length === 0) perfect += 1;
            ms += entry.ms; n += 1;
        }
        return {
            variant: variant.label,
            recall: truthCount ? found / truthCount : 0,
            precision: predicted ? correct / predicted : 0,
            perfect: n ? perfect / n : 0,
            avgSeconds: n ? ms / n / 1000 : 0,
            errors
        };
    });

    const pct = (v) => `${(v * 100).toFixed(0)}%`;
    console.log(`\n채점한 사진 ${judged.length}장\n`);
    console.log('조건\t\t\t찾아냄(recall)\t맞게 말함(precision)\t완벽한 사진\t평균 시간\t오류');
    rows.forEach((r) => console.log(`${r.variant.padEnd(18)}\t${pct(r.recall)}\t\t${pct(r.precision)}\t\t\t${pct(r.perfect)}\t\t${r.avgSeconds.toFixed(1)}초\t\t${r.errors}`));

    const detail = judged.map((name) => ({
        photo: name,
        truth: truth[name].map((s) => s[0]),
        ...Object.fromEntries(VARIANTS.map((v) => {
            const entry = results[name][v.id];
            if (!entry?.foods) return [v.id, { error: entry?.error || 'missing' }];
            const s = scorePhoto(entry.foods, truth[name]);
            return [v.id, { foods: entry.foods, missed: s.missed, wrong: s.wrong }];
        }))
    }));
    writeFileSync(join(out, 'score.json'), JSON.stringify({ summary: rows, detail }, null, 2));
    console.log(`\n사진별 틀린 것: ${join(out, 'score.json')}`);
}

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const args = { command };
    for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, '')] = rest[i + 1];
    return args;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const args = parseArgs(process.argv.slice(2));
    const out = args.out ? resolve(args.out) : null;
    const task = args.command === 'run'
        ? run({ photos: resolve(args.photos || '.'), out, limit: Number(args.limit) || 0 })
        : args.command === 'score'
            ? Promise.resolve(score({ out }))
            : Promise.reject(new Error('run 또는 score'));
    task.catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
