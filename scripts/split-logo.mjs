// Writes the splash animation's two logo layers, apps/desktop/static/logo-{still,flight}.svg, from
// apps/web/public/icon.svg (`npm run desktop:logo-layers`). Run it again whenever the logo changes;
// scripts/logo-layers.test.ts fails until you do.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { splitLogo } from './logo-layers.mjs';

const at = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const { still, flight } = splitLogo(readFileSync(at('../apps/web/public/icon.svg'), 'utf8'));
for (const [name, svg] of [['still', still], ['flight', flight]]) {
  const out = at(`../apps/desktop/static/logo-${name}.svg`);
  writeFileSync(out, svg);
  console.log(`wrote ${out}`);
}
