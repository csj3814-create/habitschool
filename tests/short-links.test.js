// 짧은 주소 (2026-11-22 대표: "런비커스 전용 주소와 병의원 전용 주소를 최대한 짧게", /run · /<병원>)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildClinicShareUrl, SHORT_CLINIC_PATHS } from '../js/clinic-link.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const firebase = JSON.parse(read('firebase.json'));
const rewrites = (Array.isArray(firebase.hosting) ? firebase.hosting[0] : firebase.hosting).rewrites;
const runtime = read('functions/runtime.js');

describe('런비커스 /run', () => {
    it('/run 과 /run/코드는 초대 미리보기 함수가 받는다', () => {
        for (const source of ['/run', '/run/**']) {
            const rule = rewrites.find((r) => r.source === source);
            expect(rule?.function?.functionId).toBe('inviteLinkPreview');
        }
    });

    it('함수는 /run 이면 런비커스 모임으로, 코드가 있으면 초대 코드도 넘긴다', () => {
        const fn = runtime.slice(runtime.indexOf('exports.inviteLinkPreview = onRequest('), runtime.indexOf('exports.getInviteLandingInfo'));
        expect(fn).toContain('const isRunPath = segments[0] === "run";');
        expect(fn).toContain('const groupSlug = isRunPath ? "runbickers"');
        expect(fn).toContain('hasCode ? `ref=${code}` : ""');
        expect(fn).toContain('if (!hasCode && !isRunPath) {');
    });

    it('앱의 나누기 링크가 짧은 주소를 쓴다', () => {
        const app = read('js/app-core.js');
        expect(app).toContain("const RUNBICKERS_SHARE_PATH = '/run';");
        expect(app).toContain('`${window.location.origin}/run/${code}`');
    });
});

describe('병원 /<병원>', () => {
    it('요셉의원 /jos, 참사랑내과의원 /csr (대표)', () => {
        expect(SHORT_CLINIC_PATHS).toEqual({ joseph: 'jos', chamsarang: 'csr' });
    });

    it('짧은 주소가 있는 병원마다 rewrite·미리보기 페이지·관제탑이 맞다', () => {
        const generator = read('scripts/generate-clinic-pages.js');
        const admin = read('admin.html');
        for (const [id, short] of Object.entries(SHORT_CLINIC_PATHS)) {
            const rule = rewrites.find((r) => r.source === `/${short}`);
            expect(rule?.destination).toBe(`/clinic/${id}/app.html`);
            expect(generator).toContain(`id: '${id}'`);
            expect(read(`clinic/${id}/app.html`)).toContain(`/app?clinic=${id}`);
            expect(admin).toContain(`${id}: '${short}'`);
        }
    });

    it('병원 rewrite 는 /clinic/** 보다 앞에 있고, 다른 짧은 경로(/c 공유 카드, /i 초대, /run)와 겹치지 않는다', () => {
        const idx = (s) => rewrites.findIndex((r) => r.source === s);
        const shorts = Object.values(SHORT_CLINIC_PATHS);
        for (const short of shorts) expect(idx(`/${short}`)).toBeLessThan(idx('/clinic/**'));
        for (const taken of ['c', 'i', 'run', 'app', 'en', 'welcome', 'clinic']) expect(shorts).not.toContain(taken);
    });

    it('나누기 주소: 짧은 주소가 있는 병원은 /jos·/csr, 없는 병원은 예전 주소', () => {
        expect(buildClinicShareUrl('joseph', 'https://habitschool.web.app')).toBe('https://habitschool.web.app/jos');
        expect(buildClinicShareUrl('chamsarang', 'https://habitschool.web.app/')).toBe('https://habitschool.web.app/csr');
        expect(buildClinicShareUrl('newclinic', 'https://habitschool.web.app')).toBe('https://habitschool.web.app/clinic/newclinic/app');
    });
});
