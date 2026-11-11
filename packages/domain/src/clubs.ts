export type ClubCategory = 'driver' | 'wood' | 'iron';

export function clubCategory(club: string): ClubCategory {
  if (/driver|\b1w\b/i.test(club)) return 'driver';
  if (/wood|hybrid|\b\d+\s?[wh]\b/i.test(club)) return 'wood';
  return 'iron';
}
