# ImageCompare-Ultimate — Drop UX + Capture Correctness Plan

## 1. Goals (user intent)

1. **Two-file drop anywhere on upload screen behaves identically** — dropping two
   images on a single tile, on the background, via browse-multi-select, or via
   paste must fill A+B. Drop location must not matter.
2. **Auto-enter compare** — as soon as both slots hold decodable images (together
   or one after the other), go straight to the compare workspace. No dead-end
   state with two images waiting on a Compare click. Keep `Compare` button as
   fallback, keep `Reset` (view reset) and `Close` (back to upload) as-is.
3. **Drops work inside compare mode too** — dropping two images on the stage
   replaces both and re-renders; dropping one image replaces the left (A) or
   right (B) slot based on drop x-position. Drops outside any handler must never
   navigate the page away (file-drop navigation kills state).
4. **Capture == viewport** — `Capture` PNG must match what is on screen for the
   content bounding box, in every slider mode. Known suspect: diagonal (+off-center
   slider, different-size images) diverges and can show gaps/transparent wedges.
5. **Rigorous E2E verification** — drive the real page headless (system Chrome via
   `playwright-core`), assert drop routing, auto-start, slot replacement, and
   pixel-compare captures against element screenshots.

## 2. Code-level plan (all in `ImageCompare-Ultimate.html`, plus `tests/`)

### 2.1 Upload drops — one distribution rule

- Add `multiple` to `#fileA`/`#fileB` inputs; change-handlers route
  `files.length >= 2` to A+B, else to own slot.
- Rewrite `setupDrop` box handler: collect `[...e.dataTransfer.files].filter(isImageFile)`;
  `>= 2` → `handleFileA(files[0]) + handleFileB(files[1])` (same order as the
  background catch-all, so location truly does not matter); `== 1` → own handler.
- Screen-background handler unchanged (already distributes 2).
- Paste path already distributes 2; single paste still overwrites A.

### 2.2 Auto-start

- New `maybeShowImages()`: upload visible → `startCompare()`; already comparing
  → `reloadCompare()`. The reload branch heals the concurrent-finish race.
- Call at end of `handleFileA`/`handleFileB` (after `checkReady()`).
- Rapid double starts cannot starve the load gate: `loadWorkspaceImages` counts
  same-src-already-showing images and listens for `error` too.
- `startCompare` keeps working when invoked from button, auto-start, or repeat.

### 2.3 Compare-mode drops

- New `loadWorkspaceImages(cb)` helper: binds one-shot `load` listeners on
  `imgA`/`imgB`, sets all four `<img>` srcs from `fileAUrl`/`fileBUrl`, fires `cb`
  when both loaded. `startCompare` refactored onto it (fresh-compare callback);
  new `reloadCompare()` uses it with a mode-aware callback (split→`normalizeSplit`
  + keep slider, side→`normalizeSideBySide`, combine/diff→re-render, solo→base).
  `reloadCompare` resets zoom/pan (stale offsets are meaningless for new images)
  but keeps view mode and slider position.
- New `stage` drop handler: `>= 2` files → `await` both slot handlers, then
  `reloadCompare()`; `== 1` → slot = drop-x left/right of stage center, toast
  which slot was replaced, then `reloadCompare()`.
- Document-level `dragover`/`drop` guards: always `preventDefault()` so a missed
  drop can never navigate away; route to upload logic when upload visible, stage
  logic when a drop lands inside `#stage` while comparing, else swallow.

### 2.4 Capture fix (the diagonal gap) — final spec: WYSIWYG from live layout

- Root cause (confirmed by reading `captureComparison`): split-branch clip polygons
  from `getLeftClipPoints()`/`getRightClipPoints()` live in **container-normalized**
  space but are mapped straight onto the cropped content-box canvas.
  User decision after seeing fit-only: capture reproduces the view exactly —
  pan/zoom included — by reading live `getBoundingClientRect` boxes (which
  already contain zoom/pan) instead of recomputed fit math, cropping to the
  visible union ∩ container, tracing the clip unmapped in container coords.
- Letterbox filled with viewport bg (matches screen); split line and division
  exactly as shown, diagonals included.
- E2E pixel proof: per-mode capture-vs-screenshot compare (solids bitwise exact);
  photo proof via deterministic in-page re-render reference (`refMism === 0`);
  drag changes the capture and it still matches the panned viewport.
- E2E pixel proof: per-mode capture-vs-screenshot compare (solids bitwise exact);
  photo proof via deterministic in-page re-render reference (`refMism === 0` over
  a grid) + no transparency holes + drag byte-identity (pan ignored by design).
- Harness lesson: `getContext('2d', {willReadFrequently:true})` rasterizes
  differently than the default context — reference canvases must use the plain
  context, else off-by-one speckle everywhere. Remaining photo-vs-screenshot
  deltas are compositor-vs-canvas rasterizer noise on sharp edges (verified by
  eyeball: capture and viewport look identical).

