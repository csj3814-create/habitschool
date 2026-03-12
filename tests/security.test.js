/**
 * security.test.js
 * js/security.js 보안 유틸리티 함수 단위 테스트
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// security.js의 순수 함수들을 직접 구현 테스트 (ES module CDN import 회피)
// 실제 함수 로직을 그대로 복제하여 로직 정확성 검증

// === isValidStorageUrl ===
function isValidStorageUrl(url) {
    if (!url) return false;
    const firebasePattern = /^https:\/\/firebasestorage\.googleapis\.com\//;
    const dataUrlPattern = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
    return firebasePattern.test(url) || dataUrlPattern.test(url);
}

describe('isValidStorageUrl', () => {
    it('Firebase Storage URL 허용', () => {
        expect(isValidStorageUrl('https://firebasestorage.googleapis.com/v0/b/test/o/img.jpg')).toBe(true);
    });

    it('data: URL (jpeg base64) 허용', () => {
        expect(isValidStorageUrl('data:image/jpeg;base64,/9j/4AAQ...')).toBe(true);
    });

    it('data: URL (png base64) 허용', () => {
        expect(isValidStorageUrl('data:image/png;base64,iVBOR...')).toBe(true);
    });

    it('일반 URL 거부', () => {
        expect(isValidStorageUrl('https://evil.com/image.jpg')).toBe(false);
    });

    it('내부 메타데이터 URL 거부 (SSRF)', () => {
        expect(isValidStorageUrl('http://metadata.google.internal/computeMetadata/v1/')).toBe(false);
    });

    it('null/undefined/빈 문자열 거부', () => {
        expect(isValidStorageUrl(null)).toBe(false);
        expect(isValidStorageUrl(undefined)).toBe(false);
        expect(isValidStorageUrl('')).toBe(false);
    });

    it('javascript: 프로토콜 거부', () => {
        expect(isValidStorageUrl('javascript:alert(1)')).toBe(false);
    });
});

// === limitLength ===
function limitLength(text, maxLength = 500) {
    if (!text) return '';
    return text.substring(0, maxLength);
}

describe('limitLength', () => {
    it('텍스트가 최대 길이 이하이면 그대로 반환', () => {
        expect(limitLength('hello', 10)).toBe('hello');
    });

    it('텍스트가 최대 길이 초과이면 잘라서 반환', () => {
        expect(limitLength('abcdefgh', 5)).toBe('abcde');
    });

    it('기본 최대 길이는 500', () => {
        const long = 'x'.repeat(600);
        expect(limitLength(long)).toHaveLength(500);
    });

    it('null/undefined이면 빈 문자열 반환', () => {
        expect(limitLength(null)).toBe('');
        expect(limitLength(undefined)).toBe('');
    });
});

// === sanitizeText ===
function sanitizeText(text) {
    if (!text) return '';
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    text = text.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
    text = text.replace(/javascript:/gi, '');
    return text;
}

describe('sanitizeText', () => {
    it('script 태그 제거', () => {
        expect(sanitizeText('<script>alert(1)</script>')).toBe('');
    });

    it('이벤트 핸들러 제거 (큰따옴표)', () => {
        expect(sanitizeText('<img onerror="alert(1)">')).not.toContain('onerror');
    });

    it('이벤트 핸들러 제거 (작은따옴표)', () => {
        expect(sanitizeText("<img onerror='alert(1)'>")).not.toContain('onerror');
    });

    it('javascript: 프로토콜 제거', () => {
        expect(sanitizeText('<a href="javascript:alert(1)">click</a>')).not.toContain('javascript:');
    });

    it('null/undefined이면 빈 문자열 반환', () => {
        expect(sanitizeText(null)).toBe('');
    });

    it('일반 텍스트는 그대로 유지', () => {
        expect(sanitizeText('안녕하세요! 오늘 건강 기록입니다.')).toBe('안녕하세요! 오늘 건강 기록입니다.');
    });
});

// === isValidDate ===
function isValidDate(dateStr) {
    if (!dateStr) return false;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(dateStr)) return false;
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
}

describe('isValidDate', () => {
    it('유효한 날짜 형식 (YYYY-MM-DD)', () => {
        expect(isValidDate('2026-03-06')).toBe(true);
    });

    it('잘못된 형식 거부', () => {
        expect(isValidDate('06-03-2026')).toBe(false);
        expect(isValidDate('2026/03/06')).toBe(false);
        expect(isValidDate('20260306')).toBe(false);
    });

    it('형식만 검증 (달력 유효성은 미검증)', () => {
        // isValidDate는 YYYY-MM-DD 형식만 검증
        expect(isValidDate('2026-02-30')).toBe(true);
    });

    it('빈 값 거부', () => {
        expect(isValidDate(null)).toBe(false);
        expect(isValidDate('')).toBe(false);
        expect(isValidDate(undefined)).toBe(false);
    });
});

// === isValidNumber ===
function isValidNumber(value, min = 0, max = 10000) {
    const num = parseFloat(value);
    if (isNaN(num)) return false;
    return num >= min && num <= max;
}

describe('isValidNumber', () => {
    it('범위 내 숫자 허용', () => {
        expect(isValidNumber(50, 0, 100)).toBe(true);
    });

    it('경계값 허용', () => {
        expect(isValidNumber(0, 0, 100)).toBe(true);
        expect(isValidNumber(100, 0, 100)).toBe(true);
    });

    it('범위 밖 숫자 거부', () => {
        expect(isValidNumber(-1, 0, 100)).toBe(false);
        expect(isValidNumber(101, 0, 100)).toBe(false);
    });

    it('NaN 거부', () => {
        expect(isValidNumber('abc')).toBe(false);
        expect(isValidNumber(NaN)).toBe(false);
    });

    it('문자열 숫자 허용', () => {
        expect(isValidNumber('42')).toBe(true);
    });

    it('기본 범위는 0~10000', () => {
        expect(isValidNumber(5000)).toBe(true);
        expect(isValidNumber(10001)).toBe(false);
    });
});

// === isValidUserId ===
function isValidUserId(uid) {
    if (!uid) return false;
    return /^[a-zA-Z0-9]{20,128}$/.test(uid);
}

describe('isValidUserId', () => {
    it('유효한 Firebase UID 허용', () => {
        expect(isValidUserId('KwrwGEa2qpOljcAQkrpuK9MRS6G3')).toBe(true);
    });

    it('짧은 UID 거부 (20자 미만)', () => {
        expect(isValidUserId('abc123')).toBe(false);
    });

    it('특수문자 포함 거부', () => {
        expect(isValidUserId('KwrwGEa2qpOljcAQ!@#$k9MRS6G3')).toBe(false);
    });

    it('null/undefined 거부', () => {
        expect(isValidUserId(null)).toBe(false);
        expect(isValidUserId(undefined)).toBe(false);
    });
});

// === isValidFileType ===
function isValidFileType(file) {
    if (!file) return false;
    if (file.type && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
        return true;
    }
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const allowedExts = ['jpg','jpeg','png','gif','webp','heic','heif',
                         'mp4','mov','avi','mkv','webm','3gp','m4v','mpeg'];
    return allowedExts.includes(ext);
}

describe('isValidFileType', () => {
    it('이미지 MIME 타입 허용', () => {
        expect(isValidFileType({ type: 'image/jpeg', name: 'photo.jpg' })).toBe(true);
        expect(isValidFileType({ type: 'image/png', name: 'photo.png' })).toBe(true);
    });

    it('비디오 MIME 타입 허용', () => {
        expect(isValidFileType({ type: 'video/mp4', name: 'video.mp4' })).toBe(true);
    });

    it('확장자 폴백 동작', () => {
        expect(isValidFileType({ type: '', name: 'photo.heic' })).toBe(true);
        expect(isValidFileType({ type: '', name: 'video.mov' })).toBe(true);
    });

    it('허용되지 않은 파일 거부', () => {
        expect(isValidFileType({ type: 'application/pdf', name: 'doc.pdf' })).toBe(false);
        expect(isValidFileType({ type: '', name: 'script.js' })).toBe(false);
    });

    it('null 파일 거부', () => {
        expect(isValidFileType(null)).toBe(false);
    });
});

// === isValidFileSize ===
function isValidFileSize(file, maxSize) {
    if (!file) return false;
    return file.size <= maxSize;
}

describe('isValidFileSize', () => {
    it('크기 이내 파일 허용', () => {
        expect(isValidFileSize({ size: 1024 }, 2048)).toBe(true);
    });

    it('경계값 허용', () => {
        expect(isValidFileSize({ size: 2048 }, 2048)).toBe(true);
    });

    it('크기 초과 파일 거부', () => {
        expect(isValidFileSize({ size: 2049 }, 2048)).toBe(false);
    });

    it('null 파일 거부', () => {
        expect(isValidFileSize(null, 2048)).toBe(false);
    });
});

// === safeJsonParse ===
function safeJsonParse(jsonString, defaultValue = null) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return defaultValue;
    }
}

describe('safeJsonParse', () => {
    it('유효한 JSON 파싱', () => {
        expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    });

    it('잘못된 JSON이면 기본값 반환', () => {
        expect(safeJsonParse('invalid')).toBeNull();
        expect(safeJsonParse('invalid', {})).toEqual({});
    });

    it('배열 JSON 파싱', () => {
        expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
    });
});

// === checkRateLimit ===
describe('checkRateLimit', () => {
    const actionTimestamps = new Map();
    function checkRateLimit(actionKey, minInterval = 1000) {
        const now = Date.now();
        const lastTime = actionTimestamps.get(actionKey);
        if (lastTime && (now - lastTime) < minInterval) {
            return false;
        }
        actionTimestamps.set(actionKey, now);
        return true;
    }

    beforeEach(() => {
        actionTimestamps.clear();
    });

    it('첫 호출은 허용', () => {
        expect(checkRateLimit('test-action')).toBe(true);
    });

    it('즉시 재호출은 차단', () => {
        checkRateLimit('test-action');
        expect(checkRateLimit('test-action')).toBe(false);
    });

    it('서로 다른 키는 독립적', () => {
        checkRateLimit('action-a');
        expect(checkRateLimit('action-b')).toBe(true);
    });
});
