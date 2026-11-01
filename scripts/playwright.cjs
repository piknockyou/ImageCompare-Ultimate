// Resolve Playwright from the machine's global install.
//
// This repository ships no node_modules on purpose: the test and screenshot
// scripts borrow the globally installed Playwright instead. Install it once with
// `bun add -g playwright` (or `npm i -g playwright`) and every script here works.
//
// Resolution order: PLAYWRIGHT_ROOT override, an already-resolvable package, the
// bun global directory, then the npm global directory. The bun directory is read
// from `bun pm ls -g` because it moves with the bun installation (scoop, home
// directory, or BUN_INSTALL).
const { execFileSync } = require('child_process');
const path = require('path');

function globalRoots() {
  const roots = [];
  try {
    const line = execFileSync('bun', ['pm', 'ls', '-g'], { encoding: 'utf8', timeout: 15000 }).split('\n')[0];
    const dir = line.replace(/\s*\(\d+ installed\)\s*$/, '').replace(/\s*node_modules\s*$/, '').trim();
    if (dir) roots.push(path.join(dir, 'node_modules'));
  } catch { /* bun not installed */ }
  try {
    const dir = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 15000 }).trim();
    if (dir) roots.push(dir);
  } catch { /* npm not installed */ }
  return roots;
}

function candidates() {
  const list = [];
  if (process.env.PLAYWRIGHT_ROOT) list.push(process.env.PLAYWRIGHT_ROOT);
  for (const pkg of ['playwright-core', 'playwright']) {
    try { list.push(path.dirname(require.resolve(pkg + '/package.json'))); } catch { /* not local */ }
  }
  for (const root of globalRoots()) {
    for (const pkg of ['playwright-core', 'playwright']) list.push(path.join(root, pkg));
  }
  return list;
}

let chromium = null;
for (const dir of candidates()) {
  try {
    ({ chromium } = require(dir));
    if (chromium) break;
  } catch { /* try the next candidate */ }
}

if (!chromium) {
  throw new Error(
    'Playwright is not available. Install it globally once:\n' +
    '  bun add -g playwright\n' +
    'or point PLAYWRIGHT_ROOT at an existing installation.');
}

module.exports = { chromium };
