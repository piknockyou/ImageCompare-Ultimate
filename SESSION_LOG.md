# Session log

## 2026-11-01 — Windows image launcher

Added an optional Python launcher that embeds one or two dropped images in a temporary local copy of the page. The page uses the existing image-loading functions; the temporary copy is removed after two minutes. Verified shell launches with one and two images in Chrome and added launcher tests.
