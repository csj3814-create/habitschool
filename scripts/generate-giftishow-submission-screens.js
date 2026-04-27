const fs = require('fs');
const path = require('path');

const playwrightPath = require.resolve('playwright', {
    paths: [
        process.env.NODE_PATH,
        path.join(process.env.USERPROFILE || 'C:\\Users\\user', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules'),
    ].filter(Boolean),
});
const { chromium } = require(playwrightPath);

const workspaceRoot = process.cwd();
const htmlPath = path.join(workspaceRoot, 'docs', 'giftishow_submission_reward_market_screens_ko.html');
const outputDir = path.join(workspaceRoot, 'docs');

const targets = [
    { id: 'screen-asset', file: 'giftishow_submission_reward_market_asset_screen.png' },
    { id: 'screen-coupon', file: 'giftishow_submission_reward_market_coupon_screen.png' },
    { id: 'screen-admin', file: 'giftishow_submission_reward_market_admin_screen.png' },
];

async function main() {
    if (!fs.existsSync(htmlPath)) {
        throw new Error(`Missing source HTML: ${htmlPath}`);
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: { width: 1700, height: 2200, deviceScaleFactor: 1.5 },
        colorScheme: 'light',
    });

    await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
        waitUntil: 'networkidle',
    });

    for (const target of targets) {
        const locator = page.locator(`#${target.id}`);
        await locator.scrollIntoViewIfNeeded();
        await locator.screenshot({
            path: path.join(outputDir, target.file),
        });
    }

    await browser.close();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
