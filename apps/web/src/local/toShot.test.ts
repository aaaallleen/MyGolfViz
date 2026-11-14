import { describe, expect, test } from 'vitest';
import type { ShotOut } from './api';
import { toShot } from './toShot';

describe('toShot', () => {
  test('maps a ShotOut, defaulting a null club', () => {
    const s = { id: 's1', importId: 'imp1', sourceRow: 4, club: null, excluded: false, flags: [], location: null, m: { carry: 200, spin: null }, mode: null, raw: {}, shotLabel: '7', shotType: null } as ShotOut;
    const out = toShot(s);
    expect(out.club).toBe('Unknown club');
    expect(out.fileId).toBe('imp1');
    expect(out.m).toEqual({ carry: 200, spin: null });
    expect(out.shotLabel).toBe('7');
  });
});
