// Guards the invariant behind the "app installs twice" bug: the launcher must have
// exactly one entry for this app. Run: node scripts/check-launcher-icon.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
const UPDATER =
  'android/app/src/main/java/com/warrioxproductionss/agendapalm/CalendarIconUpdater.kt';

const manifest = readFileSync(MANIFEST, 'utf8');
const updater = readFileSync(UPDATER, 'utf8');

// 1. Exactly one alias ships enabled, or the launcher shows one icon per enabled alias.
const enabled = [...manifest.matchAll(/<activity-alias\s+([^>]*?)>/g)]
  .filter((m) => m[1].includes('android:enabled="true"'))
  .map((m) => m[1].match(/android:name="\.([^"]+)"/)[1]);
assert.equal(enabled.length, 1, `alias con enabled="true": ${enabled.length} (${enabled})`);

// 2. The native updater must clear that exact alias; a mismatch leaves it enabled forever.
const baked = updater.match(/BAKED_DEFAULT_ALIAS = "([^"]+)"/);
assert.ok(baked, 'CalendarIconUpdater.kt no declara BAKED_DEFAULT_ALIAS');
assert.equal(
  baked[1],
  enabled[0],
  `desfase: manifest=${enabled[0]} pero el .kt limpia ${baked[1]}`,
);

// 3. MainActivity must not be a launcher entry itself, or it adds a second icon.
const mainActivity = manifest.match(
  /<activity android:name="\.MainActivity"[\s\S]*?<\/activity>/,
)[0];
assert.ok(
  !mainActivity.includes('category.LAUNCHER'),
  'MainActivity volvio a declarar category.LAUNCHER',
);

console.log(`OK: un solo icono (${enabled[0]}), manifest y .kt alineados`);
