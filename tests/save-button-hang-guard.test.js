import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 저장 버튼이 '저장 중...'에 영구히 갇히던 회귀를 막는다.
// 원인: 저장 완료 흐름 앞단의 maybeShowFirstRecordResult가 users 문서를 타임아웃
// 없이 읽어, Firestore가 느리면 완료 토스트·버튼 복원 전에 멈췄다.
describe('save flow never leaves the button stuck on "저장 중..."', () => {
    const appCore = readRepoFile('js/app-core.js');

    it('bounds the first-record user read with a timeout', () => {
        expect(appCore).toContain('first_record_user_read_timeout');
        expect(appCore).toContain('withAsyncTimeout(\n            getDoc(doc(db, \'users\', user.uid)),\n            8000,');
    });

    it('has a watchdog that restores the save button if a save hangs', () => {
        expect(appCore).toContain('const saveButtonWatchdog = setTimeout(');
        // 이미 복원됐으면 건드리지 않는다(오탐 방지).
        expect(appCore).toContain('if (!saveBtn.disabled) return;');
        // 정상 완료 시 해제.
        expect(appCore).toContain('clearTimeout(saveButtonWatchdog);');
    });
});
