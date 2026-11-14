import { MEASUREMENT_KEYS } from '@fsa/domain';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, DEFAULT_LAYOUT, moveTile, parseLayout, TILES } from './tiles';

describe('TILES', () => {
  it('has 25 unique tiles with valid metrics and categories', () => {
    expect(TILES).toHaveLength(25);
    expect(new Set(TILES.map((t) => t.id)).size).toBe(25);
    for (const t of TILES) {
      if (t.metric) expect(MEASUREMENT_KEYS).toContain(t.metric);
      expect(CATEGORIES.map((c) => c.id)).toContain(t.category);
    }
  });
  it('default layout ids all exist', () => {
    const ids = TILES.map((t) => t.id);
    for (const id of DEFAULT_LAYOUT) expect(ids).toContain(id);
  });
  it('has the spec category titles and questions', () => {
    expect(CATEGORIES.map((c) => c.title)).toEqual([
      'Distance', 'Accuracy', 'Consistency', 'Club delivery', 'Ball flight', 'Strike quality',
    ]);
    expect(CATEGORIES[0]!.question).toBe('Are distances improving and becoming more predictable?');
  });
});

describe('parseLayout', () => {
  it('falls back to the default when missing or not a list', () => {
    expect(parseLayout(undefined)).toEqual([...DEFAULT_LAYOUT]);
    expect(parseLayout({ tiles: 'x' })).toEqual([...DEFAULT_LAYOUT]);
    expect(parseLayout(parseLayout(null))).not.toBe(DEFAULT_LAYOUT);
  });
  it('keeps an empty list', () => {
    expect(parseLayout({ tiles: [] })).toEqual([]);
  });
  it('drops unknown ids and duplicates', () => {
    expect(parseLayout({ tiles: ['spin', 'nope', 'spin', 'carry'] })).toEqual(['spin', 'carry']);
  });
});

describe('moveTile', () => {
  const l = ['carry', 'spin', 'ftp'] as const;
  it('moves earlier and later', () => {
    expect(moveTile(l, 'spin', -1)).toEqual(['spin', 'carry', 'ftp']);
    expect(moveTile(l, 'spin', 1)).toEqual(['carry', 'ftp', 'spin']);
  });
  it('is a no-op at the ends', () => {
    expect(moveTile(l, 'carry', -1)).toEqual([...l]);
    expect(moveTile(l, 'ftp', 1)).toEqual([...l]);
  });
});
