/**
 * 지난 기록 다시 보기 — 체성분 기록과 올린 사진, 혈액검사 결과지.
 *
 * 추이 표에는 숫자 네 칸만 보인다. 그날 올린 사진과 결과지는 서버에 그대로 있는데 다시
 * 볼 길이 없었다(2026-11-13 제보). 날짜를 누르면 그날 것을 띄운다.
 *
 * 갤러리의 라이트박스는 쓰지 않는다. 그쪽은 갤러리 글 사이를 넘기는 단추가 붙어 있다.
 */

/** Storage 주소가 가리키는 파일이 사진인지 PDF 인지 표(CSV)인지. */
export function storageFileKind(url) {
    try {
        const path = decodeURIComponent(new URL(url).pathname);
        const ext = path.split('.').pop().toLowerCase();
        if (ext === 'pdf') return 'pdf';
        if (ext === 'csv') return 'sheet';
        return 'image';
    } catch (_) {
        return 'image';
    }
}

/**
 * 체성분 사진은 `날짜_시각.jpg` 로 올라간다. 그날 것만, 나중에 올린 것부터.
 * 기록에 사진 주소를 따로 적어 두지 않았으므로 파일 이름으로 찾는다.
 */
export function pickFilesForDate(names = [], date = '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return names.filter((name) => String(name).startsWith(`${date}_`)).sort().reverse();
}

/** 혈액검사 문서에 남은 결과지 주소들. 여러 장이면 imageUrls, 예전 기록은 imageUrl 하나. */
export function bloodTestSourceUrls(record) {
    const many = Array.isArray(record?.imageUrls) ? record.imageUrls : [];
    const urls = many.length > 0 ? many : [record?.imageUrl];
    return urls.filter((url) => typeof url === 'string' && url.startsWith('https://firebasestorage.googleapis.com/'));
}

/** 창을 띄우고 내용 칸을 돌려준다. 내용은 부르는 쪽이 채운다(HTML 은 그쪽에서 escape). */
export function openRecordViewer({ title = '', closeLabel = '닫기' } = {}) {
    document.getElementById('record-viewer')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'record-viewer';
    overlay.className = 'record-viewer';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const panel = document.createElement('div');
    panel.className = 'record-viewer-panel';
    const head = document.createElement('div');
    head.className = 'record-viewer-head';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'record-viewer-close';
    close.setAttribute('aria-label', closeLabel);
    close.textContent = '✕';
    const body = document.createElement('div');
    body.className = 'record-viewer-body';

    const dismiss = () => overlay.remove();
    close.addEventListener('click', dismiss);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) dismiss();
    });

    head.append(heading, close);
    panel.append(head, body);
    overlay.append(panel);
    document.body.append(overlay);
    return body;
}
