import { describe, expect, test } from 'vitest';
import { FIELD_DEFS, fieldDef } from '@fsa/domain';
import { normalizeText, parseCell } from './cells';

const d = fieldDef;

describe('parseCell', () => {
  test.each([
    ['8.1 R', d('clubPath'), '°', 8.1],
    ['6 L', d('ftp'), '°', -6],
    ['10.4 R', d('lateral'), 'yds', 10.4],
    ['44.7 L', d('lateral'), 'yds', -44.7],
    ['0', d('clubPath'), '°', 0],
    ['-1.3', d('aoa'), '°', -1.3],
    ['5162', d('spin'), 'rpm', 5162],
    ['2,540', d('spin'), 'rpm', 2540],
    ['55.8 ft', d('altitude'), 'ft', 55.8],
    ['17 m', d('altitude'), 'm', 55.774],
    ['1.5″', d('lowPoint'), 'ftin', 1.5],
    ['-2.9″', d('lowPoint'), 'ftin', -2.9],
    ['0″', d('lowPoint'), 'ftin', 0],
    ["1' 2.5″", d('lowPoint'), 'ftin', 14.5],
    ["-1' 0.5″", d('lowPoint'), 'ftin', -12.5],
    ['1.5"', d('lowPoint'), 'ftin', 1.5],
    ['100', d('carry'), 'm', 109.361],
    ['1.38', d('impactLateral'), 'in', 1.38],
  ])('parseCell(%j) → %d', (raw, def, unit, expected) => {
    const r = parseCell(raw, def, unit);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(expected, 3);
  });

  test.each(['-', '', '  ', 'N/A', 'n/a', ' - '])('%j is null, never 0, for every field', (raw) => {
    for (const def of FIELD_DEFS) {
      expect(parseCell(raw, def, def.unit === 'none' ? null : 'x')).toEqual({ ok: true, value: null });
    }
  });

  test.each([
    ['3.2', d('clubPath'), '°'],
    ['8.1 X', d('clubPath'), '°'],
    ['abc', d('spin'), 'rpm'],
    ['1.2.3', d('carry'), 'yds'],
  ])('%j is invalid_value', (raw, def, unit) => {
    expect(parseCell(raw, def, unit)).toEqual({ ok: false, reason: 'invalid_value' });
  });

  test("parseCell('100', carry, 'furlongs') → { ok: false, reason: 'unrecognized_unit' }", () => {
    expect(parseCell('100', d('carry'), 'furlongs')).toEqual({ ok: false, reason: 'unrecognized_unit' });
  });
});

describe('normalizeText', () => {
  test('trims and maps null tokens', () => {
    expect(normalizeText(' Driver ')).toBe('Driver');
    expect(normalizeText('N/A')).toBeNull();
    expect(normalizeText('-')).toBeNull();
    expect(normalizeText('Push/Slice')).toBe('Push/Slice');
  });
});
