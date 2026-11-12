import { expect, test } from 'vitest';
import { clubCategory } from './index';

test.each([
  ['Driver', 'driver'], ['3 Wood', 'wood'], ['4 Hybrid', 'wood'], ['5W', 'wood'], ['7 Iron', 'iron'],
  ['Pitching Wedge', 'iron'], ['Gap Wedge', 'iron'], ['Unknown club', 'iron'],
] as const)('clubCategory(%s)', (club, cat) => {
  expect(clubCategory(club)).toBe(cat);
});
