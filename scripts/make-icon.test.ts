import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, test } from 'vitest';

// The committed output of `npm run desktop:icon` (scripts/make-icon.mjs).
const ICON = new URL('../apps/desktop/build/icon.png', import.meta.url);

/** Decodes an 8-bit RGBA, non-interlaced PNG and returns a lookup of its alpha channel. */
function decodeAlpha(png: Buffer): { width: number; height: number; alpha: (x: number, y: number) => number } {
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([data[8], data[9], data[12]], 'bit depth, colour type, interlace').toEqual([8, 6, 0]);
    }
    if (type === 'IDAT') idat.push(data);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  const byte = (x: number, y: number) => (x >= 0 && y >= 0 ? pixels.readUInt8(y * stride + x) : 0);
  for (let y = 0; y < height; y++) {
    const filter = raw.readUInt8(y * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const [left, up, upLeft] = [byte(x - 4, y), byte(x, y - 1), byte(x - 4, y - 1)];
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels.writeUInt8((raw.readUInt8(y * (stride + 1) + 1 + x) + predictor) & 0xff, y * stride + x);
    }
  }
  const alpha = (x: number, y: number) => pixels.readUInt8((y * width + x) * 4 + 3);
  return { width, height, alpha };
}

test('the app icon is 1024×1024 on a transparent canvas with the artwork inside the 100 px margin', () => {
  const { width, height, alpha } = decodeAlpha(readFileSync(ICON));
  expect([width, height]).toEqual([1024, 1024]);

  let [minX, minY, maxX, maxY] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha(x, y) === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  // Everything outside the centred 824 px square is fully transparent, and the artwork fills most of that square.
  expect(minX).toBeGreaterThanOrEqual(100);
  expect(minY).toBeGreaterThanOrEqual(100);
  expect(maxX).toBeLessThan(924);
  expect(maxY).toBeLessThan(924);
  expect(maxX - minX).toBeGreaterThan(600);
  expect(alpha(512, 512)).toBe(255);
});
