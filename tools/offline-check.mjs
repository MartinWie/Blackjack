// Offline play: the service worker's SHELL is what a phone has with no network. Every
// entry must exist (one missing file fails the worker's install, and with it offline play
// for everyone), and every file a client game ships must be in it. Run with
// `npm run check:offline`; the release build runs it too.
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = new URL('../src/jvmMain/resources', import.meta.url).pathname;
const sw = readFileSync(join(ROOT, 'static/sw.js'), 'utf8');
const apps = readFileSync(new URL('../src/jvmMain/kotlin/de/mw/blackjack/frontend/utils/Apps.kt', import.meta.url), 'utf8');

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const shell = [...sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL'))).matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
check(shell.length > 50 && new Set(shell).size === shell.length, `the shell lists ${shell.length} paths, none twice`);

// Built by the build (Tailwind, the Kotlin engine bundle), so absent from a checkout.
const BUILT = ['/static/output.css', '/static/vendor/engine.js'];
const missing = shell.filter((p) => p.startsWith('/static/') && !BUILT.includes(p) && !existsSync(join(ROOT, p)));
check(!missing.length, `every precached file exists${missing.length ? `: ${missing.join(', ')}` : ''}`);

// Manifests are served per app key; an unknown key is a 404 and fails the install.
const keys = [...apps.matchAll(/App\("([a-z]+)"/g)].map((m) => m[1]);
const badManifests = shell.filter((p) => p.startsWith('/manifest/')).filter((p) => !keys.includes(p.replace(/^\/manifest\/|\.webmanifest$/g, '')));
check(keys.length > 0 && !badManifests.length, `every precached manifest is an app's${badManifests.length ? `: not ${badManifests.join(', ')}` : ''}`);

// Every file of the client games is precached, art included.
const files = [];
const walk = (dir) => { for (const f of readdirSync(dir)) { if (f.startsWith('.')) continue; const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (!p.endsWith('.gz')) files.push(p.slice(ROOT.length)); } };
for (const game of ['meow', 'sweets', 'picnic', 'draft', 'cells']) walk(join(ROOT, 'static', game));
const forgotten = files.filter((p) => !shell.includes(p));
check(!forgotten.length, `all ${files.length} files of the client games are precached${forgotten.length ? `; not ${forgotten.join(', ')}` : ''}`);

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nEvery game has what it needs offline');
