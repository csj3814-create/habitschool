import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { pdfLooksEncrypted, buildPdfFromJpegs } from '../js/blood-test-pdf.js';

// 2026-11-12 제보: "검진기관에서 보내주는 PDF 결과지에는 보통 본인 주민번호 앞자리 등
// 비밀번호가 걸려 있어." 잠긴 PDF 를 그대로 올리면 AI 가 "The document has no pages" 로
// 거절하고 화면에는 500 만 남았다.

const APP = readRepoFile('js/app-core.js');
const MODULE = readRepoFile('js/blood-test-pdf.js');
const FIREBASE_JSON = JSON.parse(readRepoFile('firebase.json'));

const bytesOf = (text) => new TextEncoder().encode(text);

describe('locked blood test PDFs', () => {
    it('tells a locked PDF from an open one', () => {
        const open = bytesOf('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Size 2 /Root 1 0 R >>\n%%EOF');
        const locked = bytesOf('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Size 2 /Root 1 0 R /Encrypt 5 0 R >>\n%%EOF');
        expect(pdfLooksEncrypted(open)).toBe(false);
        expect(pdfLooksEncrypted(locked)).toBe(true);
        expect(pdfLooksEncrypted(new Uint8Array(0))).toBe(false);
    });

    it('builds a PDF whose cross-reference table points at every object', () => {
        const jpegA = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
        const jpegB = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6, 5, 0xff, 0xd9]);
        const pdf = buildPdfFromJpegs([
            { bytes: jpegA, width: 1600, height: 2263 },
            { bytes: jpegB, width: 1600, height: 2263 }
        ]);
        const text = Buffer.from(pdf).toString('latin1');

        expect(text.startsWith('%PDF-1.4')).toBe(true);
        expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
        expect(text).toContain('/Count 2');
        expect(text).not.toContain('/Encrypt');
        expect(pdfLooksEncrypted(pdf)).toBe(false);

        const xrefOffset = Number(text.match(/startxref\n(\d+)\n/)[1]);
        expect(text.slice(xrefOffset, xrefOffset + 4)).toBe('xref');
        const entries = [...text.slice(xrefOffset).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
        expect(entries).toHaveLength(8); // 문서, 쪽 목록, 쪽마다 셋
        entries.forEach((offset, index) => {
            expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
        });

        // 그림은 손대지 않고 그대로 들어가야 한다.
        const marker = `/Length ${jpegB.length} >>\nstream\n`;
        const at = text.indexOf(marker) + marker.length;
        expect([...pdf.slice(at, at + jpegB.length)]).toEqual([...jpegB]);
    });

    it('asks for the password on the device and uploads only the unlocked copy', () => {
        expect(APP).toMatch(/pdfTools\.pdfLooksEncrypted\(/);
        expect(APP).toMatch(/pdfTools\.unlockPdfForAnalysis\(file,/);
        expect(APP).toContain('uploadBody = unlocked;');
        // 비밀번호는 서버로 보내지 않는다.
        expect(APP).not.toMatch(/requestBloodTestAnalysis\([^)]*password/i);
        expect(MODULE).not.toMatch(/localStorage|sessionStorage|fetch\(/);
    });

    it('says so when the password window is closed or the file cannot be opened', () => {
        expect(APP).toContain('비밀번호를 넣지 않아 분석을 멈췄어요.');
        expect(APP).toContain('비밀번호가 걸린 PDF를 열지 못했어요.');
        expect(APP).toMatch(/console\.error\('\[blood-test\] 잠긴 PDF 를 열지 못했다:'/);
    });

    it('loads the PDF reader pinned with SRI, without eval, and may fetch its font maps', () => {
        expect(MODULE).toContain("const PDFJS_VERSION = '3.11.174'");
        expect(MODULE).toMatch(/PDFJS_SRI = 'sha512-/);
        expect(MODULE).toMatch(/PDFJS_WORKER_SRI = 'sha512-/);
        expect(MODULE).toContain('isEvalSupported: false');

        const csp = FIREBASE_JSON.hosting.flatMap((site) => site.headers || [])
            .flatMap((entry) => entry.headers || [])
            .filter((header) => header.key === 'Content-Security-Policy')
            .map((header) => header.value);
        expect(csp.length).toBeGreaterThan(0);
        csp.forEach((value) => {
            const connect = value.match(/(?:^|;)\s*connect-src\s+([^;]+)/)?.[1] || '';
            expect(connect).toContain('https://cdn.jsdelivr.net');
        });
    });
});
