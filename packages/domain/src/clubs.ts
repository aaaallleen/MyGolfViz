export type ClubCategory = 'driver' | 'wood' | 'iron';

export function clubCategory(club: string): ClubCategory {
  if (/driver|\b1w\b/i.test(club)) return 'driver';
  if (/wood|hybrid|\b\d+\s?[wh]\b/i.test(club)) return 'wood';
  return 'iron';
}

const WEDGES = ['pitching', 'gap', 'approach', 'sand', 'lob'] as const;
const WEDGE_ABBR: Record<string, number> = { pw: 0, gw: 1, aw: 2, sw: 3, lw: 4 };

/** Bag position: [group, number]. Driver, woods, hybrids, irons (low to high), wedges, then anything else. */
function bagKey(club: string): [number, number] {
  const c = club.trim().toLowerCase();
  if (/driver|^1\s?w$/.test(c)) return [0, 0];
  const m = /^(\d+)\s*-?\s*(wood|w|hybrid|h|iron|i)\b/.exec(c);
  if (m) return [{ w: 1, h: 2, i: 3 }[m[2]![0] as 'w' | 'h' | 'i'], Number(m[1])];
  const wedge = WEDGES.findIndex((w) => c.includes(w));
  if (wedge >= 0) return [4, wedge];
  if (c in WEDGE_ABBR) return [4, WEDGE_ABBR[c]!];
  const loft = /^(\d{2})\s*°?$/.exec(c); // a wedge named by its loft, e.g. "56"
  if (loft) return [4, 10 + Number(loft[1])];
  return [9, 0];
}

/** Orders clubs as they sit in a bag (Driver first, wedges last); unrecognized names go last, alphabetically. */
export function compareClubs(a: string, b: string): number {
  const [ga, na] = bagKey(a), [gb, nb] = bagKey(b);
  return ga - gb || na - nb || a.localeCompare(b);
}
