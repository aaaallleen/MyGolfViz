import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MEASUREMENT_KEYS, type MeasurementKey } from '@fsa/domain';
import { decodeCsvBytes, parseFlightScopeCsv, sha256Hex } from './index';

const FIXTURES = join(__dirname, '../../../fixtures/flightscope');
const EXPECTED = join(FIXTURES, 'expected');
const files = readdirSync(EXPECTED).filter((f) => f.endsWith('.expected.json'));

describe('golden fixtures', () => {
  test('three expectation files exist', () => expect(files).toHaveLength(3));

  test.each(files)('%s', async (name) => {
    const exp = JSON.parse(readFileSync(join(EXPECTED, name), 'utf8'));
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, exp.file)));
    const { text } = decodeCsvBytes(bytes);
    const r = parseFlightScopeCsv(text, exp.file);

    expect(r.ok).toBe(true);
    expect(r.parserVersion).toBe(exp.parserVersion);
    expect(await sha256Hex(bytes)).toBe(exp.sha256);
    expect(r.columns.headers).toHaveLength(exp.columnCount);
    expect(r.shots).toHaveLength(exp.shotCount);
    expect(r.summaryRows.map((s) => ({ club: s.club, kind: s.kind, sourceRow: s.sourceRow }))).toEqual(exp.summaryRows);
    expect(r.summaryRows).toHaveLength(exp.summaryRowCount);

    const clubs: Record<string, number> = {};
    for (const s of r.shots) clubs[s.club] = (clubs[s.club] ?? 0) + 1;
    expect(clubs).toEqual(exp.clubs);

    for (const [key, n] of Object.entries(exp.nonNullCounts as Record<string, number>)) {
      expect(r.shots.filter((s) => s.m[key as MeasurementKey] !== null).length, key).toBe(n);
    }
    expect(r.warnings.filter((w) => w.code === 'invalid_value')).toEqual([]);
    const expectedWarnings = (exp.flags.no_measurements as number[]).map((row) => ({ code: 'no_measurements', row }));
    expect(r.warnings.map((w) => ({ code: w.code, row: w.row }))).toEqual(
      expectedWarnings.map((w) => ({ code: w.code, row: w.row })),
    );
    expect(r.columns.missing).toEqual(exp.missingColumns);
    expect(r.columns.unrecognized).toEqual(exp.unrecognizedColumns);
    for (const [flag, rows] of Object.entries(exp.flags as Record<string, number[]>)) {
      expect(r.shots.filter((s) => s.flags.includes(flag as never)).map((s) => s.sourceRow), flag).toEqual(rows);
    }

    for (const es of exp.shots) {
      const s = r.shots.find((x) => x.sourceRow === es.sourceRow);
      expect(s, `row ${es.sourceRow}`).toBeDefined();
      expect(s!.shotLabel).toBe(es.shotLabel);
      expect(s!.club).toBe(es.club);
      expect(s!.shotType).toBe(es.shotType);
      expect(s!.mode).toBe(es.mode);
      expect(s!.location).toBe(es.location);
      for (const [k, v] of Object.entries(es.m as Record<string, number | null>)) {
        const got = s!.m[k as MeasurementKey];
        if (v === null) expect(got, `row ${es.sourceRow} ${k}`).toBeNull();
        else expect(got, `row ${es.sourceRow} ${k}`).toBeCloseTo(v, 6);
      }
    }
    const full = exp.shots.find((x: { m: object }) => Object.keys(x.m).length === MEASUREMENT_KEYS.length);
    if (full) expect(Object.keys(full.m).sort()).toEqual([...MEASUREMENT_KEYS].sort());
  });
});
