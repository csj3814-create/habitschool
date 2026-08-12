import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { shouldForceGoogleRedirectLogin } from '../js/auth-login-helpers.js';

// 증상: 삼성인터넷에 설치한 앱(홈화면 PWA)에서 구글 로그인이 "로그인 확인 중..." 뒤에
// 조용히 로그인 화면으로 돌아온다. PC(팝업 방식)에서는 멀쩡하다.
//
// 그 조합만 리디렉트 방식을 쓴다. signInWithRedirect 는 구글을 다녀오는 사이 중간
// 상태를 authDomain 쪽 저장소에 맡기는데, authDomain 이 앱과 다른 출처면
// (habitschool-*.firebaseapp.com) 브라우저에게는 서드파티 저장소다. 요즘 브라우저는
// 그것을 분리·차단하므로 돌아왔을 때 getRedirectResult 가 빈손으로 온다.

const CONFIG = readRepoFile('js/firebase-config.js');

const SAMSUNG_UA = 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/125.0.0.0 Mobile Safari/537.36';
const CHROME_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

describe('only the redirect path gets a same-origin authDomain', () => {
    it('agrees with the helper about who uses redirect', () => {
        // 이 하나의 조합만 리디렉트다. 여기가 바뀌면 authDomain 규칙도 같이 봐야 한다.
        expect(shouldForceGoogleRedirectLogin({ userAgent: SAMSUNG_UA, isStandalone: true })).toBe(true);
        expect(shouldForceGoogleRedirectLogin({ userAgent: SAMSUNG_UA, isStandalone: false })).toBe(false);
        expect(shouldForceGoogleRedirectLogin({ userAgent: CHROME_UA, isStandalone: true })).toBe(false);
    });

    it('decides the domain from that same helper, not a second guess', () => {
        expect(CONFIG).toContain('import { shouldForceGoogleRedirectLogin }');
        expect(CONFIG).toContain('function resolveAuthDomain(baseConfig)');
        expect(CONFIG).toContain('const willUseRedirect = shouldForceGoogleRedirectLogin({');
        expect(CONFIG).toContain('return willUseRedirect ? window.location.hostname : baseConfig.authDomain;');
    });

    it('leaves popup users on firebaseapp.com, exactly as before', () => {
        // 팝업은 authDomain 이 PWA scope 밖이어야 한다. 그 이유가 주석으로 남아 있어야
        // 다음 사람이 통일하겠다고 되돌리지 않는다.
        expect(CONFIG).toContain('authDomain: "habitschool-8497b.firebaseapp.com"');
        expect(CONFIG).toContain('authDomain: "habitschool-staging.firebaseapp.com"');
        expect(CONFIG).toContain('PWA scope 밖이므로 안전');
        expect(CONFIG).toContain('리디렉트 로그인은 사정이 정반대라');
    });

    it('never rewrites the domain on localhost, where there is no hosting handler', () => {
        const fn = CONFIG.split('function resolveAuthDomain(baseConfig) {')[1].split('\n}')[0];
        expect(fn).toContain('if (IS_LOCAL_ENV || typeof window === \'undefined\') return baseConfig.authDomain;');
    });

    it('applies the choice to the config actually passed to initializeApp', () => {
        expect(CONFIG).toContain('authDomain: resolveAuthDomain(baseFirebaseConfig)');
        expect(CONFIG).toContain('const app = initializeApp(firebaseConfig);');
        // 예전처럼 원본 설정을 그대로 넘기면 이 작업이 통째로 무의미해진다.
        expect(CONFIG).not.toContain('initializeApp(PROD_FIREBASE_CONFIG)');
        expect(CONFIG).not.toContain('initializeApp(STAGING_FIREBASE_CONFIG)');
    });
});

describe('the service worker keeps its hands off the auth handler', () => {
    const SW = readRepoFile('sw.js');

    it('passes Firebase reserved paths straight through', () => {
        // /__/auth/handler 응답을 캐시에 담아 두면, 매번 다른 상태를 담은 페이지에
        // 지난 응답을 돌려주게 된다.
        expect(SW).toContain("if (requestUrl.pathname.startsWith('/__/')) {");
    });

    it('bails out before anything caches the response', () => {
        const handler = SW.split("self.addEventListener('fetch', (event) => {")[1];
        const bailAt = handler.indexOf("startsWith('/__/')");
        const cacheAt = handler.indexOf('cache.put(request, clone)');
        expect(bailAt).toBeGreaterThan(-1);
        expect(cacheAt).toBeGreaterThan(-1);
        expect(bailAt).toBeLessThan(cacheAt);
    });
});
