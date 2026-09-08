import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-08: 파일을 도구로 고치다가 줄바꿈이 LF → CRLF 로 통째로 바뀌었다.
// 화면은 멀쩡했고 번들도 됐지만, 소스를 문자열로 읽어 여러 줄을 비교하는 테스트
// 6건이 한꺼번에 깨졌다. 원인이 코드가 아니라 줄바꿈이라 한참을 엉뚱한 데서 찾았다.
//
// 이 저장소에는 `AUTH.split('\n}')` 처럼 줄바꿈에 기대는 단언이 많다. CRLF 가
// 섞이면 그 단언들이 조용히 빗나가고, 그때 손대는 것은 대개 테스트 쪽이라
// **실제 계약이 잘못 고쳐진다.** 그래서 줄바꿈 자체를 계약으로 못박는다.
const LF_ONLY = [
    'index.html',
    'js/app-core.js',
    'js/auth.js',
    'js/auth-login-helpers.js',
    'js/product-events.js',
    'js/pwa-install.js',
    'js/main.js',
    'styles-base.css',
    'styles-features.css',
    'styles-dark-mode.css'
];

describe('source files keep LF line endings', () => {
    for (const path of LF_ONLY) {
        it(`${path} has no CRLF`, () => {
            const source = readRepoFile(path);
            const crlf = (source.match(/\r\n/g) || []).length;
            expect(crlf, `${path} 에 CRLF ${crlf}줄. 파일을 쓸 때 줄바꿈을 보존할 것 `
                + `(python 은 open(..., newline=''), node 는 기본이 안전).`).toBe(0);
        });
    }
});
