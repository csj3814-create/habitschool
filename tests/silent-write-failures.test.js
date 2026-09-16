import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');

// 2026-09-16: 챌린지 정산이 안 풀리던 제보의 원인이 빈 catch 였다. 그 김에
// js/app-core.js 전체를 훑어 '조용히 삼키는 곳' 을 세어 봤다.
//
//   } catch (_) {}      90곳
//   .catch(() => {})    98곳
//
// 대부분은 삼켜도 되는 것들이다 — localStorage(시크릿 모드에서 던진다),
// JSON.parse, navigator.share/clipboard/vibrate(기기마다 없다), 화면 손질.
// 실패해도 회원이 잃는 것이 없고 로그를 남기면 소음만 는다.
//
// 그중 **서버에 쓰는데 삼키는 것**만 셋이었다. 이 셋은 2026-08-15 consents
// 사고와 같은 모양이다 — 쓰기가 거부돼도 화면은 멀쩡하다.
describe('a write that fails says so', () => {
    it('does not lose the gratitude text of a member who hid 마음', () => {
        // publicGratitude = hideMind ? '' : gratitudeText 이므로, 공유를 끈 회원은
        // 이 하위문서가 글의 유일한 원본이다.
        expect(APP).toContain("const publicGratitude = shareSettings.hideMind ? '' : gratitudeText;");
        const write = APP.split('doc(db, "daily_logs", docId, "private", "mind"),')[1].split('});')[0];
        expect(write).not.toContain('.catch(() => {})');
        expect(write).toContain("console.error('[감사일기] 개인 사본 저장 실패:'");
        // 글이 정말 사라지는 경우에만 회원에게 말한다.
        expect(write).toContain("shareSettings.hideMind && (gratitudeText || '').trim()");
        expect(write).toContain('감사일기 저장에 실패했어요');
    });

    it('says why onboarding keeps coming back', () => {
        // onboardingComplete 쓰기는 두 군데다. 하나는 withAsyncTimeout 으로 이미
        // 제대로 다루고 있고, 조용했던 것은 가입 온보딩 건너뛰기 쪽이다.
        // 줄바꿈을 소스에 직접 쓰지 않는다 — 이 파일을 고치는 스크립트가
        // 백슬래시를 먹으면 문자열이 깨진다(오늘 세 번 그랬다).
        const anchor = 'onboardingComplete: true' + String.fromCharCode(10)
            + '            }, { merge: true }).catch(';
        const write = APP.split(anchor)[1].split('});')[0];
        expect(write).toContain("console.error('[온보딩] 완료 표시 저장 실패:'");
        // 이미 잘 다루던 쪽은 건드리지 않았다.
        expect(APP).toContain("'onboarding_save_timeout'");
    });

    it('says why an unfinished group check-in stayed behind', () => {
        const write = APP.split('await deleteDoc(checkinRef)')[1].split('\n            return;')[0];
        expect(write).not.toContain('.catch(() => {})');
        expect(write).toContain("console.error('[소모임] 미완료 체크인 삭제 실패:'");
        // 숫자는 성공했을 때만 올라가야 한다.
        expect(write).toContain('.then(() => { removed += 1; })');
    });

    it('leaves the harmless ones alone', () => {
        // 시크릿 모드에서 던지는 저장소 접근까지 로그를 남기면 소음만 는다.
        // 이 시험은 '전부 고쳐라' 가 아니라 '고친 셋이 되돌아가지 않는다' 를 지킨다.
        expect(APP.split('} catch (_) {}').length - 1).toBeGreaterThan(0);
    });
});
