/**
 * 비밀번호가 걸린 검진 결과지 PDF 열기.
 *
 * 검진기관이 보내 주는 PDF 에는 대개 생년월일 같은 비밀번호가 걸려 있다. 그대로 올리면
 * AI 는 "쪽이 없는 문서" 로 받아 500 으로 끝난다(2026-11-12 제보).
 *
 * 비밀번호는 이 기기 밖으로 나가지 않는다. 브라우저에서 pdf.js 로 열어 쪽마다 그림으로
 * 옮기고, 그 그림들로 잠기지 않은 새 PDF 를 만들어 그것만 올린다.
 */

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
const PDFJS_SRI = 'sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==';
const PDFJS_WORKER_SRI = 'sha512-BbrZ76UNZq5BhH7LL7pn9A4TKQpQeNCHOo65/akfelcIBbcVvYWOFQKPXIrykE3qZxYjmDX573oa4Ywsc7rpTw==';
// 글꼴을 문서에 넣지 않은 한글 PDF 는 이 대응표가 없으면 글자가 빈칸으로 그려진다.
const PDFJS_ASSET_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}`;

const MAX_PAGES = 20;
const MAX_PAGE_WIDTH_PX = 1600;
const MAX_OUTPUT_BYTES = 14 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

const PASSWORD_NEEDED = 1;
const PASSWORD_WRONG = 2;

/** 잠긴 PDF 는 trailer(또는 xref 사전)에 /Encrypt 가 평문으로 들어 있다. */
export function pdfLooksEncrypted(bytes) {
    const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // "/Encrypt"
    const last = bytes.length - needle.length;
    for (let i = 0; i <= last; i += 1) {
        if (bytes[i] !== 0x2f) continue;
        let j = 1;
        while (j < needle.length && bytes[i + j] === needle[j]) j += 1;
        if (j === needle.length) return true;
    }
    return false;
}

/**
 * JPEG 그림들을 한 쪽에 한 장씩 담은 PDF 를 만든다.
 * pages: [{ bytes: Uint8Array(JPEG), width, height }] (픽셀)
 */
export function buildPdfFromJpegs(pages) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let length = 0;
    const push = (part) => {
        const bytes = typeof part === 'string' ? encoder.encode(part) : part;
        chunks.push(bytes);
        length += bytes.length;
    };
    const beginObject = (id) => {
        offsets[id] = length;
        push(`${id} 0 obj\n`);
    };

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    // 1: 문서, 2: 쪽 목록, 그 뒤로 쪽마다 (쪽, 내용, 그림) 세 개씩.
    const pageId = (index) => 3 + index * 3;
    beginObject(1);
    push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    beginObject(2);
    push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>\nendobj\n`);

    pages.forEach((page, index) => {
        const id = pageId(index);
        // 150dpi 로 찍은 것으로 친다. 화면에 보일 크기일 뿐 그림의 화소는 그대로다.
        const w = Math.round(page.width * 0.48 * 100) / 100;
        const h = Math.round(page.height * 0.48 * 100) / 100;
        const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;

        beginObject(id);
        push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>\nendobj\n`);
        beginObject(id + 1);
        push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
        beginObject(id + 2);
        push(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);
        push(page.bytes);
        push('\nendstream\nendobj\n');
    });

    const objectCount = 3 + pages.length * 3;
    const xrefOffset = length;
    let xref = `xref\n0 ${objectCount}\n0000000000 65535 f \n`;
    for (let id = 1; id < objectCount; id += 1) {
        xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    push(xref);
    push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    const out = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
    }
    return out;
}

/**
 * 비밀번호를 묻는 창. 입력한 글자를 돌려주고, 취소하면 null.
 * 비밀번호는 어디에도 저장하지 않는다.
 */
export function askPdfPassword({ en = false, wrong = false } = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'pdf-password-modal';
        overlay.style.cssText = 'position:fixed; inset:0; z-index:10050; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; padding:20px;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#fff; border-radius:16px; padding:20px; width:100%; max-width:340px; box-shadow:0 8px 30px rgba(0,0,0,0.2);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px; font-weight:700; color:#222; margin-bottom:6px;';
        title.textContent = en ? 'This PDF is locked' : '비밀번호가 걸린 PDF예요';

        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:13px; color:#666; line-height:1.5; margin-bottom:12px;';
        desc.textContent = en
            ? 'Enter the password from your clinic (often your date of birth). It is used only on this device to open the file.'
            : '검진기관이 알려 준 비밀번호를 넣어 주세요. 보통 생년월일 6자리예요. 비밀번호는 이 기기에서 파일을 여는 데만 쓰고 저장하지 않아요.';

        const input = document.createElement('input');
        // type=password 로 두면 크롬이 "비밀번호를 저장하시겠습니까?" 를 띄운다(2026-11-13 제보).
        // 로그인 비밀번호가 아니라 파일을 한 번 여는 값이다. 글자 칸으로 두고 점으로만 가린다.
        input.type = 'text';
        input.name = 'pdf-unlock-code';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.placeholder = en ? 'PDF password' : 'PDF 비밀번호';
        input.style.cssText = 'width:100%; box-sizing:border-box; padding:12px; font-size:16px; border:1px solid #ccc; border-radius:10px; -webkit-text-security:disc;';

        const error = document.createElement('div');
        error.style.cssText = 'font-size:12px; color:#C62828; min-height:18px; margin-top:6px;';
        error.textContent = wrong
            ? (en ? 'That password did not open the file. Try again.' : '비밀번호가 맞지 않아요. 다시 넣어 주세요.')
            : '';

        const buttons = document.createElement('div');
        buttons.style.cssText = 'display:flex; gap:8px; margin-top:10px;';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = en ? 'Cancel' : '취소';
        cancel.style.cssText = 'flex:1; padding:12px; border:1px solid #ddd; border-radius:10px; background:#fff; font-size:14px; color:#555;';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.textContent = en ? 'Open' : '열기';
        ok.style.cssText = 'flex:1; padding:12px; border:none; border-radius:10px; background:#FF7043; color:#fff; font-size:14px; font-weight:700;';

        const finish = (value) => {
            overlay.remove();
            resolve(value);
        };
        const submit = () => {
            if (!input.value) {
                error.textContent = en ? 'Enter the password.' : '비밀번호를 넣어 주세요.';
                return;
            }
            finish(input.value);
        };
        cancel.addEventListener('click', () => finish(null));
        ok.addEventListener('click', submit);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') submit();
        });

        buttons.append(cancel, ok);
        box.append(title, desc, input, error, buttons);
        overlay.append(box);
        document.body.append(overlay);
        input.focus();
    });
}

async function ensurePdfJs(loadScript) {
    if (!globalThis.pdfjsLib) {
        await loadScript(`${PDFJS_BASE}/pdf.min.js`, PDFJS_SRI);
    }
    // 일꾼(worker)을 같은 창에 올린다. 다른 출처의 스크립트로는 Worker 를 만들 수 없고,
    // 이렇게 올려 두면 pdf.js 가 그 처리기를 그대로 쓴다.
    if (!globalThis.pdfjsWorker) {
        await loadScript(`${PDFJS_BASE}/pdf.worker.min.js`, PDFJS_WORKER_SRI);
    }
    const lib = globalThis.pdfjsLib;
    if (!lib) throw new Error('pdfjs-unavailable');
    lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
    return lib;
}

function canvasToJpegBytes(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
            if (!blob) return reject(new Error('page-render-failed'));
            resolve(new Uint8Array(await blob.arrayBuffer()));
        }, 'image/jpeg', JPEG_QUALITY);
    });
}

/**
 * 잠긴 PDF 를 풀어 잠기지 않은 PDF(Blob)로 돌려준다.
 * 사용자가 비밀번호 창을 닫으면 null. 열지 못하면 던진다.
 *
 * loadScript(url, integrity): 앱의 CDN 스크립트 로더
 * askPassword({ wrong }): 비밀번호를 묻는 함수 (문자열 또는 null)
 */
export async function unlockPdfForAnalysis(file, { loadScript, askPassword }) {
    const pdfjsLib = await ensurePdfJs(loadScript);
    const data = new Uint8Array(await file.arrayBuffer());

    let cancelled = false;
    const task = pdfjsLib.getDocument({
        data,
        // 이 앱의 CSP 는 eval 을 허용하지 않는다.
        isEvalSupported: false,
        cMapUrl: `${PDFJS_ASSET_BASE}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${PDFJS_ASSET_BASE}/standard_fonts/`
    });
    task.onPassword = (updatePassword, reason) => {
        Promise.resolve(askPassword({ wrong: reason === PASSWORD_WRONG })).then((password) => {
            if (password == null) {
                cancelled = true;
                task.destroy();
                return;
            }
            updatePassword(password);
        });
    };

    let pdf;
    try {
        pdf = await task.promise;
    } catch (error) {
        if (cancelled) return null;
        throw error;
    }

    try {
        const pages = [];
        let total = 0;
        const pageCount = Math.min(pdf.numPages, MAX_PAGES);
        for (let number = 1; number <= pageCount; number += 1) {
            const page = await pdf.getPage(number);
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(2.5, MAX_PAGE_WIDTH_PX / base.width);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const width = Math.round(viewport.width);
            const height = Math.round(viewport.height);
            canvas.width = width;
            canvas.height = height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            const bytes = await canvasToJpegBytes(canvas);
            // 큰 캔버스를 쪽마다 쥐고 있으면 휴대폰에서 메모리가 모자란다.
            canvas.width = 0;
            canvas.height = 0;
            // 서버가 받는 크기를 넘기면 통째로 실패한다. 넘기 전 쪽까지만 보낸다.
            if (pages.length > 0 && total + bytes.length > MAX_OUTPUT_BYTES) break;
            total += bytes.length;
            pages.push({ bytes, width, height });
        }
        if (pages.length === 0) throw new Error('pdf-has-no-pages');
        return new Blob([buildPdfFromJpegs(pages)], { type: 'application/pdf' });
    } finally {
        task.destroy();
    }
}

export const PDF_PASSWORD_REASONS = Object.freeze({ PASSWORD_NEEDED, PASSWORD_WRONG });
