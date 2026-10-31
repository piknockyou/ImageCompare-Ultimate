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

### 2.4 Capture fix (the diagonal gap) — final spec: fit-only, exact split, transparent

- Root cause (confirmed by reading `captureComparison`): split-branch clip polygons
  from `getLeftClipPoints()`/`getRightClipPoints()` live in **container-normalized**
  space but are mapped straight onto the **cropped content-box** canvas
  (`p.x * ubW`), ignoring the content origin `(ux, uy)` and container size.
  Correct canvas mapping: `X = p.x * arect.width - ux`, `Y = p.y * arect.height - uy`.
- Spec per user call: fit-only bounding box (zoom/pan ignored — capture is the
  zoomed-out view, never a larger made-up canvas), split position/division exactly
  as shown, letterbox/gap zones TRANSPARENT (no invented background).
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

## 3. Risks / open points (decided, not asked)

- Auto-start fires also when the second image arrives long after the first — intended.
- `reloadCompare` resets zoom/pan but keeps mode+slider — intended (new pixels).
- HEIC/HEIF still needs native browser support (no WASM decoder shipped); invalid
  files toast and never trigger auto-start/reload — intended, covered by a test.
- Headless dpr forced to 1 for pixel-exact screenshot comparison.
