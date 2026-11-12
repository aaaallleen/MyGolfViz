import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseFlightScopeCsv } from './index';

const read = (n: string) => readFileSync(join(__dirname, '../../../fixtures/flightscope', n), 'utf8');
const S2022 = read('FlightScope Golf Session Sept 19 2022.csv');
const lines = S2022.split('\n');
const HEADER = lines[0]!;
const HEADER_ONLY = HEADER;
const ONLY_AVG_DEV = [HEADER, lines[17]!, lines[18]!].join('\n');

/** Replace one cell of one (1-based) line of the 2022 fixture. */
function withCell(row: number, col: number, value: string): string {
  const copy = [...lines];
  const cells = copy[row - 1]!.split(',');
  cells[col] = value;
  copy[row - 1] = cells.join(',');
  return copy.join('\n');
}
const col = (name: string) => HEADER.split(',').indexOf(name);

describe('parseFlightScopeCsv', () => {
  test('BOM + CRLF re-save yields identical shots and summary rows', () => {
    const a = parseFlightScopeCsv(S2022, 'a.csv');
    const b = parseFlightScopeCsv('﻿' + S2022.replace(/\n/g, '\r\n'), 'a.csv');
    expect(b.ok).toBe(true);
    expect(b.shots).toEqual(a.shots);
    expect(b.summaryRows).toEqual(a.summaryRows);
  });

  test('quoted cells parse: "2,540" spin and "Driver" club', () => {
    const csv = withCell(2, col('Spin (rpm)'), '"2,540"').replace(/^Driver,1,/m, '"Driver",1,');
    const r = parseFlightScopeCsv(csv, 'q.csv');
    expect(r.shots[0]!.m.spin).toBe(2540);
    expect(r.shots[0]!.club).toBe('Driver');
  });

  test('columns are matched by name: swapping Carry and Spin columns keeps row 2 carry 198.9, spin 5162', () => {
    const ci = col('Carry (yds)');
    const si = col('Spin (rpm)');
    const swapped = lines
      .map((l) => {
        const c = l.split(',');
        [c[ci], c[si]] = [c[si]!, c[ci]!];
        return c.join(',');
      })
      .join('\n');
    const r = parseFlightScopeCsv(swapped, 's.csv');
    expect(r.shots[0]!.m.carry).toBeCloseTo(198.9, 6);
    expect(r.shots[0]!.m.spin).toBe(5162);
  });

  test("'Carry (m)' converts: a cell '100' becomes 109.361 yd", () => {
    const csv = withCell(2, col('Carry (yds)'), '100').replace('Carry (yds)', 'Carry (m)');
    const r = parseFlightScopeCsv(csv, 'm.csv');
    expect(r.shots[0]!.m.carry).toBeCloseTo(109.361, 3);
  });

  test("'Carry (furlongs)' is dropped: carry null on every shot, warning unrecognized_unit, columns.missing includes 'carry'", () => {
    const r = parseFlightScopeCsv(S2022.replace('Carry (yds)', 'Carry (furlongs)'), 'f.csv');
    expect(r.ok).toBe(true);
    expect(r.shots.every((s) => s.m.carry === null)).toBe(true);
    expect(r.warnings.some((w) => w.code === 'unrecognized_unit')).toBe(true);
    expect(r.columns.missing).toContain('carry');
    expect(r.columns.unrecognized).toContain('Carry (furlongs)');
  });

  test("unknown column 'Wind (mph)' warns unrecognized_column and keeps raw['Wind (mph)']", () => {
    const csv = lines.map((l, i) => l + (i === 0 ? ',Wind (mph)' : i === 1 ? ',5' : i < 17 ? ',3' : ',-')).join('\n');
    const r = parseFlightScopeCsv(csv, 'w.csv');
    expect(r.warnings.some((w) => w.code === 'unrecognized_column' && w.column === 'Wind (mph)')).toBe(true);
    expect(r.shots[0]!.raw['Wind (mph)']).toBe('5');
    expect(r.columns.unrecognized).toContain('Wind (mph)');
  });

  test('a 31-cell row is skipped with row_length_mismatch and the other 15 shots parse', () => {
    const copy = [...lines];
    copy[4] = copy[4]!.split(',').slice(0, 31).join(',');
    const r = parseFlightScopeCsv(copy.join('\n'), 'l.csv');
    expect(r.shots).toHaveLength(15);
    expect(r.shots.some((s) => s.sourceRow === 5)).toBe(false);
    expect(r.warnings.find((w) => w.code === 'row_length_mismatch')?.row).toBe(5);
  });

  test.each([
    ['', 'empty_file'],
    ['  \n ', 'empty_file'],
    ['name,email\nA,b', 'not_flightscope_export'],
    [HEADER_ONLY, 'no_shots'],
    [ONLY_AVG_DEV, 'no_shots'],
  ])('invalid input %# → %s', (text, code) => {
    const r = parseFlightScopeCsv(text, 'x.csv');
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe(code);
    expect(r.shots).toEqual([]);
  });

  test('file name never changes parsing: same text under two names gives equal results apart from fileName', () => {
    const a = parseFlightScopeCsv(S2022, 'Sept 19 2022.csv');
    const b = parseFlightScopeCsv(S2022, '../../evil 1999-01-01.csv');
    expect({ ...a, fileName: '' }).toEqual({ ...b, fileName: '' });
    expect(b.fileName).toBe('../../evil 1999-01-01.csv');
  });

  test('an FTP row off by 1° from FTT − path gets check_face_to_path; spin loft ≠ DL − AOA is NOT flagged', () => {
    // row 2: ftt 8.6, path 8.1 → ftp 0.5. Set ftp to 1.5 R.
    const r = parseFlightScopeCsv(withCell(2, col('FTP (°)'), '1.5 R'), 'c.csv');
    expect(r.shots[0]!.flags).toContain('check_face_to_path');
    expect(r.warnings.some((w) => w.code === 'relationship_check' && w.row === 2)).toBe(true);
    // Untouched fixture: spin loft 28.3 vs DL 27 - AOA -1.3 = 28.3 matches, so break it hard.
    const r2 = parseFlightScopeCsv(withCell(2, col('Spin Loft (°)'), '40'), 'c.csv');
    expect(r2.shots[0]!.flags).toEqual([]);
  });

  test('smash that disagrees with ball/club speed gets check_smash', () => {
    const r = parseFlightScopeCsv(withCell(2, col('Smash'), '1.5'), 'c.csv');
    expect(r.shots[0]!.flags).toContain('check_smash');
  });

  test('invalid cell becomes null with an invalid_value warning naming row, column and text', () => {
    const r = parseFlightScopeCsv(withCell(2, col('Spin (rpm)'), 'abc'), 'c.csv');
    expect(r.shots[0]!.m.spin).toBeNull();
    const w = r.warnings.find((x) => x.code === 'invalid_value');
    expect(w?.row).toBe(2);
    expect(w?.column).toBe('Spin (rpm)');
    expect(w?.message).toContain('abc');
  });

  test('blank records are skipped but counted in sourceRow; empty club becomes Unknown club', () => {
    const copy = [...lines];
    copy.splice(1, 0, '');
    copy[2] = copy[2]!.replace(/^Driver/, '');
    const r = parseFlightScopeCsv(copy.join('\n'), 'b.csv');
    expect(r.shots[0]!.sourceRow).toBe(3);
    expect(r.shots[0]!.club).toBe('Unknown club');
  });

  test('a Dev row with unsigned spreads gives no warning, but the same value in a shot row is invalid_value', () => {
    const swingH = col('Swing H (°)');
    const dev = parseFlightScopeCsv(withCell(19, swingH, '4.4'), 'd.csv');
    expect(dev.warnings.filter((w) => w.code === 'invalid_value')).toEqual([]);
    expect(dev.summaryRows.find((s) => s.kind === 'Dev')?.raw['Swing H (°)']).toBe('4.4');
    const shot = parseFlightScopeCsv(withCell(2, swingH, '4.4'), 'd.csv');
    const w = shot.warnings.filter((x) => x.code === 'invalid_value');
    expect(w).toHaveLength(1);
    expect(w[0]!.row).toBe(2);
  });
});
