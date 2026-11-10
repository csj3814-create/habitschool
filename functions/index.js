/**
 * Cloud Functions entrypoint kept intentionally small for easier inspection.
 */

// 공유한 사진을 받는 함수는 회원이 화면을 보며 기다린다. 콜드 스타트 때 runtime.js 전체
// (1만 4천 줄)를 읽느라 늦어지지 않게 자기 코드만 읽는다. 배포할 때는 FUNCTION_TARGET 이
// 없어 아래로 내려가 전체 목록을 만든다.
const SHARED_UPLOAD_FAST_START_FUNCTIONS = [
    "receiveSharedUpload",
    "claimSharedUpload",
    "classifySharedHealthImage",
    "reportSharedImportTiming",
];

if (SHARED_UPLOAD_FAST_START_FUNCTIONS.includes(process.env.FUNCTION_TARGET)) {
    const sharedUpload = require("./shared-upload");
    module.exports = Object.fromEntries(
        SHARED_UPLOAD_FAST_START_FUNCTIONS.map((name) => [name, sharedUpload[name]])
    );
} else {
    // runtime이 admin.initializeApp()을 부른다. 먼저 로드해야 뒤따르는 모듈이
    // 초기화된 admin을 쓸 수 있다.
    const runtime = require("./runtime");
    const accountDeletion = require("./account-deletion");
    // _test 는 내보내지 않는다 — 함수가 아닌 객체를 내보내면 배포가 함수 묶음으로 읽는다.
    const {
        receiveSharedUpload,
        claimSharedUpload,
        classifySharedHealthImage,
        reportSharedImportTiming,
        cleanupSharedUploads,
    } = require("./shared-upload");
    const { submitBugReportFallback } = require("./bug-report-fallback");
    const { claimFeatureBadge } = require("./feature-badges");
    const { getWalletKeyPepper } = require("./wallet-key-pepper");

    module.exports = {
        ...runtime,
        ...accountDeletion,
        receiveSharedUpload,
        claimSharedUpload,
        classifySharedHealthImage,
        reportSharedImportTiming,
        cleanupSharedUploads,
        submitBugReportFallback,
        claimFeatureBadge,
        getWalletKeyPepper,
    };
}
