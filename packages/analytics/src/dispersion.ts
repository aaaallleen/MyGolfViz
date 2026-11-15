import { compareClubs, type Measurements, type Shot } from '@fsa/domain';

export type LandingMode = 'carry' | 'total';
export interface DispersionPoint { shotId: string; x: number; y: number }
/** `sd1` is the 1 SD ellipse; `all` is the smallest same-shape ellipse that holds every shot. */
export type EllipseKind = 'sd1' | 'all';
/** halfX/halfY are half the ellipse's lateral width and distance depth (k·SDx, k·SDy); k is the Mahalanobis radius. */
export interface Ellipse { cx: number; cy: number; rx: number; ry: number; angleDeg: number; halfX: number; halfY: number }
export interface DispersionStats {
  mode: LandingMode;
  kind: EllipseKind;
  points: DispersionPoint[];
  excluded: number;
  centroid: { x: number; y: number } | null;
  meanAbsLateral: number | null;
  sdX: number | null;
  sdY: number | null;
  ellipse: Ellipse | null;
  observedInside: number;
  expectedCoverage: number;
}

export const EXPECTED_1SIGMA_COVERAGE: number = 1 - Math.exp(-0.5);

export function dispersionStats(
  shots: readonly { id: string; m: Measurements }[], mode: LandingMode, kind: EllipseKind = 'sd1',
): DispersionStats {
  const points: DispersionPoint[] = [];
  for (const s of shots) {
    const x = s.m.lateral;
    const y = s.m[mode];
    if (x !== null && y !== null) points.push({ shotId: s.id, x, y });
  }
  const base = { mode, kind, points, excluded: shots.length - points.length, expectedCoverage: EXPECTED_1SIGMA_COVERAGE };
  const n = points.length;
  if (n === 0) {
    return { ...base, centroid: null, meanAbsLateral: null, sdX: null, sdY: null, ellipse: null, observedInside: 0 };
  }
  const cx = points.reduce((a, p) => a + p.x, 0) / n;
  const cy = points.reduce((a, p) => a + p.y, 0) / n;
  const meanAbsLateral = points.reduce((a, p) => a + Math.abs(p.x), 0) / n;
  const sxx = points.reduce((a, p) => a + (p.x - cx) ** 2, 0) / n;
  const syy = points.reduce((a, p) => a + (p.y - cy) ** 2, 0) / n;
  const sxy = points.reduce((a, p) => a + (p.x - cx) * (p.y - cy), 0) / n;
  const stats = {
    ...base, centroid: { x: cx, y: cy }, meanAbsLateral,
    sdX: n < 2 ? null : Math.sqrt(sxx), sdY: n < 2 ? null : Math.sqrt(syy),
  };
  const det = sxx * syy - sxy * sxy;
  if (n < 3 || det <= 1e-9) return { ...stats, ellipse: null, observedInside: 0 };

  const tr = sxx + syy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(0, tr / 2 - disc);
  let angleDeg = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
  if (angleDeg <= -90) angleDeg += 180;
  else if (angleDeg > 90) angleDeg -= 180;

  const d2s = points.map((p) => {
    const dx = p.x - cx, dy = p.y - cy;
    return (syy * dx * dx - 2 * sxy * dx * dy + sxx * dy * dy) / det;
  });
  // The sliver keeps the farthest point inside despite rounding.
  const k2 = kind === 'all' ? Math.max(...d2s) * (1 + 1e-9) : 1;
  const observedInside = d2s.filter((d2) => d2 <= k2).length;
  return {
    ...stats,
    ellipse: {
      cx, cy, rx: Math.sqrt(k2 * l1), ry: Math.sqrt(k2 * l2), angleDeg,
      halfX: Math.sqrt(k2 * sxx), halfY: Math.sqrt(k2 * syy),
    },
    observedInside,
  };
}

export interface ClubDispersion { club: string; stats: DispersionStats }

/** Dispersion per club, clubs in bag order (Driver first). Each club gets its own centroid, SDs and ellipse. */
export function dispersionByClub(shots: readonly Shot[], mode: LandingMode, kind: EllipseKind = 'sd1'): ClubDispersion[] {
  const byClub = new Map<string, Shot[]>();
  for (const s of shots) {
    const g = byClub.get(s.club);
    if (g) g.push(s); else byClub.set(s.club, [s]);
  }
  return [...byClub.keys()].sort(compareClubs).map((club) => ({ club, stats: dispersionStats(byClub.get(club)!, mode, kind) }));
}
