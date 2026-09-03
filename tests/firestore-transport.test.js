import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const CONFIG = readRepoFile('js/firebase-config.js');
// 설정 블록만 본다 — 주석에는 사연으로 옛 옵션 이름이 남아 있다.
const INIT_CALL = CONFIG.split('const db = initializeFirestore(app, {')[1].split('});')[0];

// 롱폴링을 강제하면 유휴 채널이 여러 개 열려 각각 timeoutSeconds 만큼 매달린다.
// 운영 실측: 7개가 동시에 24~30초씩, 각 0.1kB. 브라우저의 호스트당 연결 수 제한에
// 걸려 뒤따르는 조회들이 줄을 섰고, 그게 보상마켓 읽기 4개의 7초 타임아웃이었다.
describe('Firestore 전송 방식', () => {
    it('롱폴링을 강제하지 않는다', () => {
        expect(INIT_CALL).not.toContain('experimentalForceLongPolling');
    });

    it('탐지에 맡긴다', () => {
        expect(INIT_CALL).toContain('experimentalAutoDetectLongPolling: true');
    });

    it('왜 되돌렸는지가 코드에 남아 있다', () => {
        // 연결 한 번의 왕복만 보고 다시 바꾸지 않도록, 무엇을 봐야 하는지 적어 둔다.
        expect(CONFIG).toContain('동시에 열린 채널 수와 그 지속 시간');
    });
});
