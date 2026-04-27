/**
 * data-manager.js
 * 데이터 처리 및 파일 업로드 유틸리티 모듈
 */

import { storage } from './firebase-config.js?v=168';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';
import { shouldFastPathImageCompression } from './upload-performance.js?v=168';

/**
 * 객체를 깔끔하게 정리 (undefined 를 null 로 변환)
 */
export function sanitize(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
}

/**
 * 이미지 파일을 압축하여 최적화
 * @param {File} file - 압축할 이미지 파일
 * @param {number} maxWidth - 최대 너비 (기본값 640px)
 * @param {number} maxHeight - 최대 높이 (기본값 640px)
 * @param {number} quality - JPEG 품질 (0.0-1.0, 기본값 0.6)
 * @param {{ fastPath?: boolean }} options - 작은 파일 원본 유지 여부
 * @returns {Promise<File>} 압축된 파일 또는 원본 파일
 */
export async function compressImage(file, maxWidth = 640, maxHeight = 640, quality = 0.6, options = {}) {
    if (!file?.type?.startsWith('image/')) return file;

    if (shouldFastPathImageCompression(file, {
        maxWidth,
        maxHeight,
        quality,
        fastPath: options.fastPath
    })) {
        console.log(`이미지 업로드 fast-path: ${(file.size / 1024).toFixed(1)}KB 원본 유지`);
        return file;
    }

    return new Promise((resolve) => {
        createImageBitmap(file, { imageOrientation: 'from-image' })
            .catch(() => createImageBitmap(file))
            .then((bitmap) => {
                const canvas = document.createElement('canvas');
                let width = bitmap.width;
                let height = bitmap.height;

                const needsResize = width > maxWidth || height > maxHeight;
                const isSmall = file.size < 200 * 1024;

                if (isSmall && !needsResize) {
                    bitmap.close();
                    resolve(file);
                    return;
                }

                if (needsResize) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(bitmap, 0, 0, width, height);
                bitmap.close();

                canvas.toBlob((blob) => {
                    if (!blob) {
                        resolve(file);
                        return;
                    }

                    if (blob.size > file.size) {
                        resolve(file);
                        return;
                    }

                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    console.log(`이미지 압축: ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB`);
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            })
            .catch(() => {
                resolve(file);
            });
    });
}

/**
 * 파일을 Firebase Storage에 업로드하고 URL 반환
 * 이미지 파일은 자동으로 압축 후 업로드
 * @param {File} file - 업로드할 파일
 * @param {string} folderName - 저장할 폴더 이름
 * @param {string} userId - 사용자 ID
 * @param {number} maxRetries - 최대 재시도 횟수 (기본값 3)
 * @param {number} timeoutMs - 업로드 타임아웃 (기본값 60초)
 * @returns {Promise<string|null>} 업로드된 파일의 URL 또는 null
 */
export async function uploadFileAndGetUrl(file, folderName, userId, maxRetries = 3, timeoutMs = 60000) {
    if (!file) return null;

    const fileToUpload = file.type.startsWith('image/')
        ? await compressImage(file)
        : file;

    const timestamp = Date.now();
    const storageRef = ref(storage, `${folderName}/${userId}/${timestamp}_${fileToUpload.name}`);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            console.log(`파일 업로드 시작 (시도 ${attempt + 1}/${maxRetries + 1}):`, storageRef.fullPath);

            const uploadPromise = uploadBytes(storageRef, fileToUpload);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('업로드 시간이 초과되었습니다. 네트워크를 확인해주세요.')), timeoutMs)
            );
            await Promise.race([uploadPromise, timeoutPromise]);

            const urlPromise = getDownloadURL(storageRef);
            const urlTimeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('URL 가져오기 시간이 초과되었습니다.')), 10000)
            );
            const url = await Promise.race([urlPromise, urlTimeoutPromise]);

            console.log('파일 업로드 완료:', url);
            return url;
        } catch (error) {
            console.error(`파일 업로드 오류 (시도 ${attempt + 1}):`, error);
            if (error.code === 'storage/unauthorized') {
                throw new Error('저장소 접근 권한이 없습니다. 로그인 상태를 확인해주세요.');
            }
            if (attempt === maxRetries) {
                throw error;
            }
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
}

/**
 * 이미지 URL을 Base64 데이터 URL로 변환
 * 공유 카드 생성에 사용
 * @param {string} url - 변환할 이미지 URL
 * @returns {Promise<string>} Base64 데이터 URL
 */
export async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => {
                console.error('이미지 로드 실패:', url);
                resolve(url);
            };
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('Base64 변환 실패:', url, e);
        return url;
    }
}
