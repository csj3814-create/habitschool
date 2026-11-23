/**
 * Cloud Functions entrypoint kept intentionally small for easier inspection.
 */

// 회원이 화면을 보며 기다리는 함수는 콜드 스타트 때 runtime.js 전체(1만 4천 줄)를 읽느라
// 늦어지지 않게 자기 파일만 읽는다. 배포할 때는 FUNCTION_TARGET 이 없어 아래로 내려가
// 전체 목록을 만든다.
//  - 공유한 사진 받기(2026-11-05)
//  - 갤러리 댓글 달기(2026-11-22, 「게시」 뒤 3초 대기 — functions/gallery-comments.js)
const FAST_START_MODULES = {
    receiveSharedUpload: "./shared-upload",
    claimSharedUpload: "./shared-upload",
    classifySharedHealthImage: "./shared-upload",
    reportSharedImportTiming: "./shared-upload",
    addGalleryComment: "./gallery-comments",
};

const fastStartModule = FAST_START_MODULES[process.env.FUNCTION_TARGET];
if (fastStartModule) {
    const target = process.env.FUNCTION_TARGET;
    module.exports = { [target]: require(fastStartModule)[target] };
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
    const { addGalleryComment } = require("./gallery-comments");
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
        addGalleryComment,
        submitBugReportFallback,
        claimFeatureBadge,
        getWalletKeyPepper,
    };
}
