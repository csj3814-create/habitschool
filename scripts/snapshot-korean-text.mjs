// 한국어 앱 글자 기준 파일(tests/fixtures/korean-text-baseline.json)을 만든다.
//
//   node scripts/snapshot-korean-text.mjs
//
// 이 기준 파일은 "한국어 앱 화면은 하나도 안 바뀐다" 를 지키는 tests/korean-app-unchanged-i18n.test.js 의 비교 대상이다.
// 영어 번역 작업 중에는 다시 만들지 않는다. 한국어 문구를 일부러 고친 커밋에서만, 그 커밋 안에서 다시 만들고
// 무엇이 바뀌었는지 커밋 메시지에 적는다.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildKoreanTextInventory, ROOT_DIR } from '../tests/korean-text-inventory.mjs';

const inventory = buildKoreanTextInventory();
const out = join(ROOT_DIR, 'tests', 'fixtures', 'korean-text-baseline.json');
writeFileSync(out, `${JSON.stringify(inventory, null, 1)}\n`, 'utf8');
console.log(`index.html ${inventory.indexHtml.length}, js ${inventory.js.length}, functions ${inventory.functions.length} -> ${out}`);
