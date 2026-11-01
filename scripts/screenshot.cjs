// Regenerate the README teaser (assets/screenshot.jpg) from the current build.
//
// Usage:
//   node scripts/screenshot.cjs                        # pair from samples/teaser/
//   node scripts/screenshot.cjs A.png B.png            # explicit pair
//   node scripts/screenshot.cjs --mode joined A.png B.png
//   node scripts/screenshot.cjs --zoom 1.5 A.png B.png
//   node scripts/screenshot.cjs --square 1200 A.png B.png
//   node scripts/screenshot.cjs --viewport 900x1200 A.png B.png
//
// Teaser pair convention: drop the two images into samples/teaser/ (not versioned).
// A pair named before.* / after.* is used in that order regardless of alphabet;
// otherwise the first two images alphabetically, where A is the earlier name.
//
// Frame: --square N sizes the STAGE to N x N (header and info bar are added on
// top), so a square pair fills it exactly with nothing cropped. GitHub renders a
// README image at the content width, so a square frame shows noticeably more of
// the tool than a landscape one. Landscape pairs leave symmetric bands in a
// square frame; --fit removes them at the cost of cropping the sides.
//
// The script prints the measured fill ratio, so the framing is a decision made
// on numbers, not on how the result happens to look.
//
// Needs system Chrome and a global Playwright (`bun add -g playwright`); the repo has no node_modules.
const { chromium } = require('./playwright.cjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEASER_DIR = path.join(ROOT, 'samples', 'teaser');
const IMG_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

function parseArgs(argv) {
  const opts = {
    mode: 'split', out: path.join(ROOT, 'assets', 'screenshot.jpg'),
    viewport: { w: 1000, h: 1000 }, square: 0, zoom: 1, fit: false, files: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') opts.mode = argv[++i];
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a === '--zoom') opts.zoom = Number(argv[++i]);
    else if (a === '--fit') opts.fit = true;
    else if (a === '--square') opts.square = Number(argv[++i]);
    else if (a === '--viewport') {
      const [w, h] = argv[++i].split('x').map(Number);
      if (!w || !h) throw new Error('--viewport expects WxH, e.g. 900x1200');
      opts.viewport = { w, h };
    } else if (!a.startsWith('--')) opts.files.push(path.resolve(a));
  }
  if (opts.mode !== 'split' && opts.mode !== 'joined') throw new Error('--mode must be split or joined');
  if (!(opts.zoom > 0)) throw new Error('--zoom must be a positive number');
  if (opts.square && !(opts.square > 0)) throw new Error('--square must be a positive width');
  if (opts.files.length === 0 && fs.existsSync(TEASER_DIR)) {
    const names = fs.readdirSync(TEASER_DIR).filter(f => IMG_RE.test(f)).sort();
    const before = names.find(f => /before/i.test(f));
    const after = names.find(f => /after/i.test(f));
    const pair = (before && after) ? [before, after] : names.slice(0, 2);
    opts.files = pair.map(f => path.join(TEASER_DIR, f));
  }
  if (opts.files.length !== 2) {
    throw new Error(
      'Provide two images: node scripts/screenshot.cjs A.png B.png\n' +
      'or drop exactly two images into ' + TEASER_DIR);
  }
  for (const f of opts.files) if (!fs.existsSync(f)) throw new Error('Missing input image: ' + f);
  return opts;
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--force-device-scale-factor=1', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: opts.viewport.w, height: opts.viewport.h } });
  await page.goto(PAGE_URL);

  if (opts.mode === 'joined') await page.click('#joinedBtn');
  await page.setInputFiles('#fileA', opts.files);
  await page.waitForFunction(
    () => document.getElementById('uploadScreen').style.display === 'none', null, { timeout: 20000 });

  // --square: make the stage itself square (window = width x width + chrome).
  // The width is applied first: chrome height depends on it, because the toolbar
  // drops to a second row below ~1200px and would otherwise be measured wrong.
  if (opts.square) {
    await page.setViewportSize({ width: opts.square, height: 800 });
    await page.waitForTimeout(200);
    const chromeH = await page.evaluate(() => window.innerHeight - document.getElementById('stage').clientHeight);
    opts.viewport = { w: opts.square, h: opts.square + chromeH };
    await page.setViewportSize({ width: opts.viewport.w, height: opts.viewport.h });
    await page.waitForTimeout(400); // resize handler re-fits the split boxes
  }

  // Default view: centred at the requested zoom, no pan; split at the halfway point.
  await page.evaluate((z) => {
    document.querySelector(`#sliderModeGroup button[data-mode="vertical"]`).click();
    setSplit(50);
    zoom = z; panX = 0; panY = 0;
    updateTransform();
  }, opts.zoom);
  await page.waitForTimeout(400);

  // --fit: zoom just enough to cover the stage, removing the letterbox bands a
  // square frame leaves around a landscape pair (the view crops, it does not squash).
  if (opts.fit) {
    await page.evaluate(() => {
      const stage = document.getElementById('stage').getBoundingClientRect();
      const a = document.getElementById('imgA').getBoundingClientRect();
      zoom = Math.max(stage.width / a.width, stage.height / a.height);
      panX = 0; panY = 0;
      updateTransform();
    });
  }
  await page.waitForTimeout(300); // settle layout before capture

  const fill = await page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect();
    const a = document.getElementById('imgA').getBoundingClientRect();
    const b = document.getElementById('imgB').getBoundingClientRect();
    const box = Math.max(a.width * a.height, b.width * b.height);
    const r = im => (im.naturalWidth / im.naturalHeight).toFixed(3);
    return {
      pct: Math.round((box / (stage.width * stage.height)) * 100),
      stage: `${Math.round(stage.width)}x${Math.round(stage.height)}`,
      aspect: `${r(imgA)} / ${r(imgB)}`,
    };
  });

  await page.screenshot({ path: opts.out, type: 'jpeg', quality: 92 });
  await browser.close();
  console.log(`wrote ${path.relative(ROOT, opts.out)} — ${opts.viewport.w}x${opts.viewport.h}, ` +
    `${opts.mode}, ${opts.fit ? 'fit' : 'zoom ' + opts.zoom}, stage ${fill.stage}, fill ${fill.pct}%, aspect ${fill.aspect}`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
