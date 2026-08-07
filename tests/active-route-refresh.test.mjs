import fs from 'node:fs';
import assert from 'node:assert/strict';

const appSource = fs.readFileSync(new URL('../src/app.js?v=20260804-06', import.meta.url), 'utf8');

assert.match(appSource, /const activeRoute = workspace\.dataset\.activeRoute/, 'refresh should read the active route');
assert.match(appSource, /const activeRouteInitializer = routes\[activeRoute\]/, 'refresh should resolve the active route initializer');
assert.match(appSource, /activeRouteInitializer\(workspace\)/, 'refresh should rerun the active module');
assert.match(appSource, /if \(activeRouteInitializer\)[\s\S]*?renderCashStrip\(app\)/, 'refresh should keep the cash-only fallback for unknown routes');

console.log('active route refresh ok');
