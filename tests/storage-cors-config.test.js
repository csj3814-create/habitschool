import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const configPath = fileURLToPath(new URL('../scripts/storage-cors.staging.json', import.meta.url));
const config = JSON.parse(readFileSync(configPath, 'utf8'));

describe('staging Storage CORS configuration', () => {
    it('allows only the staging app origin', () => {
        expect(config).toHaveLength(1);
        expect(config[0].origin).toEqual(['https://habitschool-staging.web.app']);
        expect(config[0].origin).not.toContain('*');
        expect(config[0].origin).not.toContain('https://habitschool.web.app');
    });

    it('allows only read methods needed by video and thumbnail requests', () => {
        expect(config[0].method).toEqual(['GET', 'HEAD']);
    });

    it('exposes the headers needed to verify partial video responses', () => {
        expect(config[0].responseHeader).toEqual([
            'Content-Type',
            'Content-Range',
            'Accept-Ranges'
        ]);
        expect(config[0].maxAgeSeconds).toBe(3600);
    });
});
