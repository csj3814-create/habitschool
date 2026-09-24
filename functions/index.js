/**
 * Cloud Functions entrypoint kept intentionally small for easier inspection.
 */

// runtime이 admin.initializeApp()을 부른다. 먼저 로드해야 뒤따르는 모듈이
// 초기화된 admin을 쓸 수 있다.
const runtime = require("./runtime");
const accountDeletion = require("./account-deletion");
// _test 는 내보내지 않는다 — 함수가 아닌 객체를 내보내면 배포가 함수 묶음으로 읽는다.
const { receiveSharedUpload, claimSharedUpload, cleanupSharedUploads } = require("./shared-upload");

module.exports = {
    ...runtime,
    ...accountDeletion,
    receiveSharedUpload,
    claimSharedUpload,
    cleanupSharedUploads,
};
