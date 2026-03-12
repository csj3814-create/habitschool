// 인앱 브라우저(WebView) 감지 → 외부 브라우저로 자동 이동
(function () {
    var ua = navigator.userAgent || '';
    var currentUrl = location.href.replace(/\/index\.html$/, '/');
    // 카카오톡
    if (/KAKAOTALK/i.test(ua)) {
        location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(currentUrl);
        return;
    }
    // 네이버 앱
    if (/NAVER/i.test(ua)) {
        if (/android/i.test(ua)) {
            location.href = 'intent://' + currentUrl.replace(/https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
        } else {
            location.href = currentUrl.replace('naver://', 'https://');
        }
        return;
    }
    // 페이스북
    if (/FBAN|FBAV/i.test(ua)) {
        if (/android/i.test(ua)) {
            location.href = 'intent://' + currentUrl.replace(/https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
        }
        return;
    }
    // 인스타그램
    if (/Instagram/i.test(ua)) {
        if (/android/i.test(ua)) {
            location.href = 'intent://' + currentUrl.replace(/https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
        }
        return;
    }
    // 라인
    if (/Line\//i.test(ua)) {
        if (/android/i.test(ua)) {
            location.href = 'intent://' + currentUrl.replace(/https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
        }
        return;
    }
    // 기타 Android WebView (wv 플래그)
    if (/;\s*wv\)/i.test(ua) && /android/i.test(ua)) {
        location.href = 'intent://' + currentUrl.replace(/https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
        return;
    }
})();
