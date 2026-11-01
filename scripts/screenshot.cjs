// Regenerate README teaser (screenshot.jpg) from the current build.
// Run: node scripts/screenshot.cjs   (needs system Chrome; uses tests/node_modules/playwright-core)
const { chromium } = require('../tests/node_modules/playwright-core');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'ImageCompare-Ultimate.html').replace(/\\/g, '/');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SAMPLES = path.join(ROOT, 'samples');

// The two real sample photos, in A/B order.
const [sampA, sampB] = ['ChatGPT Image Jul 14, 2026, 01_05_40 PM.png', 'ChatGPT Image Jul 14, 2026, 12_55_14 PM.png']
  .map(f => path.join(SAMPLES, f));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--force-device-scale-factor=1', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(PAGE_URL);
  await page.setInputFiles('#fileA', [sampA, sampB]);
  await page.waitForFunction(
    () => document.getElementById('uploadScreen').style.display === 'none', null, { timeout: 20000 });
  // Default split view, centered, no zoom or pan.
  await page.evaluate(() => { setSplit(50); zoom = 1; panX = 0; panY = 0; updateTransform(); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ROOT, 'screenshot.jpg'), type: 'jpeg', quality: 92 });
  await browser.close();
  console.log('screenshot.jpg written');
})().catch(e => { console.error(e); process.exit(1); });
