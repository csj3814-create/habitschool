// 갤러리 공개 설정을 회원 단위로 (2026-11-18 대표: "한번 설정했으면 이전과 이후 본인 데이터에 모두 적용되고
// 본인이 설정을 바꿀 때까지 그대로 유지")
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const read = (p) => readFileSync(resolve(p), 'utf8');
const { resolveEffectiveShareSettings, buildGalleryPostFromDailyLog } = require('../functions/gallery-posts.js');

describe('server: member setting wins over the day setting', () => {
    it('uses the member setting for every day', () => {
        const account = { hideIdentity: true, hideDate: false, hideDiet: false, hideExercise: false, hidePoints: true, hideMind: false };
        expect(resolveEffectiveShareSettings({ hideIdentity: false, hidePoints: false }, account))
            .toMatchObject({ hideIdentity: true, hidePoints: true, hideDiet: false });
        expect(resolveEffectiveShareSettings(undefined, account)).toMatchObject(account);
    });

    it('keeps a post the member took down from the gallery (diet, exercise and mind all hidden)', () => {
        const takenDown = { hideDiet: true, hideExercise: true, hideMind: true, hideMindText: true };
        expect(resolveEffectiveShareSettings(takenDown, { hideDiet: false })).toBe(takenDown);
    });

    it('falls back to the day setting when the member has none', () => {
        const day = { hideDate: true };
        expect(resolveEffectiveShareSettings(day, null)).toBe(day);
    });

    it('builds the gallery post with the member setting (name hidden)', () => {
        const post = buildGalleryPostFromDailyLog({
            logId: 'u1_2026-11-18',
            dailyLog: {
                userId: 'u1', userName: '최석재', date: '2026-11-18',
                shareSettings: resolveEffectiveShareSettings({}, { hideIdentity: true }),
                sleepAndMind: { meditationDone: true }
            }
        });
        expect(post?.userName ?? '').toBe('');
    });

    it('re-applies only to posts already in the gallery and keeps their order', () => {
        const rt = read('functions/runtime.js');
        const fn = rt.slice(rt.indexOf('exports.applyMyShareSettings = onCall('), rt.indexOf('// 연속 인증 스트릭 계산'));
        expect(fn).toContain('db.collection("gallery_posts").where("userId", "==", uid)');
        expect(fn).toContain('onlyExisting: true,');
        expect(fn).toContain('keepUpdatedAt: true,');
        const gp = read('functions/gallery-posts.js');
        expect(gp).toContain('if (onlyExisting && !existingData) return null;');
        expect(gp).toContain('updatedAt: keepUpdatedAt && existingData?.updatedAt ? existingData.updatedAt : updatedAt,');
    });

    it('reads the member document once per post and re-projects all past posts on request', () => {
        const gp = read('functions/gallery-posts.js');
        expect(gp).toContain('resolveEffectiveShareSettings(rawSource.shareSettings, owner?.settings?.shareSettings)');
        const rt = read('functions/runtime.js');
        const fn = rt.slice(rt.indexOf('exports.applyMyShareSettings = onCall('), rt.indexOf('// 연속 인증 스트릭 계산'));
        expect(fn).toContain('if (!uid) throw new HttpsError("unauthenticated"');
        expect(fn).toContain('syncGalleryPostFromDailyLog({');
    });
});

describe('app: saves to the member and fills the boxes from it', () => {
    const core = read('js/app-core.js');
    const persist = core.slice(core.indexOf('async function persistShareSettings()'), core.indexOf('function handleShareSettingsChange()'));

    it('saves to users/{uid}.settings.shareSettings first, then asks the server to redo past posts', () => {
        expect(persist.indexOf("doc(db, 'users', user.uid), { settings: { shareSettings: nextSettings } }, { merge: true }"))
            .toBeLessThan(persist.indexOf("doc(db, 'daily_logs', currentShareLog.id)"));
        expect(persist).toContain('applyMyShareSettingsFn({})');
        expect(persist).toContain("console.error('[share] 지난 갤러리 글 적용 실패:'");
    });

    it('only previews on a tick; the 「설정 저장」 button saves (even with no record today)', () => {
        const change = core.slice(core.indexOf('function handleShareSettingsChange()'), core.indexOf('function markShareSettingsDirty('));
        expect(change).not.toContain('persistShareSettings(');
        expect(change).toContain('markShareSettingsDirty(true);');
        const save = core.slice(core.indexOf('window.saveShareSettings = async function'), core.indexOf('function bindShareSettingListeners()'));
        expect(save).toContain('await persistShareSettings()');
        expect(save).toContain("showToast(t('gallery.share.saved'))");
        const html = read('index.html');
        expect(html).toContain('<button type="button" id="share-settings-save" class="share-settings-save" onclick="saveShareSettings()" data-i18n="gallery.share.save">설정 저장</button>');
        expect(read('js/i18n-en.js')).toContain("'gallery.share.save': 'Save settings',");
        // 오늘 기록이 없어도 회원 설정은 저장한다
        expect(persist).toContain('if (!currentShareLog) return true;');
    });

    it('prefers the member setting when drawing the card and loading a day', () => {
        expect(core).toContain('applyShareSettingsToControls(overrideSettings || _accountShareSettings || latest?.shareSettings || _shareSettingsDraft)');
        expect(core).toContain('applyShareSettingsToControls(_accountShareSettings || data.shareSettings);');
        expect(core).toContain('applyShareSettingsToControls(_accountShareSettings || getDefaultShareSettings());');
    });

    it('loads it at sign-in and forgets it at sign-out', () => {
        const auth = read('js/auth.js');
        expect(auth).toContain('window.setAccountShareSettings?.(ud?.settings?.shareSettings);');
        expect(auth).toContain('window.setAccountShareSettings?.(null);');
    });
});
