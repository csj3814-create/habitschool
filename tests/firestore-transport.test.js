import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const CONFIG = readRepoFile('js/firebase-config.js');
// 설정 블록만 본다 — 주석에는 비교하느라 옛 옵션 이름이 그대로 적혀 있다.
const INIT_CALL = CONFIG.split('const db = initializeFirestore(app, {')[1].split('});')[0];
const SOURCES = ['js/auth.js', 'js/app-core.js', 'admin.html']
    .map(path => { try { return readRepoFile(path); } catch { return ''; } })
    .join('\n');

// 관제탑을 처음 열면 조회들이 통째로 타임아웃하고, 새로고침해야 나왔다.
// 원인은 느린 서버가 아니라 연결마다 한 번 더 도는 전송 방식 탐지였다.
describe('Firestore 전송 방식', () => {
    it('탐지를 켜 두지 않는다', () => {
        expect(INIT_CALL).not.toContain('experimentalAutoDetectLongPolling');
    });

    it('롱폴링으로 고정한다', () => {
        expect(INIT_CALL).toContain('experimentalForceLongPolling: true');
    });

    it('왜 그래도 되는지 근거가 코드에 남아 있다', () => {
        // 리스너가 없다는 것이 이 선택의 전제다. 숫자와 함께 적어 둔다.
        expect(CONFIG).toContain('실시간 리스너를 하나도 쓰지 않는다');
    });
});

// 위 선택은 "이 앱은 실시간 리스너를 쓰지 않는다"에 기대고 있다.
// 리스너가 생기면 롱폴링 고정은 스트리밍을 비싸게 만든다 — 그때 다시 재야 한다.
describe('그 전제가 깨지지 않았다', () => {
    it('onSnapshot 을 쓰는 곳이 없다', () => {
        expect(SOURCES).not.toMatch(/\bonSnapshot\s*\(/);
    });
});
