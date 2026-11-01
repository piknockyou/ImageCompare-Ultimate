# ImageCompare-Ultimate

A single-file, fully **offline** image comparison tool. Everything (HTML + CSS +
JS) lives in one self-contained file — no server, no CDN, no network calls.
Your images never leave your machine.

Drop two images (or paste from clipboard / click to browse), then compare them in
four view modes with cursor-anchored zoom, drag-to-pan, and a PNG capture export.

![ImageCompare-Ultimate split view comparison](assets/screenshot.jpg)

---

## Features

- **4 view modes**
  - **Split** — slider wipe between the two images, with 4 orientations:
    vertical `|`, horizontal `—`, diagonal `/` and diagonal `\`.
  - **Joined** — A and B edge-to-edge as one locked unit (shared pan/zoom, rigid about the group center so the shared edge never overlaps or gaps at any zoom);
    horizontal `A | B` or vertical `A over B`; gap (default 0/snug),
    background (transparent by default), labels, export format/quality.
  - **Pixel Diff** — pixels that differ between A and B are highlighted red.
  - **Solo** — shows one image at rest; press-and-hold to reveal the other.
- **Cursor-anchored zoom** — scroll wheel zooms toward the pointer; works in
  every mode at any zoom level.
- **Drag-to-pan** — anywhere on the image pans it in every mode (the slider
  handle is the only direct slider control); panning is never interrupted, including mid-sweep and over letterbox zones.
- **Diagonal divider** — the divider line is computed to be exactly collinear
  with the clip edge at any aspect ratio (`atan2` based, not a fixed 45°).
- **Autoplay sweep** — animates the slider back and forth at an adjustable speed factor (keeps running while you pan).
- **Keyboard accessible** — focus the slider and use arrow keys (Shift = larger
  steps).
- **Fullscreen** (⛶, every mode, Esc exits) and **Capture** (📷, current view as PNG in every mode; joined and
  diff export through the same Capture button, so no separate Download button).
- **Moon/sun theme button** — square icon toggle in the header, persisted to
  `localStorage` under the key `ictheme`; square icon Reset and Close buttons.
- **Clipboard paste** — paste an image with Ctrl/Cmd+V onto a box or the page.
- **Two-file drop anywhere** — dropping two images on one tile, the background,
  or the file picker fills A+B; location never matters.
- **Auto-start** — the moment both slots hold decodable images, compare opens
  directly (together or one after the other).
- **Stage drops** — while comparing, drop two images to replace both, or one
  image to replace the left (A) / right (B) slot by drop position.
- **Capture matches viewport** — WYSIWYG PNG: reproduces pan/zoom from the live
  layout, split line and division exactly as shown, including diagonals;
  cropped to the visible union; letterbox filled with viewport bg.
  - **Divider burn-in (always on)** — split captures always burn a 2px divider in the complementary color of the touching pixels (per side), so the seam stays visible on any image.
- **TIFF + broad formats** — `.tif/.tiff` decode in-page via vendored UTIF.js
  (MIT, Photopea, offline single-file); other extensions (HEIC/HEIF, AVIF, BMP,
  ICO, SVG, WebP, RAW) accepted when the browser can render them, with a clear
  toast otherwise.
- **E2E verified** — `tests/e2e.cjs` (Playwright + system Chrome, runtime-made
  fixtures, nothing committed) checks drop routing, auto-start, slot swaps, and
  pixel-compares every capture mode against the viewport.

---

## Usage

1. Open `index.html` in any modern browser. It is one file: copy it anywhere,
   or serve the repository root as a static site.
2. On the upload screen, provide **Image A** and **Image B** via:
   - drag & drop (drop two files at once, or one per box),
   - click a box to browse, or
   - Ctrl/Cmd+V to paste from the clipboard.
3. Click **Compare**.
4. Use the header controls:
    - **View toggles**: Split · Joined · Diff · Solo
    - **Layout** (Joined only): A | B or A over B
   - **Slider mode** (Split only): glyph buttons for vertical, diagonal `/`, diagonal `\`, horizontal
   - **Capture** (📷, primary): current view as PNG in every mode (first in the action group, per toolbar convention)
   - **Zoom**: presets (100%, 200%, 500%, 1000%), a custom % input, or the mouse wheel
   - **Play** (▶ green / ⏹ red): auto-sweep the slider (speed factor ×, keeps running while panning)
    - **Fullscreen** (⛶), **theme**, **Reset**, **Close** (square icon buttons; destructive/exit last)
   - **Base: A/B** (Solo only, next to the view toggles): which image shows at rest

> **Solo mode tip:** at rest it shows the "base" image (toggle with the
> *Base: A/B* button). Press and hold on the image to peek at the other; drag
> while holding to pan instead.

---

## Origins & Licensing

This tool is a clean-room **merge of three MIT-licensed projects**, retaining
their respective permissions:

| Project | Author | License | Repo | Features |
| ------- | ------ | ------- | ---- | -------- |
| [`beforeafter`](https://github.com/yani-/beforeafter) | [Yani Iliev](https://github.com/yani-) | MIT | `yani-/beforeafter` | Static Combine, Pixel Diff, clipboard paste |
| [`compare-image`](https://github.com/tchung1970/compare-image) | [tchung1970](https://github.com/tchung1970) | MIT | `tchung1970/compare-image` | Split / side-by-side slider, zoom/pan, PNG capture, info bar |
| [`image-swipe-compare`](https://github.com/hhkaos/image-swipe-compare) | [hhkaos](https://github.com/hhkaos) | MIT | `hhkaos/image-swipe-compare` | Diagonal slider modes, keyboard nav, fullscreen, autoplay |

The survey that shaped these choices — the other tools weighed, and why they were not merged — is in [`docs/image-comparison-concept-tool-landscape.md`](docs/image-comparison-concept-tool-landscape.md).

The merged deliverable (`index.html`) is released under the
**MIT License** — see [`LICENSE`](./LICENSE).

---

## Files

```
compare_images_in_browser/
├── index.html                   # the entire tool (single self-contained file)
├── README.md                    # this file
├── LICENSE                      # MIT + upstream attribution
├── AGENTS.md                    # repo rules for agents: gates, constraints, layout
├── package.json                 # scripts only (test, screenshot); no dependencies
├── .editorconfig
├── .gitignore
├── assets/
│   └── screenshot.jpg           # README teaser
├── docs/
│   └── image-comparison-concept-tool-landscape.md   # survey of the tools this one merges
├── scripts/
│   ├── playwright.cjs           # finds the globally installed Playwright
│   └── screenshot.cjs           # regenerates assets/screenshot.jpg after a UI change
├── tests/
│   └── e2e.cjs                  # E2E suite (Playwright + system Chrome)
└── samples/                     # not versioned: teaser/before.jpg + after.jpg, photo fixtures
```

---

## Design notes

Why the tool behaves the way it does, where the reason is not obvious from the code:

- **Header order** follows published toolbar guidance: exactly one emphasized primary action placed first among the action group (SAP Fiori header toolbar, Prism, Helios), related controls grouped and ordered by frequency (Microsoft Win32 toolbar guide), destructive/exit actions last and separated, settings at the end (elementary HIG).
- **Joined zoom is rigid about the group center.** Both images are re-anchored per frame to `group center + zoom × (base center − group center)`, so the shared edge and the gap scale with the zoom. Scaling each image about its own center instead makes the pair overlap when zoomed in and split apart when zoomed out.
- **The capture divider is a channel inversion** (`255 − v`) of the touching pixel on each side, not a hue rotation and not a fixed color: inversion is the maximum-contrast opposite on any content, and it stays visible on mid-grays where a hue complement can match luminance.
- **In-page drags are cancelled at the document level.** A native HTML5 drag started from any wrapper or letterbox fires `pointercancel` and takes the gesture away, leaving a press that tracks a few pixels and then dies. OS file drops for upload never fire an in-page `dragstart`, so uploads are unaffected.
- **The toolbar stays on one row down to ~1200px.** The four slider modes are glyph buttons and the zoom presets are 100/200/500/1000; those two choices are what buy the room, so adding a fifth preset or long mode labels pushes the row over. Below that width the action group wraps onto a second row and stays right-aligned instead of squeezing controls.
- **Capture is WYSIWYG, not fit-only:** crop and geometry come from the live `getBoundingClientRect` boxes, so pan and zoom are reproduced and the capture cannot drift from the viewport.

---

## Notes

- No build step, no runtime dependencies, no internet required. The tool is `index.html` alone; everything else is development support.
- The repository keeps no `node_modules`. Development borrows a globally installed Playwright (`bun add -g playwright`), located by `scripts/playwright.cjs`; Chrome and `ffmpeg` are the other prerequisites.
- The code is heavily commented with per-function docstrings and `@credit` tags
  mapping each piece back to its source project.
- Verified by `tests/e2e.cjs`: 38 assertions covering drop routing, auto-start, slot swaps, capture-vs-viewport in every slider mode, joined export, and the gesture regressions.
- `assets/screenshot.jpg` is the README teaser: a square stage, so the README shows the tool at full height. Regenerate it after a UI change with `node scripts/screenshot.cjs --square 1200`, which reads `samples/teaser/` (or takes two image paths). The teaser pair is kept locally, not versioned; the screenshot is.

