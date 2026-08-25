/**
 * anime-pet-widget — build script
 * ---------------------------------------------------------------
 * Reads the two plugin halves (host.js + client.js) and emits the exact
 * JSON payload you can hand to the DSH `cordis_define` tool to load the
 * pet as a dynamic Cordis plugin.
 *
 * Usage:   node scripts/build-package.mjs
 * Output:  dist/cordis-package.json
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const host = readFileSync(join(root, 'host.js'), 'utf8').trim();
const client = readFileSync(join(root, 'client.js'), 'utf8').trim();

const payload = {
  plugin: { kind: 'new', idPrefix: 'apet' },
  name: 'Anime Pet Bottom-Right Companion',
  purpose:
    'Renders a kawaii pet at the web bottom-right that reacts to Agent state with sounds, including a completion chime.',
  code: { host, client },
};

const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'cordis-package.json');
writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(`Wrote ${outFile}`);
console.log(
  'Paste the JSON into the DSH cordis_define tool to load the pet.',
);
