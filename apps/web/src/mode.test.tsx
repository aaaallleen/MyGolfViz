import { describe, expect, test } from 'vitest';
import { readAppMode } from './mode';

describe('readAppMode', () => {
  test("'public' → 'public'; 'local' and undefined throw the exact message", () => {
    expect(readAppMode('public')).toBe('public');
    expect(() => readAppMode('local')).toThrow('Unsupported VITE_APP_MODE: local. This build supports: public');
    expect(() => readAppMode(undefined)).toThrow('Unsupported VITE_APP_MODE: undefined. This build supports: public');
  });
});
