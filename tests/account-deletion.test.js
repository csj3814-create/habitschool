import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readRepo = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 증상: 계정을 삭제해도 업로드한 사진이 한 장도 지워지지 않았다.
//
// 원인: 클라이언트가 `uploads/{uid}`를 지우려 했는데 그 경로는 코드 어디에서도
// 쓰지 않는다. 실제 사진은 diet_images/, sleep_images/, blood_tests/ 등에 있다.
// 게다가 웹 SDK에는 폴더 삭제가 없어 애초에 클라이언트가 끝낼 수 있는 일이 아니었다.
describe('account deletion actually deletes', () => {
    const source = readRepo('functions/account-deletion.js');

    it('covers every storage path the app really uploads to', () => {
        // 업로드가 쓰는 경로를 코드에서 직접 뽑아 삭제 목록과 대조한다.
        // 새 업로드 경로가 생기면 이 테스트가 먼저 깨져야 한다.
        const uploadFolders = [
            'diet_images',
            'sleep_images',
            'exercise_images',
            'exercise_videos',
            'step_screenshots',
            'blood_tests',
            'share_cards',
            'reward_coupons'
        ];
        uploadFolders.forEach((folder) => {
            expect(source, `${folder} 원본이 삭제 목록에 없다`).toContain(`"${folder}"`);
        });
        // 썸네일은 별도 경로라 따로 지워야 한다.
        ['diet_images_thumbnails', 'exercise_images_thumbnails', 'exercise_videos_thumbnails', 'sleep_images_thumbnails']
            .forEach((folder) => {
                expect(source, `${folder} 썸네일이 삭제 목록에 없다`).toContain(`"${folder}"`);
            });
        // 프리픽스 단위로 지워야 한 장씩 훑지 않는다.
        expect(source).toContain('bucket.deleteFiles({ prefix: `${prefix}/${uid}/`, force: true })');
    });

    // 2026-10-29: 위 목록을 손으로 적는 동안 body_composition(인바디 사진)과
    // bug_reports(오류 제보 첨부)가 빠져 있었다. 이제는 storage.rules 에서 직접 뽑는다.
    it('covers every per-user folder storage.rules allows uploads to', () => {
        const prefixBlock = source.split('const STORAGE_PREFIXES = Object.freeze([')[1].split(']);')[0];
        const ruleFolders = [...readRepo('storage.rules').matchAll(/match \/([a-z_]+)\/\{userId\}/g)].map((m) => m[1]);
        expect(ruleFolders.length).toBeGreaterThan(10);
        ruleFolders.forEach((folder) => {
            expect(prefixBlock, `storage.rules 의 ${folder}/ 가 삭제 목록에 없다`).toContain(`"${folder}"`);
        });
    });

    // 2026-10-29: 컬렉션도 손으로 고르다 보니 포인트 원장·오류 제보·운영자 메시지 등
    // 여덟 곳이 탈퇴 뒤에 남았다. firestore.rules 에 컬렉션이 생기면 여기서 먼저 깨진다.
    it('decides, for every collection in firestore.rules, whether deletion touches it', () => {
        const owned = source.split('const OWNED_QUERIES = Object.freeze([')[1].split(']);')[0];
        const byUid = source.split('const OWNED_DOCS_BY_UID = Object.freeze([')[1].split(']);')[0];
        const deletedElsewhere = {
            users: 'recursiveDelete(getDb().collection("users").doc(uid))',
            point_ledger: 'async function deletePointLedgers(',
            friendships: 'async function deleteFriendships(',
        };
        // 회원 개인의 것이 아니라서 탈퇴와 상관없는 컬렉션. 이유를 같이 적는다.
        const notPersonal = {
            public_stats: '전체 합계만 있다',
            admins: '운영자 계정 목록',
            reward_catalog: '상품 목록',
            reward_reserve_ledger: '적립금 합계 원장, 회원 id 없음',
            reward_reserve_metrics: '합계 지표',
            reward_market_pricing: '가격표',
            reward_market_feeds: '시장 시세',
            mining_rate_history: '채굴 비율 이력',
            monthly_rewards: '월별 전체 합계',
            meta: '서버가 계산한 전체 통계',
            // 여러 사람이 함께 쓰는 문서라 한 사람이 떠날 때 통째로 지울 수 없다.
            // 참가자 목록과 만든 사람 이름이 남는다 — 남는 것으로 알고 있는 항목이다.
            social_challenges: '공동 문서 (참가자 목록에 uid, 만든 사람 이름)',
        };
        const collections = [...new Set(
            [...readRepo('firestore.rules').matchAll(/^ {4}match \/([a-z_]+)\//gm)].map((m) => m[1])
        )];
        expect(collections.length).toBeGreaterThan(20);
        collections.forEach((name) => {
            const handled = owned.includes(`["${name}",`)
                || byUid.includes(`"${name}"`)
                || (deletedElsewhere[name] && source.includes(deletedElsewhere[name]))
                || Object.prototype.hasOwnProperty.call(notPersonal, name);
            expect(handled, `${name}: 탈퇴 때 지울지, 왜 안 지우는지 정해야 한다`).toBe(true);
        });
    });

    it('takes the private gratitude/meditation subdocument along with each daily log', () => {
        const owned = source.split('const OWNED_QUERIES = Object.freeze([')[1].split(']);')[0];
        expect(owned).toContain('["daily_logs", "userId", ["private/mind"]]');
        expect(source).toContain('batch.delete(getDb().doc(`${docSnap.ref.path}/${childPath}`));');
    });

    it('sweeps point ledgers together with their entries', () => {
        expect(source).toContain('report.firestore.point_ledger = await deletePointLedgers(uid);');
        expect(source).toContain('await getDb().recursiveDelete(ref);');
    });

    it('no longer points at the folder that never existed', () => {
        // 삭제 목록 자체에 uploads가 없어야 한다.
        // (파일 맨 위 주석은 그 버그를 설명하느라 이름을 언급하므로 목록만 본다.)
        const prefixBlock = source.split('const STORAGE_PREFIXES = Object.freeze([')[1]?.split(']);')[0] || '';
        expect(prefixBlock).not.toBe('');
        expect(prefixBlock).not.toContain('uploads');
        expect(readRepo('js/auth.js')).not.toContain('uploads/');
    });

    // 예전 클라이언트 코드는 배치 두 개(500 + 500)만 돌려서, 기록이 1,000건을
    // 넘는 계정은 초과분이 그대로 남았다.
    it('keeps going until nothing is left instead of stopping at a batch limit', () => {
        expect(source).toContain('async function deleteQueryFully(');
        expect(source).toContain('if (snap.size < QUERY_PAGE_SIZE) break;');
        // 500에서 멈추던 옛 방식의 흔적이 없어야 한다.
        expect(source).not.toContain('if (count >= 500) break;');
        expect(readRepo('js/auth.js')).not.toContain('if (count >= 500) break;');
    });

    // 내 댓글과 반응은 남의 게시물 문서 안에 들어 있다. 보안 규칙상 클라이언트는
    // 손댈 수 없어서, 탈퇴해도 남의 피드에 내 이름이 남아 있었다.
    it('removes the traces left inside other people\'s posts', () => {
        expect(source).toContain('async function removeReactionsOnOthersPosts(');
        expect(source).toContain('async function removeCommentsOnOthersPosts(');
        // 반응은 uid 배열이라 색인으로 찾아 뺄 수 있다.
        expect(source).toContain('`reactions.${type}`');
        expect(source).toContain('FieldValue.arrayRemove(uid)');
        // 댓글은 맵 배열이라 색인이 안 걸린다. 전수로 훑되 상한에 걸리면 숨기지 않고 알린다.
        expect(source).toContain('truncated = true;');
        expect(source).toContain('return { scanned, updated, truncated };');
    });

    it('deletes the auth account last so the work above still has permission', () => {
        const authIndex = source.indexOf('admin.auth().deleteUser(uid)');
        const storageIndex = source.indexOf('report.storage = await deleteAllUserStorage(uid)');
        const userDocIndex = source.indexOf('recursiveDelete');
        expect(authIndex).toBeGreaterThan(-1);
        expect(storageIndex).toBeGreaterThan(-1);
        expect(authIndex).toBeGreaterThan(storageIndex);
        expect(authIndex).toBeGreaterThan(userDocIndex);
    });

    it('sweeps the user document together with its subcollections', () => {
        // inbodyHistory / bloodTests / pushTokens 를 하나씩 열거하면 새 하위 컬렉션이
        // 생겼을 때 조용히 빠진다. 통째로 훑는 편이 안전하다.
        expect(source).toContain('recursiveDelete(getDb().collection("users").doc(uid))');
    });

    it('keeps nothing back', () => {
        // 예전에는 이 둘을 전자상거래법상 보존 대상일까 봐 남겼다. 현금 결제가 없어
        // 적용 대상이 아니라고 정리했고, 남길 근거가 없으면 남기지 않는다.
        expect(source).toContain('const RETAINED_COLLECTIONS = Object.freeze([]);');
        const owned = source.split('const OWNED_QUERIES = Object.freeze([')[1].split(']);')[0];
        expect(owned).toContain('["blockchain_transactions", "userId"]');
        expect(owned).toContain('["reward_redemptions", "userId"]');
    });

    it('still reports anything it does keep, if that ever comes back', () => {
        // 목록은 비었지만 세는 코드는 남겨둔다. 나중에 보존 대상이 생겼을 때
        // 조용히 남기는 일이 없도록.
        expect(source).toContain('for (const [collectionName, field] of RETAINED_COLLECTIONS)');
        expect(source).toContain('report.retained[collectionName] = snap.data().count;');
    });

    it('is wired up as a callable and exported', () => {
        expect(source).toContain('exports.deleteMyAccount = onCall(');
        expect(source).toContain('if (!uid) throw new HttpsError("unauthenticated"');
        const index = readRepo('functions/index.js');
        expect(index).toContain('require("./account-deletion")');
        // runtime이 admin.initializeApp()을 하므로 먼저 로드돼야 한다.
        expect(index.indexOf('require("./runtime")')).toBeLessThan(index.indexOf('require("./account-deletion")'));
    });

    it('has the client hand the job to the server', () => {
        const authSource = readRepo('js/auth.js');
        expect(authSource).toContain("httpsCallable(functions, 'deleteMyAccount')");
        // 클라이언트가 직접 지우던 흔적은 사라진다.
        expect(authSource).not.toContain('writeBatch(db)');
        expect(authSource).not.toContain('await deleteUser(user)');
    });
});