### 2.5 E2E tests (`tests/`, `playwright-core` + system Chrome, no repo binaries)

- `tests/package.json` + `bun install` (`playwright-core` only). Fixtures via
  system `ffmpeg` into `os.tmpdir()` (solids + TIFF; never the repo); the two
  real `samples/` photos are used directly for the photo cases.
- Cases: (a) multi-select input → auto-start + info tags; (b) 2-file drop on one
  tile → A+B + auto-start; (c) single drop on tile B → B only, no auto-start;
  (d) Close → upload; (e) stage single-drop left/right → correct slot replaced;
  (f) stage two-drop → both replaced; (g) TIFF+PNG drop → decoded + auto-start;
  (h) capture: for vertical/horizontal/diagonal-slash/diagonal-backslash at 35%,
  vertical at 65% — solids bitwise vs screenshot, zero transparent holes;
  (i) fullscreen enter (header) + exit (in-view button — also proves the button
  receives clicks, i.e. the pan-capture fix);
  (j) real samples, diagonal 35%: deterministic re-render reference must match
  bitwise (`refMism === 0`), screenshot deltas stay raster-noise-level;
  (k) after drag, capture bytes identical to pre-drag (pan ignored by design).
- Fixed along the way: concurrent-finish double-start starving the load gate
  (→ same-src counting + error listener + second finisher heals via reload);
  in-view fullscreen button swallowed by stage pointer-capture (→ ignore clicks
  on buttons in the pointerdown handler + keep the button visible in fullscreen).
- In-page pixel work means zero new runtime deps and no committed binaries.

### 2.6 Docs

- `README.md`: one line each for auto-start, compare-mode drops, fit-only
  transparent capture, TIFF support, E2E suite.
- This file stays as the record; delete nothing else.

### 2.7 UI batch: divider-in-capture, solid Download hover, moon/sun theme, 1000% zoom

Goal (user intent): (a) optional divider line burned into captured PNGs;
(b) `Download` (and `Compare`) hover state solid, not translucent; (c) theme
toggle shows moon/sun icon instead of the word "Theme"; (d) 1000% zoom preset.

Code-level plan (all in `ImageCompare-Ultimate.html` unless noted):

1. **Divider-in-capture checkbox**
   - Header, after `#captureBtn`: `<label class="pill" id="dividerCapWrap"
     title="Include the split divider line in captured PNGs"><input
     type="checkbox" id="dividerCapture">Divider</label>`, default unchecked
     (keeps current pixel-exact exports the default).
   - `setViewMode`: `dividerCapWrap.style.display = isSplit ? 'inline-flex' : 'none'`
     (divider exists only in split; side capture is unchanged).
   - `captureComparison`, split branch, after both image draws: if checked, draw
     the divider in container coords (ctx already translated): vertical
     `fillRect(hx-1, 0, 2, H)`, horizontal `fillRect(0, hy-1, W, 2)`, diagonals
     `translate+rotate` mirroring `updateDividerLine` (`atan2(w,h)` /
     `atan2(w,-h)`, `len = hypot*1.2`, `fillRect(-1, -len/2, 2, len)`), color from
     `getComputedStyle(dividerLine).backgroundColor`. Handle circle NOT drawn
     (divider only, per request).
   - E2E: vertical@50% solids, check the box, capture, assert center-column pixel
     near-white + `dimMatch` + hash differs from unchecked; uncheck after.
2. **Solid primary-button hover**
   - Add `--accent-solid: #4c63d2` to both theme blocks; change
     `.btn.primary:hover` to `background: var(--accent-solid); color: #fff;
     border-color: var(--accent-solid)`. Covers `Compare` + result `Download`
     (both are `.btn.primary`); no other buttons touched.
   - E2E: enter combine mode, hover `#resultDownload`, assert computed
     `background-color` alpha is 1.
3. **Moon/sun theme button**
   - Replace button text with `<span id="themeIcon">☀</span>` (dark default);
     new `updateThemeBtn()` sets icon/title/aria-label from current theme:
     dark → `☀` "Switch to light theme", light → `☾` "Switch to dark theme".
     Call from `initTheme()` and the toggle handler. Stays in header-right slot.
   - E2E: click toggles icon + `documentElement` theme attr.
4. **1000% zoom preset**
   - Add `<button class="zoom-preset" data-zoom="10" title="Zoom 1000%">1000%</button>`
     after 500%. Existing `updateZoomUI` exact-match + wheel clamp (max 100)
     already cover it; header wraps on small screens.
   - E2E: click it, assert `zoomInput.value === '1000'`.
5. **Docs**: `README.md` zoom line 100%–500% → 100%–1000%; one bullet for the
   divider-capture option.

Verification: `node --check` on extracted scripts (as before) + full
`tests/e2e.cjs` run, must be ALL PASS.

### 2.8 Joined view (merge Combine + Side by Side) + follow-ups

