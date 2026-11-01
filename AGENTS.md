# AGENTS.md

Working rules for this repository. It describes the constraints that are easy to break by accident, not the product (that is `README.md`).

## What this repo is

`index.html` is the entire product: one self-contained file with inline CSS and JavaScript, no build step, no runtime dependencies, no network calls. Everything else is development support.

## Hard constraints

- **Keep the tool one file.** No external CSS/JS/fonts/CDN links, no `fetch` to anything, no build step. Images must never leave the machine.
- **No runtime dependencies.** A dependency may only appear as a dev dependency used by `tests/` or `scripts/`.
- **No binaries in git**, with one exception: `assets/screenshot.jpg`, the README teaser. `samples/` is local-only.
- **Do not delete the license header** in `index.html`; the upstream MIT attributions are a license condition.

## Layout

| Path | Role |
|---|---|
| `index.html` | the tool |
| `docs/` | supporting write-ups about the problem space |
| `tests/` | end-to-end suite |
| `scripts/` | maintenance tooling (Playwright resolver + screenshot generator) |
| `assets/` | images referenced by the README |
| `samples/` | local-only teaser pair for the screenshot script |

## Docs

- One home per fact: the README tells the user what the tool does, this file tells agents the rules, `docs/` holds write-ups. Never restate a fact in two files — point at it instead. Short echoes are allowed only where the readers differ (README vs this file).
- Cold-reader clean: every sentence must make sense to someone who never saw the work happen — no session memory, no change narration ("was moved", "used to be"), no announced omissions.
- Counts, file trees, command lines and preset lists get re-verified against the implementation in the same change. Check doc changes against `@consolidate-patchwork` (one home, no duplication, frames match reality) and `@audit-cold-reader` (no echo of the making) before committing.

## Gates

Run before every commit:

```bash
bun run test           # = node tests/e2e.cjs, must print ALL E2E PASS
```

Prerequisites are machine-level, not project-level: Chrome, `ffmpeg` on PATH, and Playwright installed **globally** with `bun add -g playwright`. The repository carries no `node_modules`; `scripts/playwright.cjs` locates the global install (override with `PLAYWRIGHT_ROOT` when it lives somewhere unusual). Chrome is taken from the default Windows location; set `CHROME_PATH` to point elsewhere. Fixtures are generated at runtime into the system temp directory, never into the repo.

A change to `index.html` also wants a syntax check of both script blocks:

```bash
node --check <extracted script>   # the E2E run fails loudly if one is broken
```

## Screenshot

`assets/screenshot.jpg` goes stale silently, so regenerate it whenever the UI changes:

```bash
bun run screenshot      # = node scripts/screenshot.cjs --square 1200
```

It reads `samples/teaser/before.jpg` and `after.jpg`, prints the measured fill ratio, and writes `assets/screenshot.jpg`. A pair named `before`/`after` is used in that order; otherwise the first two images alphabetically, where the earlier name is image A.

## Testing the UI by hand

Open `index.html` directly from disk (`file://`) — that is the delivery path users take, so verify changes there rather than through a server.
