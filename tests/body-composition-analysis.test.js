import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// functions/runtime.js 는 admin.initializeApp() 을 부르므로 테스트에서 require 할 수
// 없다. 다른 runtime 시험과 같은 방식으로 원문을 읽어 확인한다.
const RUNTIME = readRepoFile('functions/runtime.js');
const CLIENT = readRepoFile('js/app-core.js');
const ANALYSIS = readRepoFile('js/diet-analysis.js');
const STORAGE_RULES = readRepoFile('storage.rules');
const INDEX = readRepoFile('index.html');

const bodyOf = (name) => RUNTIME.split(`exports.${name} = onCall(`)[1].split('\n);\n')[0];

describe('체성분 판독은 혈액검사와 같은 문을 지난다', () => {
    const body = bodyOf('analyzeBodyComposition');

    it('로그인 없이는 못 부른다', () => {
        expect(body).toContain('unauthenticated');
    });

    it('동의를 서버에서 확인한다', () => {
        // 게이트가 화면에만 있으면 콜러블을 직접 불러 동의 없이 판독할 수 있다.
        expect(body).toContain("consents?.sensitive?.agreed !== true");
        expect(body).toContain('failed-precondition');
    });

    it('Firebase Storage 주소만 받는다', () => {
        expect(body).toContain('https://firebasestorage.googleapis.com/');
        expect(body).toContain('허용되지 않은 이미지 URL입니다.');
    });

    it('프로젝트가 정한 모델과 thinking 설정을 쓴다', () => {
        expect(body).toContain('"gemini-2.5-flash"');
        expect(body).toContain('thinkingConfig: { thinkingBudget: 0 }');
        expect(body).not.toContain('gemini-2.0-flash');
    });
});

