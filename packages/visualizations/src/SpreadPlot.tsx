import type { DispersionStats } from '@fsa/analytics';
import { niceTicks } from './scale';
import { GRID, MUTED, SURFACE, FONT } from './theme';

export interface SpreadBounds { distMin: number; distMax: number; latMin: number; latMax: number }

export interface SpreadPlotProps {
  groups: { key: string; label: string; color: string; stats: DispersionStats }[];
  bounds: SpreadBounds;
  /** viewBox width; the height follows from the bounds so one yard is the same length on both axes. */
  width: number;
  ariaLabel: string;
}

const MIN_SPAN = 10, PAD = 0.1;
const LABEL_PAD = 6;

/**
 * The window that frames every point and every ellipse box (centre ± half extents) with 10% padding,
 * at least 10 yd per axis, widened on its shorter axis so lateral span = aspect × distance span.
 */
export function spreadBounds(stats: readonly DispersionStats[], aspect = 0.75): SpreadBounds | null {
  const dist: number[] = [], lat: number[] = [];
  for (const s of stats) {
    for (const p of s.points) { dist.push(p.y); lat.push(p.x); }
    const e = s.ellipse;
    if (e) { dist.push(e.cy - e.halfY, e.cy + e.halfY); lat.push(e.cx - e.halfX, e.cx + e.halfX); }
  }
  if (dist.length === 0) return null;
  const fit = (v: number[]) => {
    const lo = v.reduce((m, x) => Math.min(m, x), Infinity), hi = v.reduce((m, x) => Math.max(m, x), -Infinity);
    const pad = (hi - lo) * PAD, mid = (lo + hi) / 2;
    const half = Math.max(hi - lo + 2 * pad, MIN_SPAN) / 2;
    return { mid, half };
  };
  const d = fit(dist), l = fit(lat);
  let dHalf = d.half, lHalf = l.half;
  if (lHalf < aspect * dHalf) lHalf = aspect * dHalf;
  else dHalf = lHalf / aspect;
  return { distMin: d.mid - dHalf, distMax: d.mid + dHalf, latMin: l.mid - lHalf, latMax: l.mid + lHalf };
}

const r1 = (n: number) => Number(n.toFixed(1));
const r3 = (n: number) => Number(n.toFixed(3));

export function SpreadPlot({ groups, bounds, width, ariaLabel }: SpreadPlotProps) {
  const { distMin, distMax, latMin, latMax } = bounds;
  const k = width / (distMax - distMin);
  const height = (latMax - latMin) * k;
  const sx = (d: number) => (d - distMin) * k;
  const sy = (lat: number) => (lat - latMin) * k; // left of target above the line, right below

  const distTicks = niceTicks(distMin, distMax, 5);
  const latTicks = niceTicks(latMin, latMax, 4).filter((t) => t !== 0);
  const hasTarget = latMin <= 0 && latMax >= 0;

  // Ellipse: the unit circle mapped by the principal axes. Data is (lateral, distance); the screen
  // puts distance on x and lateral on y, so each axis direction (cos θ, sin θ) maps to (k sin θ, k cos θ).
  const ellipseMatrix = (e: NonNullable<DispersionStats['ellipse']>) => {
    const th = (e.angleDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    return `matrix(${[k * e.rx * s, k * e.rx * c, k * e.ry * c, -k * e.ry * s, sx(e.cy), sy(e.cx)].map(r3).join(' ')})`;
  };

  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${r1(width)} ${r1(height)}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <rect x={0} y={0} width={width} height={height} rx={8} fill={SURFACE} />
      <g>
        <g stroke={GRID} strokeWidth={1} strokeDasharray="2 4">
          {distTicks.map((t) => <line key={`d${t}`} data-testid="distance-line" x1={r1(sx(t))} y1={0} x2={r1(sx(t))} y2={r1(height)} />)}
          {latTicks.map((t) => <line key={`l${t}`} data-testid="lateral-line" x1={0} y1={r1(sy(t))} x2={r1(width)} y2={r1(sy(t))} />)}
        </g>
        {hasTarget && (
          <line data-testid="target-line" x1={0} y1={r1(sy(0))} x2={r1(width)} y2={r1(sy(0))} stroke={MUTED} strokeWidth={1.5} strokeDasharray="6 5" />
        )}
        {groups.map((g) => {
          const e = g.stats.ellipse;
          return e && (
            <circle key={`el-${g.key}`} data-testid="ellipse" data-key={g.key} cx={0} cy={0} r={1} transform={ellipseMatrix(e)}
              fill={g.color} fillOpacity={0.12} stroke={g.color} strokeOpacity={0.9} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          );
        })}
        {groups.map((g) => (
          <g key={`pts-${g.key}`} data-key={g.key} fill={g.color} fillOpacity={0.7}>
            {g.stats.points.map((p) => (
              <circle key={p.shotId} data-shot-id={p.shotId} data-key={g.key} cx={r1(sx(p.y))} cy={r1(sy(p.x))} r={4} />
            ))}
          </g>
        ))}
        {groups.map((g) => {
          const c = g.stats.centroid;
          return c && (
            <g key={`mean-${g.key}`} data-testid="centroid" data-key={g.key} stroke={g.color} strokeWidth={1.5}>
              <line x1={r1(sx(c.y) - 6)} y1={r1(sy(c.x))} x2={r1(sx(c.y) + 6)} y2={r1(sy(c.x))} />
              <line x1={r1(sx(c.y))} y1={r1(sy(c.x) - 6)} x2={r1(sx(c.y))} y2={r1(sy(c.x) + 6)} />
            </g>
          );
        })}
      </g>
      <g fill={MUTED} fontSize={11} fontFamily={FONT}>
        {distTicks.map((t) => <text key={`td${t}`} x={r1(sx(t))} y={r1(height - LABEL_PAD)} textAnchor="middle">{t}</text>)}
        {latTicks.map((t) => <text key={`tl${t}`} x={LABEL_PAD} y={r1(sy(t) - 3)}>{`${Math.abs(t)} ${t < 0 ? 'L' : 'R'}`}</text>)}
      </g>
    </svg>
  );
}