Goal (user intent): one **Joined** mode replacing Combine and Side by Side, with
options (orientation H/V, gap default 0, background incl. transparent, labels,
export format/quality); A/B edge-to-edge as one locked pan/zoom unit, no
separation by panning; different sizes share height (H) or width (V),
center-aligned; export matches preview. Plus: transparent-background combine
export (PNG/WebP alpha; JPEG flattens to white); divider checkbox renamed to
"Divider in capture"; Reset in Solo restores the base view; Capture available in
all modes and the separate Download button goes away; real-color moon/sun on a
square theme button; square icon Reset/Close buttons.

Code-level plan (all in `ImageCompare-Ultimate.html` unless noted):

1. **Header**: viewToggle `Split | Joined | Diff | Solo` (`#joinedBtn` replaces
   `#sideBtn`+`#combineBtn`); new `#joinedLayoutGroup` seg (`A | B` / `A over B`,
   joined-only, same show/hide pattern as `sliderModeGroup`); `Divider in
   capture` label text (was `Divider`); `#themeBtn` gets `icon-btn` + `🌙/☀️`;
   `#resetBtn` → `↺`, `#backBtn` → `✕`, all three `icon-btn` square
   (34×34, centered) with titles/aria-labels kept.
2. **CSS**: `.btn.icon-btn` square rule; `.side-by-side` block → `.joined`
   strip styles (absolute inset-0 flex-centered container, `.joined-cell`
   relative, `.joined-tag` absolute top-center overlay); `.combine-controls`
   → `.joined-controls` (same rules); `#resultDownload` rule deleted;
   result panel keeps preview for Diff only.
3. **DOM**: `#sideBySide`+panels → `#joinedView` with `#imgJ1/#imgJ2` +
   `#tagA/#tagB`; `#joinedControls` (was combineControls) + Transparent
   checkbox; `#joinedLayout` state var default `'h'`.
4. **Modes**: internal `'combine'` → `'joined'` everywhere (`setViewMode`,
   `getActiveContainer`, capture, reload, resize, tests). `side` mode deleted:
   `normalizeSideBySide`, `imgA2/imgB2`, side `onWheel` branch, side capture
   branch all go. `captureBtn` always visible. `setViewMode`: joined shows
   joinedView + joinedLayoutGroup + joinedControls; diff shows resultPanel +
   joinedControls; capture always on; `resetView` unchanged.
5. **Locked unit**: `updateTransform` applies the identical shared transform to
   `imgJ1/imgJ2` (replacing imgA2/imgB2 in the list); `normalizeJoined` positions
   both boxes absolutely (centers, like split) so pan/zoom math, wheel anchoring
   and capture all reuse the existing machinery — rigid by construction.
6. **`normalizeJoined`**: shared fit size (H: `min` fit-heights like old side
   code; V: mirrored with widths), group centered, `strip gap` from
   `gapControl`, view bg from bgColor (or transparent / white-flatten rule to
   match export), tags honor font size/color. Called on mode-enter, resize,
   and every joined/diff control input.
7. **Export**: `renderCombine` → `renderJoined()` (always downloads):
   natural-scale cells at shared height (H) or width (V), `gap`, bg fill skipped
   when transparent+P export format is PNG/WebP (JPEG flattens onto white,
   commented), centered Before/After labels, `toBlob(format, quality)`.
   Diff keeps preview; Capture in diff downloads current `resultImage.src`.
   `#resultDownload` element + const + stage-guard ref + `onclick` removed;
   new `downloadResultImage()` used by the Capture path.
8. **Capture routing**: split/solo → existing live-viewport path (solo works
   through the same split math at clip 0/100); joined → `renderJoined()`;
   diff → `downloadResultImage()`. Docstring updated.
9. **Solo reset**: Reset button is mode-aware — in Solo it calls `soloShowBase()`
   (base image full-frame) instead of `setSplit(50)`.
10. **Tests** (`tests/e2e.cjs`): drop side branches/refs; joined H export dims +
    region colors + gap column + transparent alpha; V dims + stacked regions;
    interactive adjacency + centering via DOM rects; orientation toggle;
    solo-reset restores full base clip; solo + diff Capture smoke (bytes +
    dimMatch); divider label contains "capture"; icon buttons square with
    aria-labels; theme glyphs `☀️`/`🌙`.
11. **Docs**: README view toggles + Combine/Side bullets → Joined (H/V,
    locked, gap 0 default, transparent bg, labels, export); capture bullet =
    all modes incl. joined/diff/solo; header FEATURE MAP comment updated.

Verification: `node --check` on extracted scripts + full `tests/e2e.cjs`,
must be ALL PASS.

## 3. Risks / open points (decided, not asked)

- Auto-start fires also when the second image arrives long after the first — intended.
- `reloadCompare` resets zoom/pan but keeps mode+slider — intended (new pixels).
- HEIC/HEIF still needs native browser support (no WASM decoder shipped); invalid
  files toast and never trigger auto-start/reload — intended, covered by a test.
- Headless dpr forced to 1 for pixel-exact screenshot comparison.