describe('판독값은 회원 문서에 곧바로 쓰이지 않는다', () => {
    const body = bodyOf('analyzeBodyComposition');

    it('회원 문서나 하위 컬렉션에 쓰지 않는다', () => {
        // 사람이 확인하기 전에 저장하면 OCR 이 흘린 숫자가 그대로 점수에 들어가고
        // 화면은 아무 일 없었던 것처럼 보인다.
        expect(body).not.toContain('inbodyHistory');
        expect(body).not.toMatch(/db\.doc\(`users\/\$\{[^}]+\}`\)\.(set|update)\(/);
    });

    it('판독 결과를 돌려주기만 한다', () => {
        expect(body).toContain('return {');
        expect(body).toContain('analysis,');
    });
});

describe('말이 안 되는 숫자는 빈칸으로 둔다', () => {
    const sanitizer = RUNTIME.split('function sanitizeBodyCompositionValue(')[1].split('\n}\n')[0];

    it('범위를 벗어나면 null', () => {
        // 체중 7.24 나 724 가 그대로 들어오면 BMI 와 대사건강 점수가 통째로 틀어진다.
        expect(sanitizer).toContain('value < spec.min || value > spec.max');
        expect(sanitizer).toContain('return null');
    });

    it('숫자가 아니면 null', () => {
        expect(sanitizer).toContain('Number.isFinite(value)');
    });

    it('체중 범위가 사람 범위다', () => {
        const table = RUNTIME.split('const BODY_COMPOSITION_NUMERIC_FIELDS = Object.freeze({')[1].split('});')[0];
        expect(table).toMatch(/weight:\s*\{\s*min:\s*20,\s*max:\s*300\s*\}/);
        expect(table).toMatch(/bodyFatPct:\s*\{\s*min:\s*1,\s*max:\s*75\s*\}/);
    });
});

describe('골격근량과 제지방량을 섞지 않는다', () => {
    it('프롬프트가 둘을 나눠서 묻는다', () => {
        const prompt = RUNTIME.split('const BODY_COMPOSITION_ANALYSIS_PROMPT = `')[1].split('`;')[0];
        expect(prompt).toContain("'제지방량'과 다릅니다");
        expect(prompt).toContain('leanBodyMass');
        expect(prompt).toContain('null 이 틀린 숫자보다 낫습니다');
    });

    it('화면이 제지방량을 골격근량 칸에 넣지 않는다', () => {
        // 제지방량은 뼈·장기·체수분을 포함해서 다른 값이다. 그걸 골격근량으로 쓰면
        // 근지방비(smm ÷ fat) 점수가 통째로 틀어진다.
        const fill = CLIENT.split('function applyBodyCompositionToProfileInputs(')[1].split('\n}\n')[0];
        expect(fill).toContain("put('prof-smm', analysis.smm");
        expect(fill).not.toContain('leanBodyMass');
    });
});

describe('화면 연결', () => {
    it('체성분 전용 Storage 경로가 규칙에 있다', () => {
        // 규칙을 파일에만 적고 배포를 빠뜨리면 업로드가 전부 조용히 거부된다.
        expect(STORAGE_RULES).toContain('match /body_composition/{userId}/{allFiles=**}');
        expect(STORAGE_RULES.split('match /body_composition/{userId}/{allFiles=**} {')[1].split('}')[0])
            .toContain('request.auth.uid == userId');
    });

    it('업로드가 그 경로로 간다', () => {
        expect(CLIENT).toContain('`body_composition/${user.uid}/');
    });

    it('동의 게이트를 화면에서도 먼저 본다', () => {
        // 카메라 버튼과 공유 시트가 같은 판독 함수를 쓰고, 동의는 그 안에서 본다.
        const upload = CLIENT.split('window.uploadBodyCompositionPhoto = async function (inputEl) {')[1].split('\n};\n')[0];
        expect(upload).toContain('analyzeBodyCompositionFile(file)');
        const core = CLIENT.split('async function analyzeBodyCompositionFile(file) {')[1].split('\n}\n')[0];
        expect(core).toContain('hasSensitiveDataConsent');
    });

    it('체성분 화면이 아니면 그렇게 말한다', () => {
        expect(ANALYSIS).toContain('notBodyComposition');
        expect(ANALYSIS).toContain('저울 화면이나 Fitdays 결과 화면을 찍어 주세요');
    });

    it('인바디 카드에 사진 버튼이 있다', () => {
        expect(INDEX).toContain('id="body-composition-input"');
        expect(INDEX).toContain('uploadBodyCompositionPhoto(this)');
    });

    it('무엇을 채웠는지 말해 준다', () => {
        // 조용히 칸만 바뀌면 회원은 자기 값이 어디까지 덮였는지 모른 채 저장한다.
        expect(CLIENT).toContain('확인하고 <strong>저장</strong>을 눌러 주세요');
    });
});

describe('저장된 사진도 고를 수 있다', () => {
    // 2026-09-24 제보: "사진으로 채우기 누르니까 카메라가 켜지네." input 에 capture 가
    // 박혀 있어서 안드로이드가 카메라만 열었다. Fitdays 에서 저장한 결과 화면을
    // 고를 방법이 없었다. 혈액검사 칸도 "촬영/선택" 이라 써 두고 같은 상태였다.
    for (const inputId of ['body-composition-input', 'blood-test-input']) {
        it(`${inputId} 에는 capture 가 박혀 있지 않다`, () => {
            const tag = INDEX.split(`id="${inputId}"`)[1].split('>')[0];
            expect(tag).not.toContain('capture=');
        });

        it(`${inputId} 는 고르기와 찍기 버튼이 따로 있다`, () => {
            expect(INDEX).toContain(`openPhotoPickerFor('${inputId}', 'library')`);
            expect(INDEX).toContain(`openPhotoPickerFor('${inputId}', 'camera')`);
        });
    }

    it('고르기는 capture 를 떼고, 찍기만 붙인다', () => {
        const fn = CLIENT.split('window.openPhotoPickerFor = function (inputId, source = ')[1].split('\n};\n')[0];
        expect(fn).toContain("input.removeAttribute('capture')");
        expect(fn).toContain("input.setAttribute('capture', 'environment')");
        // 고르러 나간 사이 앱이 새로 연 것으로 착각하지 않게 식단과 같은 표식을 남긴다.
        expect(fn).toContain('markHabitschoolMediaPickerActivity(');
    });
});

describe('글자를 읽을 만큼 크게 보낸다', () => {
    // 2026-09-24: Fitdays 공유 이미지(세로로 긴 결과 화면)가 기본 압축 640×640 에
    // 맞춰져 160×640 이 됐다. AI 는 골격근량·체지방량을 놓치고 측정일을 2023-01-20
    // 으로 지어냈다(서버 로그). 브라우저에서 같은 모양(1080×4320)을 넣어 보니
    // 기본값은 160×640, 새 한도는 1024×4096 이었다.
    it('체성분·혈액검사 사진은 읽기용 한도로 압축한다', () => {
        expect(CLIENT).toContain('const READABLE_DOCUMENT_IMAGE_SIZE = [1440, 4096, 0.85];');
        const core = CLIENT.split('async function analyzeBodyCompositionFile(file) {')[1].split('\n}\n')[0];
        expect(core).toContain('compressImage(file, ...READABLE_DOCUMENT_IMAGE_SIZE)');
        const blood = CLIENT.split('async function uploadBloodTestPhoto(inputEl) {')[1].split('\n}\n')[0];
        expect(blood).toContain('compressImage(file, ...READABLE_DOCUMENT_IMAGE_SIZE)');
    });

    it('근육량을 골격근량으로, 체지방률을 체지방량으로 읽지 않게 일러 둔다', () => {
        const prompt = RUNTIME.split('const BODY_COMPOSITION_ANALYSIS_PROMPT = `')[1].split('`;')[0];
        expect(prompt).toContain('근육량(Muscle mass)과 골격근량(Skeletal muscle)은 다른 줄입니다');
        expect(prompt).toContain('체지방량(kg)과 체지방률(%)은 다른 줄입니다');
        expect(prompt).toContain('연도를 반드시 화면에서 읽고');
    });

    it('체지방량이 없으면 체중 × 체지방률로 계산하고 그렇다고 표시한다', () => {
        const clean = RUNTIME.split('function sanitizeBodyCompositionAnalysis(raw = {}) {')[1].split('\n}\n')[0];
        expect(clean).toContain('(clean.weight * clean.bodyFatPct) / 100');
        expect(clean).toContain('clean.fatDerived = clean.fat !== null');
        expect(CLIENT).toContain('체지방량은 체중 × 체지방률로 계산했어요.');
    });
});
