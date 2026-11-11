import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { decodeCsvBytes } from './index';

test("UTF-8 fixture decodes as 'utf-8' and keeps '°' and '″'", () => {
  const bytes = new Uint8Array(
    readFileSync(join(__dirname, '../../../fixtures/flightscope/FlightScope Golf Session Sept 19 2022.csv')),
  );
  const r = decodeCsvBytes(bytes);
  expect(r.encoding).toBe('utf-8');
  expect(r.text).toContain('°');
  expect(r.text).toContain('″');
});

test("bytes with 0xB0 for '°' decode as 'windows-1252' to '°'", () => {
  const bytes = new Uint8Array([0x53, 0x77, 0x69, 0x6e, 0x67, 0x20, 0x28, 0xb0, 0x29]);
  const r = decodeCsvBytes(bytes);
  expect(r.encoding).toBe('windows-1252');
  expect(r.text).toBe('Swing (°)');
});
