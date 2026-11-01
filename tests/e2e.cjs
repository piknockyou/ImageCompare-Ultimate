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
  // Deterministic proof for photos: re-render each image with the SAME live-box
  // ops as the implementation and decide the expected side per grid point from
  // the container-space split line. Must match bitwise.
  async function photoRefCheck(pg, capBytes) {
    return pg.evaluate(async ({ cap }) => {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(cap)]));
      const cw = bmp.width, ch = bmp.height;
      const area = document.getElementById('compareView');
      const arect = area.getBoundingClientRect();
      const liveBox = im => {
        const r = im.getBoundingClientRect();
        return { im, x: r.left - arect.left, y: r.top - arect.top, w: r.width, h: r.height };
      };
      const boxes = [imgB, imgA].map(liveBox);
      let ux = Infinity, uy = Infinity, umx = -Infinity, umy = -Infinity;
      for (const b of boxes) {
        ux = Math.min(ux, b.x); uy = Math.min(uy, b.y);
        umx = Math.max(umx, b.x + b.w); umy = Math.max(umy, b.y + b.h);
      }
      const cx0 = Math.max(ux, 0), cy0 = Math.max(uy, 0);
      const dpr = window.devicePixelRatio || 1;
      const cc = document.createElement('canvas'); cc.width = cw; cc.height = ch;
      const cx = cc.getContext('2d');
      cx.drawImage(bmp, 0, 0);
      const capD = cx.getImageData(0, 0, cw, ch).data;
      const ref = box => {
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        // Plain context on purpose: getContext('2d', {willReadFrequently:true})
        // rasterizes differently and produces off-by-one speckle against captures.
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false; g.scale(dpr, dpr); g.translate(-cx0, -cy0);
        g.fillStyle = getComputedStyle(document.getElementById('stage')).backgroundColor;
        g.fillRect(cx0, cy0, cw, ch);
        drawContain(g, box.im, box.x, box.y, box.w, box.h);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const boxA = boxes.find(b => b.im === imgA), boxB = boxes.find(b => b.im === imgB);
      const refA = ref(boxA), refB = ref(boxB);
      const opq = new Uint8Array(cw * ch);
      for (let k = 0; k < cw * ch; k++) if (capD[k * 4 + 3] !== 0) opq[k] = 1;
      const mixed = (i, j) => {
        let o = 0, t = 0;
        for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
          const x = i + a, y = j + b;
          if (x < 0 || y < 0 || x >= cw || y >= ch || !opq[y * cw + x]) t++; else o++;
          if (o && t) return true;
        }
        return false;
      };
      const slider = document.getElementById('slider');
      const vW = arect.width, vH = arect.height;
      const hx = parseFloat(slider.style.left) / 100 * vW, hy = parseFloat(slider.style.top) / 100 * vH;
      const norm = Math.sqrt(1 / (vW * vW) + 1 / (vH * vH));
      let mism = 0, sampled = 0;
      const mismSpots = [];
      for (let j = 0; j < ch; j += 8) for (let i = 0; i < cw; i += 8) {
        const nx = (i + cx0) / vW, ny = (j + cy0) / vH;
        let seam, aSide;
        if (sliderMode === 'vertical') { seam = Math.abs(nx - handleX) * vW; aSide = nx < handleX; }
        else if (sliderMode === 'horizontal') { seam = Math.abs(ny - handleY) * vH; aSide = ny < handleY; }
        else if (sliderMode === 'diagonal-slash') { seam = Math.abs(nx + ny - (handleX + handleY)) / norm; aSide = nx + ny < handleX + handleY; }
        else { seam = Math.abs(ny - nx - (handleY - handleX)) / norm; aSide = ny - nx < handleY - handleX; }
        if (seam < 6) continue;
        if (Math.hypot(i + cx0 - hx, j + cy0 - hy) < 40) continue;
        if (mixed(i, j)) continue;
        const k = (j * cw + i) * 4, r = aSide ? refA : refB;
        if (capD[k] !== r[k] || capD[k+1] !== r[k+1] || capD[k+2] !== r[k+2] || capD[k+3] !== r[k+3]) {
          mism++;
          if (mismSpots.length < 15) mismSpots.push([i, j, aSide ? 'A' : 'B', capD[k], capD[k+1], capD[k+2], capD[k+3], r[k], r[k+1], r[k+2], r[k+3]]);
        }
        sampled++;
      }
      return { mism, sampled, mismSpots, sm: sliderMode };
    }, { cap: capBytes });
  }
  async function captureCaseOn(pg, sliderMode, pct) {
    await pg.evaluate(({ sliderMode, pct }) => {
      document.querySelector(`#sliderModeGroup button[data-mode="${sliderMode}"]`).click();
      setSplit(pct);
    }, { sliderMode, pct });
    await pg.waitForTimeout(400);
    await pg.evaluate(() => { window.__capDone = false; });
    await pg.click('#captureBtn');
    await pg.waitForFunction(() => window.__capDone, null, { timeout: 10000 });
    const capBytes = await pg.evaluate(() => Array.from(window.__capBuf));
    const shot = await pg.locator('#compareView').screenshot();
    const res = await pg.evaluate(async ({ cap, shot }) => {
      const bmp = async a => createImageBitmap(new Blob([new Uint8Array(a)]));
      const [cb, sb] = await Promise.all([bmp(cap), bmp(shot)]);
      const cw = cb.width, ch = cb.height;
      const cc = document.createElement('canvas'); cc.width = cw; cc.height = ch;
      const cx = cc.getContext('2d');
      cx.drawImage(cb, 0, 0);
      const capData = cx.getImageData(0, 0, cw, ch).data;
      // Reference crop from the LIVE layout (same union∩container math as the
      // implementation, so pan/zoom are honored): screenshot ground truth.
      const area = document.getElementById('compareView');
      const view = area.getBoundingClientRect();
      const refImgs = [imgB, imgA];
      let ux = Infinity, uy = Infinity, umx = -Infinity, umy = -Infinity;
      for (const im of refImgs) {
        const r = im.getBoundingClientRect();
        const x = r.left - view.left, y = r.top - view.top;
        ux = Math.min(ux, x); uy = Math.min(uy, y);
        umx = Math.max(umx, x + r.width); umy = Math.max(umy, y + r.height);
      }
      const cx0 = Math.max(ux, 0), cy0 = Math.max(uy, 0);
      const cw2 = Math.min(umx, view.width) - cx0, ch2 = Math.min(umy, view.height) - cy0;
      // Drawn-content edges (object-fit centres each image inside its box, so an
      // edge can sit on a half pixel). CSS and canvas then disagree on that row or
      // column by one pixel while the rendered result is identical to the eye.
      const edges = refImgs.map(im => {
        const r = im.getBoundingClientRect();
        const cb = containBox(r.width, r.height, im.naturalWidth, im.naturalHeight);
        const ex = r.left - view.left + (r.width - cb.dw) / 2 - cx0;
        const ey = r.top - view.top + (r.height - cb.dh) / 2 - cy0;
        return { x0: ex, y0: ey, x1: ex + cb.dw, y1: ey + cb.dh };
      });
      const nearEdge = (i, j) => edges.some(e => {
        const inY = j >= e.y0 - 2 && j <= e.y1 + 2;
        const inX = i >= e.x0 - 2 && i <= e.x1 + 2;
        return (inY && (Math.abs(i - e.x0) <= 2 || Math.abs(i - e.x1) <= 2)) ||
               (inX && (Math.abs(j - e.y0) <= 2 || Math.abs(j - e.y1) <= 2));
      });
      const dimMatch = Math.round(cw2) === cw && Math.round(ch2) === ch;
      const sx = Math.round(cx0), sy = Math.round(cy0);
      const sc = document.createElement('canvas'); sc.width = view.width; sc.height = view.height;
      const sx2 = sc.getContext('2d');
      sx2.drawImage(sb, 0, 0);
      const shotData = sx2.getImageData(sx, sy, cw, ch).data;
      // mask: seam band + handle + content border (AA zones), derived from live state
      // canvas px -> container px uses the exact (fractional) crop origin
      const slider = document.getElementById('slider');
      const hx = parseFloat(slider.style.left) / 100 * view.width;
      const hy = parseFloat(slider.style.top) / 100 * view.height;
      const oxE = cx0, oyE = cy0;
      const vW = view.width, vH = view.height;
      const norm = Math.sqrt(1 / (vW * vW) + 1 / (vH * vH)); // px per normalized unit along seam normal
      const seamGap = (i, j) => {
        const nx = (i + oxE) / vW, ny = (j + oyE) / vH;
        if (sliderMode === 'vertical') return Math.abs(nx - handleX) * vW;
        if (sliderMode === 'horizontal') return Math.abs(ny - handleY) * vH;
        if (sliderMode === 'diagonal-slash') return Math.abs(nx + ny - (handleX + handleY)) / norm;
        return Math.abs(ny - nx - (handleY - handleX)) / norm;
      };
      const bgm = getComputedStyle(document.getElementById('stage')).backgroundColor.match(/[\d.]+/g).map(Number);
      // Opaque mask: boundary pixels (mixed 5x5 neighborhood) are excluded from
      // all assertions — subpixel placement between CSS and canvas rasterizers
      // can disagree by a pixel exactly at contain edges, which is invisible.
      const opq = new Uint8Array(cw * ch);
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) if (capData[((j * cw + i) * 4) + 3] !== 0) opq[j * cw + i] = 1;
      const mixed = (i, j) => {
        let o = 0, t = 0;
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
          const x = i + a, y = j + b;
          if (x < 0 || y < 0 || x >= cw || y >= ch || !opq[y * cw + x]) t++;
          else o++;
          if (o && t) return true;
        }
        return false;
      };
      let bad = 0, masked = 0, transparent = 0, transparentWrong = 0, n = 0, gross = 0, grossFar = 0, sumD = 0;
      const hist = [0, 0, 0, 0]; // <25, 25-60, 60-150, >150
      const badSpots = [], grossSpots = [];
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
        const k = (j * cw + i) * 4;
        if (mixed(i, j) || nearEdge(i, j)) { masked++; continue; }
        if (capData[k + 3] === 0) {
          transparent++;
          const d = Math.abs(shotData[k] - bgm[0]) + Math.abs(shotData[k+1] - bgm[1]) + Math.abs(shotData[k+2] - bgm[2]);
          if (d > 36) transparentWrong++;
          continue;
        }
        n++;
        const dh = Math.hypot(i - (hx - sx), j - (hy - sy));
        const edge = Math.min(i, j, cw - 1 - i, ch - 1 - j);
        if (dh < 30 || edge < 2 || seamGap(i, j) < 4) { masked++; continue; }
        const d = Math.abs(capData[k] - shotData[k]) + Math.abs(capData[k+1] - shotData[k+1]) + Math.abs(capData[k+2] - shotData[k+2]);
        sumD += d;
        hist[d < 25 ? 0 : d <= 60 ? 1 : d <= 150 ? 2 : 3]++;
        if (d > 150) {
          gross++;
          if (grossSpots.length < 30) grossSpots.push([i, j]);
          // structural errors land far from any transparency; edge-raster noise hugs it
          let far = true;
          for (let a = -10; a <= 10 && far; a++) for (let b = -10; b <= 10; b++) {
            const x = i + a, y = j + b;
            if (x < 0 || y < 0 || x >= cw || y >= ch || !opq[y * cw + x]) { far = false; break; }
          }
          if (far) grossFar++;
        }
        if (d > 24) { bad++; if (badSpots.length < 40) badSpots.push([i, j, capData[k], capData[k+1], capData[k+2], shotData[k], shotData[k+1], shotData[k+2]]); }
      }
      // Photo metric: per-pixel comparison cannot be fair for a downscaled photo,
      // because the compositor and canvas each resample the same source and pick
      // different neighbours — measured at mean 1.1 / max 22 on 16x16 block means
      // for a correct capture, against mean 39 / max 234 for a swapped-image
      // mismatch. Block means absorb the resampling phase while any structural
      // error (wrong image, gap, misplacement) still moves whole blocks.
      const BS = 16, bw = Math.ceil(cw / BS), bh = Math.ceil(ch / BS);
      const bdiffs = [];
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        let sCap = 0, sShot = 0, m = 0;
        for (let j = by * BS; j < Math.min((by + 1) * BS, ch); j++)
          for (let i = bx * BS; i < Math.min((bx + 1) * BS, cw); i++) {
            const k = (j * cw + i) * 4;
            sCap += (capData[k] + capData[k + 1] + capData[k + 2]) / 3;
            sShot += (shotData[k] + shotData[k + 1] + shotData[k + 2]) / 3;
            m++;
          }
        bdiffs.push(Math.abs(sCap - sShot) / m);
      }
      const blockAvg = bdiffs.reduce((a, b) => a + b, 0) / bdiffs.length;
      const blockMax = Math.max(...bdiffs);
      let h1 = 0x811c9dc5;
      for (let q = 0; q < cap.length; q++) { h1 ^= cap[q]; h1 = Math.imul(h1, 0x01000193) >>> 0; }
      return { bad, blockAvg, blockMax, masked, n, transparent, transparentWrong, cw, ch, dimMatch, gross, grossFar, mean: n ? sumD / n : 0, hist, badSpots, grossSpots,
        hash: h1.toString(16) };
    }, { cap: capBytes, shot: Array.from(shot) });
    res.capBytes = capBytes;
    return res;
  }
  async function captureCase(sliderMode, pct) { return captureCaseOn(page, sliderMode, pct); }
  for (const m of ['vertical', 'horizontal', 'diagonal-slash', 'diagonal-backslash']) {
    const r = await captureCase(m, 35);
    check(`capture==viewport ${m}@35%`,
      r.bad === 0 && r.transparentWrong === 0 && r.dimMatch,
      `bad=${r.bad} tWrong=${r.transparentWrong} masked=${r.masked}/${r.n} size=${r.cw}x${r.ch}` +
      (r.bad ? ` spots=${JSON.stringify(r.badSpots)}` : ''));
  }
  const rv = await captureCase('vertical', 65);
  check('capture==viewport vertical@65%', rv.bad === 0 && rv.transparentWrong === 0 && rv.dimMatch, `bad=${rv.bad} tWrong=${rv.transparentWrong}`);

  // ================= 6b. UI batch: icon buttons, divider, speed factor, autoplay-during-pan ===
  await page.evaluate(() => {
    document.querySelector('#sliderModeGroup button[data-mode="vertical"]').click();
    setSplit(50);
  });
  const rDiv = await captureCase('vertical', 50);
  const seamAdj = await page.evaluate(async ({ cap }) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(cap)]));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const row = Math.floor(c.height / 2);
    const isCyan = k => d[k] < 80 && d[k+1] > 170 && d[k+2] > 170;
    const isYel = k => d[k] > 170 && d[k+1] > 170 && d[k+2] < 80;
    let found = false;
    for (let i = 0; i < c.width - 1; i++) {
      if (isCyan((row * c.width + i) * 4) && isYel((row * c.width + i + 1) * 4)) { found = true; break; }
    }
    return { found, w: c.width, h: c.height };
  }, { cap: rDiv.capBytes });
  check('capture divider always on with complementary colors (cyan|yellow)',
    rDiv.dimMatch && seamAdj.found,
    `found=${seamAdj.found} size=${seamAdj.w}x${seamAdj.h}`);

  await page.click('.zoom-preset[data-zoom="10"]');
  check('1000% zoom preset selectable',
    await page.evaluate(() => document.getElementById('zoomInput').value) === '1000');
  await page.click('.zoom-preset[data-zoom="1"]');

  const iconBefore = await page.evaluate(() => document.getElementById('themeIcon').textContent);
  await page.click('#themeBtn');
  const themeAfter = await page.evaluate(() => ({
    icon: document.getElementById('themeIcon').textContent,
    theme: document.documentElement.getAttribute('data-theme') || 'dark',
  }));
  check('theme button shows moon/sun and toggles theme',
    iconBefore === '☀️' && themeAfter.icon === '🌙' && themeAfter.theme === 'light',
    `icon=${iconBefore}->${themeAfter.icon} theme=${themeAfter.theme}`);
  await page.click('#themeBtn'); // restore dark default

  check('header buttons are square icons (play/capture/fullscreen/reset/close)',
    await page.evaluate(() => {
      const ids = ['animateToggleBtn', 'captureBtn', 'fullscreenBtn', 'resetBtn', 'backBtn'];
      return ids.every(id => {
        const el = document.getElementById(id);
        return el && el.offsetWidth === el.offsetHeight && !!el.getAttribute('aria-label');
      });
    }),
    await page.evaluate(() => ['animateToggleBtn', 'captureBtn', 'fullscreenBtn'].map(id => document.getElementById(id).textContent).join(' ')));
  check('play/capture/fullscreen glyphs',
    await page.evaluate(() =>
      document.getElementById('animateToggleBtn').textContent === '▶' &&
      document.getElementById('captureBtn').textContent === '📷' &&
      document.getElementById('fullscreenBtn').textContent === '⛶'));
  check('speed is a factor (x) with 0.25-4 range',
    await page.evaluate(() => {
      const inp = document.getElementById('speedInput');
      return document.getElementById('speedValue').textContent.endsWith('×') &&
        inp.min === '0.25' && inp.max === '4' && inp.value === '1';
    }));
  check('transparent background is the default',
    await page.evaluate(() => document.getElementById('transparentBg').checked === true));
  // autoplay keeps running across a pan drag (regression: pan used to stop it)
  await page.click('#animateToggleBtn');
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.left + r.width * 0.22, y: r.top + r.height * 0.5 }; });
  await page.mouse.move(st.x, st.y);
  await page.mouse.down();
  await page.mouse.move(st.x + 120, st.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  check('autoplay sweep survives panning',
    await page.evaluate(() => document.getElementById('animateToggleBtn').dataset.state === 'stop'));
  await page.click('#animateToggleBtn'); // stop the sweep for deterministic later captures
  await page.evaluate(() => { panX = 0; panY = 0; updateTransform(); });

  // ================= 6c. Joined view: locked layout + export =================
  await page.click('#joinedBtn');
  await page.waitForTimeout(300);
  const jh = await page.evaluate(() => {
    const a = document.getElementById('imgJ1').getBoundingClientRect();
    const b = document.getElementById('imgJ2').getBoundingClientRect();
    const view = document.getElementById('joinedView').getBoundingClientRect();
    return { ah: a.height, bh: b.height, ax: a.left, bx: b.left, bw: b.width, aw: a.width, vw: view.width, vh: view.height,
      natA: [imgJ1.naturalWidth, imgJ1.naturalHeight], natB: [imgJ2.naturalWidth, imgJ2.naturalHeight] };
  });
  check('joined H shares height and sits edge-to-edge, centered',
    Math.abs(jh.ah - jh.bh) < 1.5 && Math.abs(jh.bx - (jh.ax + jh.aw)) < 1.5 &&
    Math.abs((jh.ax + jh.bx + jh.bw) / 2 - jh.vw / 2) < 2,
    `h=${jh.ah.toFixed(1)}/${jh.bh.toFixed(1)} a@${jh.ax.toFixed(1)}+${jh.aw.toFixed(1)} b@${jh.bx.toFixed(1)}+${jh.bw.toFixed(1)} view=${jh.vw.toFixed(0)}x${jh.vh.toFixed(0)} nat=${jh.natA}/${jh.natB}`);
  // rigid-unit zoom: shared edge must stay glued at 400% and 50% (no overblend, no gap)
  async function joinedSeam() {
    return page.evaluate(() => {
      const a = document.getElementById('imgJ1').getBoundingClientRect();
      const b = document.getElementById('imgJ2').getBoundingClientRect();
      return (b.left - (a.left + a.width)) / zoom;
    });
  }
  await page.click('.zoom-preset[data-zoom="5"]');
  await page.waitForTimeout(200);
  const seam4 = await joinedSeam();
  await page.evaluate(() => { document.getElementById('zoomInput').value = '50'; document.getElementById('zoomInput').dispatchEvent(new Event('blur')); });
  await page.evaluate(() => { document.getElementById('zoomInput').value = '50'; applyZoomInput(); });
  await page.waitForTimeout(200);
  const seamH = await joinedSeam();
  await page.click('.zoom-preset[data-zoom="1"]');
  await page.waitForTimeout(200);
  check('joined shared edge glued at 500% and 50% zoom',
    Math.abs(seam4) < 4 && Math.abs(seamH) < 4,
    `seam500=${Number(seam4).toFixed(2)} seam50=${Number(seamH).toFixed(2)} (pre-zoom px)`);
  async function joinedExport(pg, probes) {
    await pg.evaluate(() => { window.__capDone = false; });
    await pg.click('#captureBtn');
    await pg.waitForFunction(() => window.__capDone, null, { timeout: 10000 });
    const bytes = await pg.evaluate(() => Array.from(window.__capBuf));
    return pg.evaluate(async ({ bytes, probes }) => {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const px = ([x, y]) => { const k = (y * c.width + x) * 4; return [d[k], d[k+1], d[k+2], d[k+3]]; };
      return { w: c.width, h: c.height, px: probes.map(px) };
    }, { bytes, probes });
  }
  // red 120x80 + blue 80x120, H: common height 120 -> A 180x120 at x0, B 80x120 at x180
  let je = await joinedExport(page, [[10, 60], [220, 60]]);
  check('joined H export: shared height, A left / B right',
    je.w === 260 && je.h === 120 &&
    je.px[0][0] > 200 && je.px[0][1] < 80 && je.px[0][2] < 80 &&
    je.px[1][2] > 200 && je.px[1][0] < 80 && je.px[1][1] < 80,
    `${je.w}x${je.h} A=${je.px[0]} B=${je.px[1]}`);
  await page.click('#joinedLayoutGroup button[data-layout="v"]');
  await page.waitForTimeout(300);
  // V: common width 120 -> A 120x80 at y0, B 120x180 at y80
  je = await joinedExport(page, [[60, 10], [60, 200]]);
  check('joined V export: shared width, A over B',
    je.w === 120 && je.h === 260 &&
    je.px[0][0] > 200 && je.px[0][1] < 80 &&
    je.px[1][2] > 200 && je.px[1][0] < 80,
    `${je.w}x${je.h} A=${je.px[0]} B=${je.px[1]}`);
  const jv = await page.evaluate(() => {
    const a = document.getElementById('imgJ1').getBoundingClientRect();
    const b = document.getElementById('imgJ2').getBoundingClientRect();
    const view = document.getElementById('joinedView').getBoundingClientRect();
    return { aw: a.width, bw: b.width, ax: a.left, bx: b.left, vw: view.width,
      by: b.top, ay: a.top, ah: a.height };
  });
  check('joined V stacks centered',
    Math.abs(jv.aw - jv.bw) < 1.5 && Math.abs(jv.by - (jv.ay + jv.ah)) < 1.5 &&
    Math.abs((jv.ax + jv.bx + jv.bw) / 2 - jv.vw / 2) < 2,
    `w=${jv.aw.toFixed(1)}/${jv.bw.toFixed(1)} stack@${jv.by.toFixed(1)}`);
  await page.click('#joinedLayoutGroup button[data-layout="h"]');
  await page.evaluate(() => {
    document.getElementById('transparentBg').checked = false;
    document.getElementById('gapControl').value = 10;
    document.getElementById('gapControl').dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(200);
  // gap zone x in [180,190): background white by default
  je = await joinedExport(page, [[185, 60]]);
  check('joined gap separates by background color',
    je.w === 270 && je.h === 120 && je.px[0][0] > 200 && je.px[0][1] > 200 && je.px[0][2] > 200,
    `${je.w}x${je.h} gap=${je.px[0]}`);
  await page.evaluate(() => {
    document.getElementById('transparentBg').checked = true;
    document.getElementById('transparentBg').dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(200);
  je = await joinedExport(page, [[185, 60]]);
  check('joined transparent export keeps alpha',
    je.w === 270 && je.px[0][3] === 0, `gap=${je.px[0]}`);
  await page.evaluate(() => {
    document.getElementById('transparentBg').checked = true;
    document.getElementById('transparentBg').dispatchEvent(new Event('change'));
    document.getElementById('gapControl').value = 0;
    document.getElementById('gapControl').dispatchEvent(new Event('input'));
  });

  // ================= 6d. Solo reset + capture-everywhere =================
  await page.click('#soloBtn');
  await page.evaluate(() => setSplit(50)); // dirty the clip; reset must restore base
  await page.click('#resetBtn');
  const soloClip = await page.evaluate(() => document.getElementById('splitClip').style.clipPath);
  const soloNums = (soloClip.match(/[\d.]+/g) || []).map(Number);
  check('reset in solo restores the base view',
    JSON.stringify(soloNums) === JSON.stringify([0, 0, 100, 0, 100, 100, 0, 100]),
    `clip=${soloClip}`);
  await page.evaluate(() => { window.__capDone = false; });
  await page.click('#captureBtn');
  await page.waitForFunction(() => window.__capDone, null, { timeout: 10000 });
  check('capture works in solo mode',
    (await page.evaluate(() => window.__capBuf.length)) > 1000);

  await page.click('#diffBtn');
  await page.waitForFunction(() => !!document.getElementById('resultImage').getAttribute('src'), null, { timeout: 10000 });
  await page.evaluate(() => { window.__capDone = false; });
  await page.click('#captureBtn');
  await page.waitForFunction(() => window.__capDone, null, { timeout: 10000 });
  check('capture downloads the diff result',
    (await page.evaluate(() => window.__capBuf.length)) > 1000);
  await page.click('#splitBtn');

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

  // ================= 8b. fullscreen toggle =================
  // ================= 8a. primary-button hover is solid =================
  const page4 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page4.goto(PAGE_URL);
  await page4.hover('#compareBtn');
  await page4.waitForTimeout(350); // let the 0.15s hover transition settle
  check('primary button hover background is solid',
    await page4.evaluate(() => {
      const m = getComputedStyle(document.getElementById('compareBtn')).backgroundColor.match(/[\d.]+/g).map(Number);
      return m.length === 4 ? m[3] === 1 : true;
    }));
  await page4.close();

  // ================= 8b. fullscreen toggle =================
  const fsEnabled = await page.evaluate(() => document.fullscreenEnabled);
  if (!fsEnabled) {
    check('fullscreen toggle (skipped: unsupported headless)', true, 'fullscreenEnabled=false');
  } else {
    await page.click('#fullscreenBtn');
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement, null, { timeout: 5000 });
    check('fullscreen enters on header button (whole page)', true);
    await page.click('#fullscreenBtn'); // toggle off (Esc also exits natively)
    await page.waitForFunction(() => document.fullscreenElement === null, null, { timeout: 5000 });
    check('fullscreen exits on header toggle', true);
    check('no in-preview fullscreen button remains',
      await page.evaluate(() => !document.getElementById('fullscreenBtn2')));
  }
  // ================= 9. real samples, diagonal + drag (pan) =================
  const page3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page3.on('pageerror', e => console.log('PAGEERROR |', e.message));
  await page3.goto(PAGE_URL);
  const sampDir = path.join(ROOT, 'samples');
  const sampA = path.join(sampDir, 'ChatGPT Image Jul 14, 2026, 01_05_40 PM.png');
  const sampB = path.join(sampDir, 'ChatGPT Image Jul 14, 2026, 12_55_14 PM.png');
  await page3.setInputFiles('#fileA', [sampA, sampB]);
  await page3.waitForFunction(() => document.getElementById('uploadScreen').style.display === 'none', null, { timeout: 20000 });
  await page3.evaluate(() => {
    window.__capDone = false; window.__capBuf = null;
    window.downloadBlob = async (blob) => {
      window.__capBuf = new Uint8Array(await blob.arrayBuffer());
      window.__capDone = true;
    };
  });
  const rest = await captureCaseOn(page3, 'diagonal-slash', 35);
  const ref = await photoRefCheck(page3, rest.capBytes);
  check('capture==viewport samples diagonal@35% at rest',
    ref.mism === 0 && rest.transparentWrong === 0 && rest.dimMatch && rest.blockAvg < 5 && rest.blockMax < 60,
    `refMism=${ref.mism}/${ref.sampled} blockAvg=${rest.blockAvg.toFixed(2)} blockMax=${rest.blockMax.toFixed(1)} tWrong=${rest.transparentWrong} size=${rest.cw}x${rest.ch}` +
    (ref.mism ? ` spots=${JSON.stringify(ref.mismSpots)}` : ''));
  // drag to pan, then capture again
  const c = await page3.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page3.mouse.move(c.x, c.y);
  await page3.mouse.down();
  await page3.mouse.move(c.x + 120, c.y + 60, { steps: 10 });
  await page3.mouse.up();
  await page3.waitForTimeout(300);
  const dragged = await captureCaseOn(page3, 'diagonal-slash', 35);
  check('capture reproduces pan (matches panned viewport, differs from rest)',
    dragged.hash !== rest.hash && dragged.dimMatch && dragged.transparentWrong === 0 && dragged.blockAvg < 5 && dragged.blockMax < 60,
    `rest=${rest.hash} dragged=${dragged.hash} blockAvg=${dragged.blockAvg.toFixed(2)} blockMax=${dragged.blockMax.toFixed(1)} tWrong=${dragged.transparentWrong} size=${dragged.cw}x${dragged.ch}`);

  // ================= 10. no native-drag hijack: press on the clip wrapper
  // (letterbox, the miss you get chasing the moving slider during autoplay) must
  // pan 1:1 for the WHOLE press — a native dragstart used to fire pointercancel
  // mid-gesture, leaving only a micro-pan and a dead press.
  await page3.evaluate(() => {
    window.__dragstarts = 0;
    document.addEventListener('dragstart', () => { window.__dragstarts++; }, true);
    document.querySelector('#sliderModeGroup button[data-mode="vertical"]').click();
    setSplit(50); stopAnimation(); zoom = 1; panX = 0; panY = 0; updateTransform();
  });
  await page3.waitForTimeout(200);
  const w0 = await page3.evaluate(() => {
    const v = document.getElementById('compareView').getBoundingClientRect();
    return { x: v.left + 10, y: v.top + v.height / 2 };
  });
  await page3.mouse.move(w0.x, w0.y);
  await page3.mouse.down();
  await page3.mouse.move(w0.x + 150, w0.y + 40, { steps: 10 });
  await page3.mouse.up();
  await page3.waitForTimeout(200);
  const w1 = await page3.evaluate(() => ({ panX, panY, drag: isDragging, pan: isPanning, n: window.__dragstarts }));
  check('wrapper/letterbox press pans fully, no native drag hijack',
    Math.abs(w1.panX - 150) < 5 && Math.abs(w1.panY - 40) < 5 && w1.n === 0 && !w1.drag && !w1.pan,
    `pan=${w1.panX.toFixed(1)},${w1.panY.toFixed(1)} dragstarts=${w1.n}`);

  await browser.close();
  console.log(failures === 0 ? 'ALL E2E PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('E2E ERROR', e); process.exit(2); });
