// E2E for ImageCompare-Ultimate: drop routing, auto-start, stage swaps, capture==viewport.
// Run: node tests/e2e.cjs   (needs system Chrome; fixtures go to os.tmpdir, never the repo)
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'ImageCompare-Ultimate.html').replace(/\\/g, '/');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'icmp-'));

let failures = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
  if (!cond) failures++;
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
}

async function main() {
  // ---- fixtures (solid colors; A/B differ in size to force letterbox paths) ----
  const red = path.join(TMP, 'red.png');     // 120x80
  const blue = path.join(TMP, 'blue.png');   // 80x120
  const green = path.join(TMP, 'green.png'); // 100x100
  const yel = path.join(TMP, 'yel.png');     // 96x64
  const tif = path.join(TMP, 'tif.tif');     // 64x48 TIFF
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:size=120x80', '-frames:v', '1', red]);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:size=80x120', '-frames:v', '1', blue]);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=green:size=100x100', '-frames:v', '1', green]);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=yellow:size=96x64', '-frames:v', '1', yel]);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x00FFFF:size=64x48', '-frames:v', '1', tif]);

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--force-device-scale-factor=1', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('PAGEERROR |', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERROR |', m.text().slice(0, 300)); });
  const readB64 = p => fs.readFileSync(p).toString('base64');

  // Drop files onto a selector with a real DataTransfer; returns after dispatches.
  async function dropOn(selector, filePaths, mime, x = null, y = null) {
    const payload = filePaths.map(p => ({
      name: path.basename(p), b64: readB64(p),
      type: mime || (p.endsWith('.tif') ? 'image/tiff' : 'image/png'),
    }));
    await page.evaluate(async ({ selector, payload, x, y }) => {
      const dt = new DataTransfer();
      for (const f of payload) {
        const bytes = Uint8Array.from(atob(f.b64), c => c.charCodeAt(0));
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }
      const el = document.querySelector(selector);
      const r = el.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: x === null ? r.left + r.width / 2 : x,
        clientY: y === null ? r.top + r.height / 2 : y };
      el.dispatchEvent(new DragEvent('dragenter', init));
      el.dispatchEvent(new DragEvent('dragover', init));
      el.dispatchEvent(new DragEvent('drop', init));
    }, { selector, payload, x, y });
  }
  const state = () => page.evaluate(() => ({
    uploadVisible: document.getElementById('uploadScreen').style.display !== 'none',
    infoA: document.getElementById('infoTagA').textContent,
    infoB: document.getElementById('infoTagB').textContent,
    compareVisible: document.getElementById('compareView').style.display === 'block',
    hasA: typeof fileAObj !== 'undefined' && !!fileAObj,
    hasB: typeof fileBObj !== 'undefined' && !!fileBObj,
    nameA: typeof fileAObj !== 'undefined' && fileAObj ? fileAObj.name : '',
    nameB: typeof fileBObj !== 'undefined' && fileBObj ? fileBObj.name : '',
  }));
  const dump = async tag => console.log('STATE ' + tag, JSON.stringify(await state()));

  // ================= 1. multi-select input -> auto-start =================
  await page.goto(PAGE_URL);
  await page.setInputFiles('#fileA', [red, blue]);
  await page.waitForFunction(() => document.getElementById('uploadScreen').style.display === 'none', null, { timeout: 15000 });
  let s = await state();
  check('input multi-select auto-starts compare', s.compareVisible);
  check('info tags show both images', s.infoA.includes('red.png') && s.infoB.includes('blue.png'), `${s.infoA} / ${s.infoB}`);

  // ================= 2. Close -> upload; single tile drop -> one slot =================
  await page.click('#backBtn');
  await page.waitForFunction(() => document.getElementById('uploadScreen').style.display !== 'none');
  await page.click('#uploadResetBtn');
  await page.waitForTimeout(300);
  await dump('after-reset');
  await dropOn('#uploadB', [green]);
  await page.waitForTimeout(1500);
  await dump('after-single-drop');
  s = await state();
  check('single drop on tile B fills B only, no auto-start',
    s.uploadVisible && s.hasB && !s.hasA && s.nameB === 'green.png' &&
    (await page.evaluate(() => document.getElementById('compareBtn').disabled)),
    `hasA=${s.hasA} nameB='${s.nameB}'`);

  // ================= 3. two-file drop on ONE tile -> both + auto-start =================
  await dropOn('#uploadA', [red, blue]);
  await page.waitForTimeout(2000);
  await dump('after-twodrop-tile');
  await page.waitForFunction(
    () => document.getElementById('infoTagA').textContent.includes('red') &&
          document.getElementById('infoTagB').textContent.includes('blue'), null, { timeout: 15000 });
  s = await state();
  check('two-file drop on single tile fills A+B + auto-starts',
    s.compareVisible && s.infoA.includes('red.png') && s.infoB.includes('blue.png'));

  // ================= 4. stage single drops replace correct slot =================
  const stageBox = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.left, w: r.width }; });
  await dropOn('#stage', [green], null, stageBox.x + stageBox.w * 0.2, null);
  await page.waitForFunction(() => document.getElementById('infoTagA').textContent.includes('green'), null, { timeout: 15000 });
  s = await state();
  check('stage left drop replaces A only', s.infoA.includes('green') && s.infoB.includes('blue.png'), `${s.infoA} / ${s.infoB}`);
  await dropOn('#stage', [yel], null, stageBox.x + stageBox.w * 0.8, null);
  await page.waitForFunction(() => document.getElementById('infoTagB').textContent.includes('yel'), null, { timeout: 15000 });
  s = await state();
  check('stage right drop replaces B only', s.infoA.includes('green') && s.infoB.includes('yel'));

  // ================= 5. stage two-drop replaces both =================
  await dropOn('#stage', [red, blue]);
  await page.waitForFunction(
    () => document.getElementById('infoTagA').textContent.includes('red') &&
          document.getElementById('infoTagB').textContent.includes('blue'), null, { timeout: 15000 });
  check('stage two-drop replaces both', true);

  // ================= 6. captures match viewport =================
  // Stub downloadBlob, capture bytes; compare vs element screenshot in-page.
  await page.evaluate(() => {
    window.__capDone = false; window.__capBuf = null;
    window.downloadBlob = async (blob) => {
      window.__capBuf = new Uint8Array(await blob.arrayBuffer());
      window.__capDone = true;
    };
  });
  async function captureCase(sliderMode, pct) {
    await page.evaluate(({ sliderMode, pct }) => {
      document.querySelector(`#sliderModeGroup button[data-mode="${sliderMode}"]`).click();
      setSplit(pct);
    }, { sliderMode, pct });
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__capDone = false; });
    await page.click('#captureBtn');
    await page.waitForFunction(() => window.__capDone, null, { timeout: 10000 });
    const capBytes = await page.evaluate(() => Array.from(window.__capBuf));
    const shot = await page.locator('#compareView').screenshot();
    const res = await page.evaluate(async ({ cap, shot }) => {
      const bmp = async a => createImageBitmap(new Blob([new Uint8Array(a)]));
      const [cb, sb] = await Promise.all([bmp(cap), bmp(shot)]);
      const cw = cb.width, ch = cb.height;
      const cc = document.createElement('canvas'); cc.width = cw; cc.height = ch;
      const cx = cc.getContext('2d', { willReadFrequently: true });
      cx.drawImage(cb, 0, 0);
      const capData = cx.getImageData(0, 0, cw, ch).data;
      // content-box origin of the screenshot (compareView coords)
      const view = document.getElementById('compareView').getBoundingClientRect();
      const img = document.getElementById('imgA');
      const cs = getComputedStyle(img);
      const iw = parseFloat(cs.width), ih = parseFloat(cs.height);
      const ox = view.width / 2 - iw / 2, oy = view.height / 2 - ih / 2;
      const sx = Math.round(ox), sy = Math.round(oy);
      const sc = document.createElement('canvas'); sc.width = view.width; sc.height = view.height;
      const sx2 = sc.getContext('2d', { willReadFrequently: true });
      sx2.drawImage(sb, 0, 0);
      const shotData = sx2.getImageData(sx, sy, cw, ch).data;
      // mask: seam band + handle + content border (AA zones), derived from live state
      const slider = document.getElementById('slider');
      const hx = parseFloat(slider.style.left) / 100 * view.width;
      const hy = parseFloat(slider.style.top) / 100 * view.height;
      const oxE = view.width / 2 - iw / 2, oyE = view.height / 2 - ih / 2;
      const vW = view.width, vH = view.height;
      const norm = Math.sqrt(1 / (vW * vW) + 1 / (vH * vH)); // px per normalized unit along seam normal
      const seamGap = (i, j) => {
        const nx = (i + oxE) / vW, ny = (j + oyE) / vH;
        if (sliderMode === 'vertical') return Math.abs(nx - handleX) * vW;
        if (sliderMode === 'horizontal') return Math.abs(ny - handleY) * vH;
        if (sliderMode === 'diagonal-slash') return Math.abs(nx + ny - (handleX + handleY)) / norm;
        return Math.abs(ny - nx - (handleY - handleX)) / norm;
      };
      let bad = 0, masked = 0, transparent = 0, n = 0;
      const badSpots = [];
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
        const k = (j * cw + i) * 4;
        if (capData[k + 3] === 0) { transparent++; continue; }
        n++;
        const dh = Math.hypot(i - (hx - sx), j - (hy - sy));
        const edge = Math.min(i, j, cw - 1 - i, ch - 1 - j);
        if (dh < 30 || edge < 2 || seamGap(i, j) < 4) { masked++; continue; }
        const d = Math.abs(capData[k] - shotData[k]) + Math.abs(capData[k+1] - shotData[k+1]) + Math.abs(capData[k+2] - shotData[k+2]);
        if (d > 24) { bad++; if (badSpots.length < 40) badSpots.push([i, j, capData[k], capData[k+1], capData[k+2], shotData[k], shotData[k+1], shotData[k+2]]); }
      }
      return { bad, masked, n, transparent, cw, ch, badSpots };
    }, { cap: capBytes, shot: Array.from(shot) });
    return res;
  }
  for (const m of ['vertical', 'horizontal', 'diagonal-slash', 'diagonal-backslash']) {
    const r = await captureCase(m, 35);
    check(`capture==viewport ${m}@35%`,
      r.bad === 0 && r.transparent === 0 && r.masked / r.n < 0.08,
      `bad=${r.bad} transparent=${r.transparent} masked=${r.masked}/${r.n} size=${r.cw}x${r.ch}` +
      (r.bad ? ` spots=${JSON.stringify(r.badSpots)}` : ''));
  }
  const rv = await captureCase('vertical', 65);
  check('capture==viewport vertical@65%', rv.bad === 0 && rv.transparent === 0, `bad=${rv.bad} transparent=${rv.transparent}`);

  // ================= 7. TIFF upload path =================
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page2.goto(PAGE_URL);
  // reuse drop via page2: duplicate minimal drop here
  const tifB64 = readB64(tif), yelB64 = readB64(yel);
  await page2.evaluate(async ({ tifB64, yelB64 }) => {
    const mk = (b64, name, type) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name, { type });
    const dt = new DataTransfer();
    dt.items.add(mk(tifB64, 'tif.tif', 'image/tiff'));
    dt.items.add(mk(yelB64, 'yel.png', 'image/png'));
    const el = document.getElementById('uploadA');
    const init = { bubbles: true, cancelable: true, dataTransfer: dt };
    el.dispatchEvent(new DragEvent('drop', init));
  }, { tifB64, yelB64 });
  await page2.waitForFunction(() => document.getElementById('uploadScreen').style.display === 'none', null, { timeout: 20000 });
  const t = await page2.evaluate(() => document.getElementById('infoTagA').textContent);
  check('TIFF drop decodes + auto-starts', t.includes('tif.tif') && t.includes('64×48'), t);

  await browser.close();
  console.log(failures === 0 ? 'ALL E2E PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('E2E ERROR', e); process.exit(2); });
