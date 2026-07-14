# Compare Image

A client-side image comparison tool. Drop two images and compare them using a split slider or side-by-side view — all in the browser, no uploads, no server.

## Live Demo

https://ai.tchung.org/compare-image/

## Features

- **Split view** — draggable vertical slider reveals left/right image with a CSS clip-path overlay
- **Side-by-side view** — two independent panels for simultaneous viewing
- **Different resolutions** — images of any size are normalized to the same dimensions for accurate comparison
- **Zoom & pan** — click a preset button (100%/200%/300%/400%/500%) or type a custom percentage (50%–1000%); click-drag to pan when zoomed in
- **Capture** — save the current comparison (split or side-by-side, at the current zoom/pan) as a PNG, rendered client-side to a canvas
- **Drag and drop** — drop files on specific boxes or anywhere on the upload screen
- **Fully local** — uses `URL.createObjectURL`, nothing leaves your machine

## Usage

Open `index.html` in a browser. No build step, no dependencies, no server required.

1. Drop or select two image files (A = left, B = right)
2. Click **Compare**
3. Use the split slider (default) or switch to side-by-side view
4. Set zoom with the preset buttons or custom field, drag to pan

## Example

The `Example/` folder contains two sample images for testing:

- `Image-A.jpg` — Image A (left)
- `Image-B.jpg` — Image B (right)

## Architecture

Single-file app — HTML, CSS, and JavaScript are all inline in `index.html`.

Four `<img>` elements are used: `imgA`/`imgB` for split mode and `imgA2`/`imgB2` for side-by-side mode. All share the same object URLs. Images are rendered with `object-fit: contain` so different resolutions align correctly in the split view.

## License

This project is open source and available under the [MIT LICENSE](LICENSE).
