# Image Swipe Compare

A browser-based image comparison tool with swipe modes, autoplay, and one-cycle export to GIF/WEBP/MP4.

No backend is required. Images are processed locally in your browser.

[Try it online, why not? It's free 😄](https://hhkaos.github.io/image-swipe-compare)

[![Screenshoot](./preview.png)](https://hhkaos.github.io/image-swipe-compare)

## Features

- Drag-and-drop compare workflow:
- Drop 2 images at once in the compare area to set both sides; drop 1 image on a side to replace only that side.
- Swipe modes: `Vertical |`, `Diagonal /`, `Diagonal \`
- Mouse/touch draggable slider handle.
- Keyboard slider controls: `Arrow Left` / `Arrow Right` (2% step), `Shift + Arrow Left` / `Shift + Arrow Right` (10% step)
- Fullscreen compare viewport (`Full Screen` button, exit with `Esc`).
- Autoplay animation with play/stop and adjustable speed (seconds one-way).
- Centered zoom control for both images (viewport crops to what you see).
- Horizontal and vertical positioning controls for zoomed images (stronger pan, including edge/overshoot framing).
- Recording/export:
- Record one complete cycle (left -> right -> left).
- Export formats: Animated GIF, Animated WEBP, MP4.
- Export quality presets: `Low`, `Medium`, `High` (affects FPS/compression settings).
- Recording pipeline: RecordRTC (primary), ffmpeg.wasm (fallback).
- Recording status + progress bar (shown only while recording/exporting).
- Responsive single-page UI (vanilla HTML/CSS/JS).
- Placeholder images shown by default when no image is loaded.

## How To Use

1. Open `index.html` (or serve the folder with a static server).
2. Drag and drop images into the compare area.
3. Drop 2 files to set both sides, or 1 file on the left/right side of the split to replace only that side.
4. Choose slider mode (`|`, `/`, `\`) if needed.
5. Drag the handle to compare manually, or use `Play Animation`.
6. Use `Zoom` if you want to crop into the image area.
7. Use `Horizontal` / `Vertical` to move the zoomed viewport to left/right/top/bottom as needed.
8. For export, pick `Format` and `Quality`, then click `Record 1 Cycle`.

## Running Locally

No build step required.

```bash
python3 -m http.server
```

Then open `http://localhost:8000`.

You can also open `index.html` directly, but serving locally is recommended for recording/export compatibility.

## Notes On Recording

- First export can be slower because encoder assets are loaded.
- RecordRTC is used first; ffmpeg.wasm is used as fallback if needed.
- All exports are generated client-side.

## Privacy

Your images are not uploaded to a server by this app.

## Tech Stack

- Vanilla HTML/CSS/JavaScript
- RecordRTC
- ffmpeg.wasm

## License

MIT
