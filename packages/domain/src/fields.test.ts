import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { FIELD_DEFS, MEASUREMENT_KEYS, classifyHeader, unparsedHeaders } from './index';

test.each([
  ['club', { type: 'text', key: 'club' }],
  ['Club (mph)', { type: 'measurement', key: 'clubSpeed', sourceUnit: 'mph' }],
  ['Smash', { type: 'measurement', key: 'smash', sourceUnit: null }],
  ['Shot Type', { type: 'text', key: 'shotType' }],
  ['Low Point (ftin)', { type: 'measurement', key: 'lowPoint', sourceUnit: 'ftin' }],
  ['Swing H (°)', { type: 'measurement', key: 'swingH', sourceUnit: '°' }],
  ['  carry   (YDS) ', { type: 'measurement', key: 'carry', sourceUnit: 'YDS' }],
  ['Wind (mph)', { type: 'unknown' }],
])('classifyHeader(%j)', (header, expected) => {
  const c = classifyHeader(header);
  if (c.type === 'measurement') {
    expect({ type: c.type, key: c.def.key, sourceUnit: c.sourceUnit }).toEqual(expected);
  } else {
    expect(c).toEqual(expected);
  }
});

test('all 32 headers of the Sept 19 2022 fixture classify: 27 measurements + 5 text, none unknown', () => {
  const path = fileURLToPath(
    new URL('../../../fixtures/flightscope/FlightScope Golf Session Sept 19 2022.csv', import.meta.url),
  );
  const headers = readFileSync(path, 'utf8').split(/\r?\n/)[0]!.replace(/^﻿/, '').split(',');
  expect(headers).toHaveLength(32);
  const classes = headers.map(classifyHeader);
  expect(classes.filter((c) => c.type === 'measurement')).toHaveLength(27);
  expect(classes.filter((c) => c.type === 'text')).toHaveLength(5);
  expect(classes.filter((c) => c.type === 'unknown')).toHaveLength(0);
});

test('FIELD_DEFS has 27 unique keys equal to MEASUREMENT_KEYS', () => {
  expect(FIELD_DEFS).toHaveLength(27);
  const keys = FIELD_DEFS.map((d) => d.key);
  expect(new Set(keys).size).toBe(27);
  expect([...MEASUREMENT_KEYS]).toEqual(keys);
});

describe('unparsedHeaders', () => {
  test('keeps unrecognized names, unreadable units and repeats of a column already read, in order', () => {
    expect(unparsedHeaders([
      'club', 'Shot', 'Carry (yds)', 'Weather', 'Carry Distance (yds)', 'Spin (furlongs)', 'Mode', 'Weather', 'Smash',
    ])).toEqual(['Weather', 'Carry Distance (yds)', 'Spin (furlongs)']);
  });

  test('a standard FlightScope header row leaves nothing over', () => {
    const header = 'club,Shot,Ball (mph),Club (mph),Smash,Carry (yds),Total (yds),Roll (yds),Swing H (°),Spin (rpm),Height (ft),Time (s),AOA (°),Spin Loft (°),Swing V (°),Spin Axis (°),Lateral (yds),Shot Type,FTP (°),FTT (°),Dynamic Loft (°),Club Path (°),Launch H (°),Launch V (°),Low Point (ftin),DescentV (°),Curve Dist (yds),Lateral Impact (in),Vertical Impact (in),Mode,Location,Altitude (ft)';
    expect(unparsedHeaders(header.split(','))).toEqual([]);
  });
});
