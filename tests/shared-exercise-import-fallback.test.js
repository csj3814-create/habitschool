import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const fnBody = (name) => {
    const start = APP.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    return APP.slice(start, APP.indexOf('\n}\n', start));
};

// 2026-10-06 제보 "운동 기록을 공유 통해서 올리려고 했더니 오류가 나네".
// 달리기 경로 화면이 걸음 캡처로 분류됐고, 걸음 수를 못 읽자 아무것도 넣지 않았다.
// 서버 로그에서는 같은 공유 id 를 30초 간격으로 두 번 받으러 갔다(두 번째는 이미 지워짐).
describe('a shared exercise screen still lands somewhere', () => {
    it('adds it as an exercise photo when no step count can be read', () => {
        const body = fnBody('importSharedFilesToExercise');
        expect(body).not.toContain('if (!recognized) return 0;');
        const fallback = body.slice(body.indexOf('if (!recognized) {'));
        expect(fallback).toContain('await importSharedFilesToCardio(files);');
    });

    it('takes the claimed ids out of the address so a reload does not claim them again', () => {
        const handler = fnBody('handleSharedUploadDeepLink');
        const claim = handler.indexOf('files = await claimSharedUploadFiles(uploadIds);');
        expect(claim).toBeGreaterThan(-1);
        expect(handler.slice(claim, claim + 600)).toContain('forgetSharedUploadIdsInUrl();');
        expect(fnBody('forgetSharedUploadIdsInUrl')).toContain("url.searchParams.delete('sharedUploads');");
    });
});
