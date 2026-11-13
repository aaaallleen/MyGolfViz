import { describe, expect, test } from 'vitest';
import { readAppMode } from './mode';

describe('readAppMode', () => {
  test("'public' and 'local' pass; anything else throws the exact message", () => {
    expect(readAppMode('public')).toBe('public');
    expect(readAppMode('local')).toBe('local');
    expect(() => readAppMode('x')).toThrow('Unsupported VITE_APP_MODE: x. This build supports: public, local');
    expect(() => readAppMode(undefined)).toThrow('Unsupported VITE_APP_MODE: undefined. This build supports: public, local');
  });
});
