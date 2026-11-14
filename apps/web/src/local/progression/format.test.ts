import { describe, expect, test } from 'vitest';
import { formatDelta } from './format';

describe('formatDelta', () => {
  test('negative uses U+2212', () => expect(formatDelta('spin', -570)).toBe('−570 rpm'));
  test('positive is signed', () => expect(formatDelta('clubPath', 3.9)).toBe('+3.9°'));
  test('rounds to zero unsigned', () => expect(formatDelta('carry', 0.04)).toBe('0.0 yd'));
});
