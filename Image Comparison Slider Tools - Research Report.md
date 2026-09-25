# Image Comparison Slider Tools - Research Report

> Research Date: 2026-07-14
> Goal: Find the most lightweight, zero-install solution for comparing two images via drag-drop + slider, with optional aspect-ratio normalization.
>
> **Filter:** Only tools that are **FOSS** (open source license) OR can be used entirely locally (no server uploads). Browser-based tools are included if processing happens client-side.

---

## Ready-to-Use Tools (Drag-Drop + Slider)

Tools you can open in a browser, drop images in, and compare with an interactive slider.

### hhkaos/image-swipe-compare

- **URL:** <https://github.com/hhkaos/image-swipe-compare>
- **Live:** <https://hhkaos.github.io/image-swipe-compare>
- **License:** **MIT — FOSS**
- **What it is:** A single-page vanilla HTML/CSS/JS app with slider comparison (vertical, diagonal), zoom/pan, autoplay animation, and export to GIF/WEBP/MP4 via RecordRTC + ffmpeg.wasm. Your images never leave the browser.
- **Use locally:** Yes — open `index.html` in any browser, drag-drop images. No server needed.

### tchung1970/compare-image

- **URL:** <https://github.com/tchung1970/compare-image>
- **Live:** <https://ai.tchung.org/compare-image>
- **License:** **MIT — FOSS**
- **What it is:** A single-file HTML app with draggable CSS clip-path split-slider and side-by-side view. Features zoom/pan, canvas screenshot capture, drag-drop upload, and `object-fit: contain` normalization for different-resolution images.
- **Use locally:** Yes — fully local, single-file, no dependencies.

### yani-/beforeafter

- **URL:** <https://github.com/yani-/beforeafter>
- **Live:** <https://yani-.github.io/beforeafter>
- **License:** **MIT — FOSS**
- **What it is:** A browser-based tool for combining/comparing before/after images. Supports side-by-side, vertical layout, and pixel-diff overlay (highlights changes in red). Has drag-drop, clipboard paste (Ctrl+V), and export as PNG/JPEG/WEBP. More of a "composite" tool than interactive slider.
- **Use locally:** Yes — single HTML file, no server.

---

## Multi-Mode Comparison Tools (Slider + Pixel Diff + Overlay)

### DualView

- **URL:** <https://github.com/gokayfem/dualview>
- **Live:** <https://dualview.ai>
- **License:** **MIT — FOSS**
- **Stars:** Many (well-established)
- **What it is:** A comprehensive Vite/React/TypeScript web app for comparing images, videos, audio, 3D models, and documents. GPU-accelerated with 50+ WebGL analysis shaders, 100+ transitions, audio analysis (LUFS, waveform, goniometer), document diff (CSV, Excel, Word, PDF), and video export. By far the most feature-rich tool in the report.
- **Use locally:** Yes — `git clone && npm install && npm run dev`. All client-side with IndexedDB persistence.

---

## Embeddable JavaScript Libraries (**MIT — All FOSS**)

Lightweight libraries you can add to a page to provide comparison slider functionality. All are MIT-licensed and fully client-side.

| Library                                                                                               | Stars | Size      | Notes                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ----- | --------- | ----------------------------------------------------------------------------------------------------- |
| **img-comparison-slider** ([sneas](https://github.com/sneas/img-comparison-slider))                   | 863   | ~4KB gzip | Web Component (`<img-comparison-slider>`), works with React/Vue/Angular/plain HTML. CDN via jsdelivr. |
| **image-compare-viewer** ([kylewetton](https://github.com/kylewetton/image-compare-viewer))           | 589   | ~7KB      | Vanilla JS, zero deps, responsive. NPM + CDN.                                                         |
| **before-after.js** ([jotform](https://github.com/jotform/before-after.js))                           | 359   | n/a       | Simple, responsive. **Requires jQuery** as dependency. No NPM package.                                |
| **before-after-slider** ([VincentTV](https://github.com/VincentTV/before-after-slider))               | 43    | ~9KB      | Zero-dependency, touch support, simple options API. NPM + direct include.                             |
| **image-comparison-slider** ([Paul-Browne](https://github.com/Paul-Browne/image-comparison-slider))   | 29    | Minimal   | Single JS + single CSS file, no build step. Extremely simple.                                         |
| **before-after** ([yoriiis](https://github.com/yoriiis/before-after))                                 | 19    | Small     | ESM-only (v4), TypeScript, horizontal/vertical, cursor follow. NPM.                                   |
| **slider-before-after** ([piecioshka](https://github.com/piecioshka/slider-before-after))             | 13    | Tiny      | Uses `<input type="range">` + CSS variables. No JS logic beyond the range input.                      |
| **slick-image-compare** ([lemon3](https://github.com/lemon3/slick-image-compare))                     | 10    | Small     | Vanilla JS + optional React/Astro wrappers. Uses `requestAnimationFrame`.                             |
| **before-after** ([markpbaggett](https://github.com/markpbaggett/before-after))                       | 4     | ~3KB      | Two web components: `<before-after>` (split-slider) + `<opacity-compare>` (opacity blend).            |
| **vanilla-images-compare** ([sylvaincombes](https://github.com/sylvaincombes/vanilla-images-compare)) | 0     | Small     | Brand new (Apr 2026), TypeScript, supports Pointer Events + touch + mouse + click modes.              |

---

## Summary: Top Recommendations

| Use Case                                                   | Best Choice                                                   | Why                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| Quick drag-drop + slider, ready to go                      | **hhkaos/image-swipe-compare** (MIT, open 3 files in browser) | FOSS, fully local, vertical/diagonal sliders, zoom/pan |
| Most feature-rich comparison (images + video + audio + 3D) | **DualView** (MIT, `git clone && npm run dev`)                | 50+ WebGL shaders, 100+ transitions, document diff     |
| Lightest embeddable web component                          | **img-comparison-slider** (MIT, ~4KB gzip, 863★)             | Works with any framework, CDN, keyboard accessible     |
| Single-file tool (no dependencies at all)                  | **tchung1970/compare-image** (MIT, one HTML file)             | Clip-path slider, zoom/pan, canvas export              |


