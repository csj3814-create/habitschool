import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

describe('index html integrity', () => {
    it('keeps key Korean copy and critical modal markup intact', () => {
        const indexSource = readRepoFile('index.html');

        expect(indexSource).toContain('<title>해빛스쿨 - 즐겁게 좋은 습관 만들기</title>');
        expect(indexSource).toContain('식단 방법을 골라보세요');
        expect(indexSource).toContain('알림을 함께 켤까요?');
        expect(indexSource).toContain('confirmDietProgramSelectionWithoutNotifications()">아니오</button>');
        expect(indexSource).toContain('confirmDietProgramSelectionWithNotifications()">네</button>');
        expect(indexSource).not.toContain('?대튆?ㅼ엥');
        expect(indexSource).not.toContain('기본 기록만 사용할래요/button>');
        expect(indexSource).not.toContain('알림을 함께 켤까요?/h3>');
    });
});
