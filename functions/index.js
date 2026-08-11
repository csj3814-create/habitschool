/**
 * Cloud Functions entrypoint kept intentionally small for easier inspection.
 */

// runtime이 admin.initializeApp()을 부른다. 먼저 로드해야 뒤따르는 모듈이
// 초기화된 admin을 쓸 수 있다.
const runtime = require("./runtime");
const accountDeletion = require("./account-deletion");

module.exports = {
    ...runtime,
    ...accountDeletion,
};
