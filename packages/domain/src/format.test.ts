import { expect, test } from 'vitest';
import {
  IMPACT_CONVENTION, DEFAULT_SESSION_DETAILS, formatImpact, formatMeasurement,
  formatSessionDate, handednessLabel, sessionTitle,
} from './index';

test.each([
  ['clubPath', 3.1, '3.1° R'], ['clubPath', -0.8, '0.8° L'], ['clubPath', 0, '0.0°'],
  ['aoa', 2.6, '2.6° up'], ['aoa', -1.3, '1.3° down'], ['lateral', -44.7, '44.7 yd L'],
  ['spin', 2540, '2,540 rpm'], ['carry', 251.3, '251.3 yd'], ['smash', 1.456, '1.46'],
  ['impactLateral', 0.62, '0.62 in toe'], ['impactLateral', -0.47, '0.47 in heel'],
  ['impactVertical', -0.4, '0.40 in low'], ['impactLateral', 0, '0.00 in centered'],
  ['lowPoint', -2.9, '2.9 in behind'], ['lowPoint', 1.5, '1.5 in ahead'],
  ['flightTime', 7.6, '7.6 s'], ['carry', null, 'Not measured'],
] as const)('formatMeasurement(%s, %s) = %s', (key, v, out) => {
  expect(formatMeasurement(key, v)).toBe(out);
});

test('formatImpact', () => {
  expect(formatImpact(0.62, 0.44)).toBe('0.62 in toe · 0.44 in high');
  expect(formatImpact(null, 0.44)).toBe('Not measured');
});

test('IMPACT_CONVENTION is toe/high, verified true', () => {
  expect(IMPACT_CONVENTION).toEqual({ lateralPositive: 'toe', verticalPositive: 'high', verified: true });
});

test('sessionTitle', () => {
  expect(sessionTitle({ ...DEFAULT_SESSION_DETAILS, name: '' })).toBe('Untitled session');
  expect(sessionTitle({ ...DEFAULT_SESSION_DETAILS, name: '   ' })).toBe('Untitled session');
  expect(sessionTitle({ ...DEFAULT_SESSION_DETAILS, name: ' Range day ' })).toBe('Range day');
});

test('formatSessionDate is time-zone independent', () => {
  expect(formatSessionDate('2026-11-07')).toBe('7 Nov 2026 (set by you)');
  expect(formatSessionDate(null)).toBe('No date set');
});

test('handednessLabel', () => {
  expect(handednessLabel('right')).toBe('Right-handed');
  expect(handednessLabel('left')).toBe('Left-handed');
});

test('DEFAULT_SESSION_DETAILS', () => {
  expect(DEFAULT_SESSION_DETAILS).toEqual({ name: '', date: null, notes: '', handedness: 'right' });
});
