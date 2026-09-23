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
