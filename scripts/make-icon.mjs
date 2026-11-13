// Renders the app icon, apps/desktop/build/icon.png, from apps/web/public/icon.svg (`npm run desktop:icon`).
// The canvas is 1024×1024 with a transparent background; the artwork is scaled to 824 px and centred, which leaves
// the 100 px margin of the macOS icon grid. electron-builder turns the PNG into the .icns.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const SIZE = 1024;
const ART = 824;
const svg = fileURLToPath(new URL('../apps/web/public/icon.svg', import.meta.url));
const out = fileURLToPath(new URL('../apps/desktop/build/icon.png', import.meta.url));

const src = `data:image/svg+xml;base64,${readFileSync(svg).toString('base64')}`;
const offset = (SIZE - ART) / 2;
const html = `<!doctype html><html><body style="margin:0;background:transparent">
<img id="art" src="${src}" style="position:absolute;left:${offset}px;top:${offset}px;width:${ART}px;height:${ART}px">
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.locator('#art').evaluate((img) => img.decode());
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
} finally {
  await browser.close();
}
console.log(`wrote ${out}`);
