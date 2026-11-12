import { expect, test } from 'vitest';
import { clubCategory, compareClubs } from './index';

test.each([
  ['Driver', 'driver'], ['3 Wood', 'wood'], ['4 Hybrid', 'wood'], ['5W', 'wood'], ['7 Iron', 'iron'],
  ['Pitching Wedge', 'iron'], ['Gap Wedge', 'iron'], ['Unknown club', 'iron'],
] as const)('clubCategory(%s)', (club, cat) => {
  expect(clubCategory(club)).toBe(cat);
});

test('compareClubs sorts in bag order: driver, woods, hybrids, irons by number, wedges, then unknown names', () => {
  const shuffled = ['Gap Wedge', '7 Iron', 'Unknown club', 'Driver', 'Sand Wedge', '4 Hybrid', '3 Wood', 'Pitching Wedge', '9 Iron', '6 Iron', 'Lob Wedge'];
  expect([...shuffled].sort(compareClubs)).toEqual(
    ['Driver', '3 Wood', '4 Hybrid', '6 Iron', '7 Iron', '9 Iron', 'Pitching Wedge', 'Gap Wedge', 'Sand Wedge', 'Lob Wedge', 'Unknown club'],
  );
});

test('compareClubs understands short names', () => {
  expect(['SW', '7i', '5W', 'PW', '3H', '10 Iron'].sort(compareClubs)).toEqual(['5W', '3H', '7i', '10 Iron', 'PW', 'SW']);
});
