// 인앱 브라우저 판정 — 이 저장소의 유일한 출처.
//
// 2026-09-08 에 웨일 사용자가 로그인 버튼을 못 보는 문제를 고치면서 `/Whale\//i`
// 를 목록에서 뺐는데도 화면이 그대로였다. 판정이 세 군데(auth.js·pwa-install.js·
// webview-detect.js)에 각각 복사돼 있었고, 목록마다 내용이 달랐으며, 남은 패턴이
// 여전히 웨일을 잡고 있었다. 한 곳만 고쳐서는 벽이 안 없어진다.
//
// **그래서 물음을 뒤집는다.** "인앱처럼 보이나"가 아니라 "알려진 독립 브라우저인가"를
// 먼저 묻는다. 블록리스트는 새 항목이 늘 추가되므로 언젠가 멀쩡한 브라우저를
// 잡는다. 그때 막히는 것이 로그인이면 그 사용자는 되돌아올 방법이 없다.
//
// 비대칭이 핵심이다: 잘못 막으면 **영영 못 들어온다**. 잘못 통과시키면 팝업이 한 번
// 실패하고 그 자리에서 다시 시도할 수 있다. 그러므로 애매하면 통과시킨다.
//
// 클래식 스크립트다. webview-detect.js 가 모듈보다 먼저(문서 파싱 중에) 돌아야 해서
// ESM 으로 만들 수 없다. index.html 에서 webview-detect.js 보다 앞에 둔다.
(function (global) {
    'use strict';

    // 자기 이름을 UA 에 남기는 독립 브라우저들. 이들은 무슨 일이 있어도 인앱이 아니다.
    // 웨일·삼성 인터넷은 크로미움 기반이라 UA 에 WebView 계열 토큰(`; wv)` 등)을
    // 함께 실어 보내는 경우가 있다. 그래서 블록리스트가 이들을 잡아챈다.
    var STANDALONE_BROWSERS = [
        /Whale\//i,            // 네이버 웨일
        /SamsungBrowser\//i,   // 삼성 인터넷
        /Edg[A-Za-z]*\//i,     // 엣지 (Edg/ EdgA/ EdgiOS/)
        /OPR\/|OPiOS\//i,      // 오페라
        /Firefox\/|FxiOS\//i,  // 파이어폭스
        /CriOS\//i,            // iOS 크롬
        /DuckDuckGo\//i,
        /Vivaldi\//i,
        /YaBrowser\//i
    ];

    // 인앱 브라우저(앱 안에 박힌 WebView). 구글 로그인이 막히거나 설치가 안 된다.
    var IN_APP_BROWSERS = [
        /KAKAOTALK/i,
        /NAVER\(/i,
        /NAVER/i,
        /NaverMatome/i,
        /FBAN|FBAV/i,
        /FB_IAB/i,
        /Instagram/i,
        /Line\//i,
        /Twitter/i,
        /Snapchat/i,
        /DaumApps/i,
        /everytimeApp/i,
        /BAND\//i,
        /\bwv\b/i,
        /;\s*wv\)/i,
        /WebView/i,
        /GSA\//i,
        /\[FB/i
    ];

    function readUserAgent(userAgent) {
        if (typeof userAgent === 'string') return userAgent;
        var nav = global.navigator || {};
        return nav.userAgent || nav.vendor || '';
    }

    function isStandaloneBrowser(userAgent) {
        var ua = readUserAgent(userAgent);
        if (!ua) return false;
        for (var i = 0; i < STANDALONE_BROWSERS.length; i++) {
            if (STANDALONE_BROWSERS[i].test(ua)) return true;
        }
        return false;
    }

    function isInAppBrowser(userAgent) {
        var ua = readUserAgent(userAgent);
        if (!ua) return false;

        // 언제나 먼저다. 아래 어떤 규칙도 이 판단을 뒤집지 못한다.
        if (isStandaloneBrowser(ua)) return false;

        // Safari 도 아니고 알려진 브라우저도 아닌 iOS 는 인앱일 가능성이 높다.
        var isIOS = /iPhone|iPad|iPod/i.test(ua);
        if (isIOS) {
            var isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
            if (!isSafari && !/Chrome|CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua)) return true;
        }

        for (var i = 0; i < IN_APP_BROWSERS.length; i++) {
            if (IN_APP_BROWSERS[i].test(ua)) return true;
        }
        return false;
    }

    global.HabitSchoolBrowserDetect = {
        isStandaloneBrowser: isStandaloneBrowser,
        isInAppBrowser: isInAppBrowser,
        STANDALONE_BROWSERS: STANDALONE_BROWSERS,
        IN_APP_BROWSERS: IN_APP_BROWSERS
    };
})(typeof window !== 'undefined' ? window : globalThis);
