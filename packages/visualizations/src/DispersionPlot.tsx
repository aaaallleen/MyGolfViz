import type { DispersionStats, LandingMode } from '@fsa/analytics';
import { emphasis, PATTERN_LEFT, PATTERN_RIGHT_PAD, PATTERN_WIDTH, type ClubSeries } from './clubSeries';
import { niceTicks } from './scale';
import { INK, MUTED, GRID, SURFACE, FONT } from './theme';

export interface DispersionPlotProps {
  mode: LandingMode;
  /** One entry per club, in bag order; each club's points, centroid and ellipse. */
  groups: (ClubSeries & { stats: DispersionStats })[];
  /** Far end of the distance axis (yd), shared with the side view. */
  xMax: number;
  selectedId: string | null;
  /** The club whose marks are drawn solid while the rest fade; null for none. */
  highlightClub: string | null;
  /** Horizontal launch of the selected shot (deg, right +), to bend its path from the tee. */
  selectedLaunchH?: number | null;
  /** viewBox width; the plot keeps one yard the same length on both axes. */
  width?: number;
  /** Draw every group at full emphasis (Compare's two shots). */
  allOn?: boolean;
  /** Makes landing dots clickable; without it they are plain marks. */
  onSelect?(shotId: string): void;
  labelFor(shotId: string): string;
}

const T = 30, BOTTOM = 40;
/** Smallest gap between lateral yardage labels, in viewBox units. */
const LAT_LABEL_GAP = 18;

const NOTE = {
  carry: 'Actual reported landing position',
  total: 'Hybrid plot, not actual resting position',
} as const;

// Opacity per emphasis level: nothing highlighted / this club highlighted / another club highlighted.
const DOT = { normal: 0.45, on: 0.95, off: 0.12 } as const;
const RING = { normal: 0.55, on: 1, off: 0.18 } as const;
const FILL = { normal: 0.05, on: 0.12, off: 0.02 } as const;

const r1 = (n: number) => Number(n.toFixed(1));
const r3 = (n: number) => Number(n.toFixed(3));
const tickLat = (t: number) => (t === 0 ? 'Target' : `${Math.abs(t)} ${t < 0 ? 'L' : 'R'}`);

export function DispersionPlot({ mode, groups, xMax, selectedId, highlightClub, selectedLaunchH = null, width = PATTERN_WIDTH, allOn = false, onSelect, labelFor }: DispersionPlotProps) {
  const note = NOTE[mode];
  const points = groups.flatMap((g) => g.stats.points);

  if (points.length === 0) {
    return (
      <div className="fsa-dispersion fsa-dispersion--empty">
        <p>No shots with both lateral and {mode} values</p>
        <p style={{ color: MUTED, fontSize: 13 }}>{note}</p>
      </div>
    );
  }

  // One scale for both axes (yards per pixel), so distance arcs are true circles and spreads keep their shape.
  const L = PATTERN_LEFT, R = width - PATTERN_RIGHT_PAD;
  const k = (R - L) / xMax;
  const minPlotH = width * 0.3;
  const latData = Math.max(...points.map((p) => Math.abs(p.x))) * 1.1;
  const latMax = Math.max(latData, minPlotH / (2 * k), 5);
  const plotH = 2 * latMax * k;
  const B = T + plotH, H = B + BOTTOM;
  const sx = (d: number) => L + d * k;            // distance from the tee, left to right
  const sy = (lat: number) => T + (latMax + lat) * k; // left of target above the line, right below

  const distTicks = niceTicks(0, xMax, 6).filter((t) => t > 0);
  // Left/right yardage lines: every 10 yd where there is room for a label, wider steps when tight.
  const latStep = [5, 10, 20, 25, 50, 100].find((st) => st * k >= LAT_LABEL_GAP) ?? 100;
  const latTicks: number[] = [];
  for (let t = -Math.floor((latMax - 2 / k) / latStep) * latStep; t <= latMax - 2 / k; t += latStep) latTicks.push(t + 0);
  const word = mode === 'carry' ? 'Carry' : 'Total';
  const sel = points.find((p) => p.shotId === selectedId) ?? null;
  const ordered = [...groups].sort((a, b) => Number(a.club === highlightClub) - Number(b.club === highlightClub));

  const aria =
    `Top-down dispersion of ${word.toLowerCase()} distance from the tee against lateral landing, one colour per club, with a target centre line.` +
    (highlightClub ? ` ${highlightClub} highlighted.` : '') +
    (sel ? ` Selected ${labelFor(sel.shotId)} lands at ${r1(sel.y)} yards, ${r1(Math.abs(sel.x))} yards ${sel.x < 0 ? 'left' : 'right'}.` : '');

  // Ellipse: the unit circle mapped by the principal axes. Data is (lateral, distance); the screen
  // puts distance on x and lateral on y, so each axis direction (cos θ, sin θ) maps to (k sin θ, k cos θ).
  const ellipseMatrix = (e: NonNullable<DispersionStats['ellipse']>) => {
    const th = (e.angleDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    return `matrix(${[k * e.rx * s, k * e.rx * c, k * e.ry * c, -k * e.ry * s, sx(e.cy), sy(e.cx)].map(r3).join(' ')})`;
  };

  // The selected shot's path seen from above: leaves the tee along its launch direction, ends where it lands.
  let path: string | null = null;
  if (sel) {
    const lh = selectedLaunchH === null ? null : (selectedLaunchH * Math.PI) / 180;
    const ctrlLat = lh === null ? sel.x / 2 : (sel.y / 2) * Math.tan(lh);
    path = `M${r1(sx(0))} ${r1(sy(0))} Q${r1(sx(sel.y / 2))} ${r1(sy(ctrlLat))} ${r1(sx(sel.y))} ${r1(sy(sel.x))}`;
  }
  const labelLeft = sel !== null && sx(sel.y) > R - 140;

  return (
    <div className="fsa-dispersion">
      <svg role="img" aria-label={aria} viewBox={`0 0 ${width} ${r1(H)}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <clipPath id="fsa-dispersion-plot"><rect x={L} y={T} width={R - L} height={plotH} /></clipPath>
        </defs>
        <rect x={0} y={0} width={width} height={H} rx={8} fill={SURFACE} />
        <g clipPath="url(#fsa-dispersion-plot)" fill="none" stroke={GRID} strokeWidth={1}>
          {distTicks.map((t) => <circle key={`arc${t}`} data-testid="distance-arc" cx={sx(0)} cy={sy(0)} r={r1(t * k)} />)}
          {latTicks.filter((t) => t !== 0).map((t) => (
            <line key={`lat${t}`} data-testid="lateral-line" data-yd={t} x1={L} y1={r1(sy(t))} x2={R} y2={r1(sy(t))} strokeDasharray="2 4" />
          ))}
        </g>
        <line x1={sx(0)} y1={sy(0)} x2={R} y2={sy(0)} stroke={MUTED} strokeWidth={1.5} strokeDasharray="6 5" />
        <g fill={MUTED} fontSize={12} fontFamily={FONT}>
          {latTicks.map((t) => <text key={`tl${t}`} x={8} y={r1(sy(t) + 4)}>{tickLat(t)}</text>)}
          {distTicks.map((t) => <text key={`td${t}`} x={r1(sx(t))} y={r1(B + 18)} textAnchor="middle">{t}</text>)}
          <text x={R} y={r1(H - 6)} textAnchor="end" fontSize={11}>{`${word} distance (yd)`}</text>
          <text x={8} y={18} fontSize={11}>Lateral landing (yd) · left above the target line</text>
        </g>
        {ordered.map((g) => {
          const e = g.stats.ellipse, level = allOn ? 'on' : emphasis(g.club, highlightClub);
          return e && (
            <circle key={`el-${g.club}`} data-testid="ellipse" data-club={g.club} cx={0} cy={0} r={1} transform={ellipseMatrix(e)}
              fill={g.color} fillOpacity={FILL[level]} stroke={g.color} strokeOpacity={RING[level]}
              strokeWidth={level === 'on' ? 2 : 1.5} vectorEffect="non-scaling-stroke" />
          );
        })}
        {ordered.map((g) => {
          const c = g.stats.centroid, level = allOn ? 'on' : emphasis(g.club, highlightClub);
          return c && (
            <g key={`mean-${g.club}`} data-testid="centroid" data-club={g.club} stroke={g.color} strokeOpacity={RING[level]} strokeWidth={1.5}>
              <line x1={r1(sx(c.y) - 6)} y1={r1(sy(c.x))} x2={r1(sx(c.y) + 6)} y2={r1(sy(c.x))} />
              <line x1={r1(sx(c.y))} y1={r1(sy(c.x) - 6)} x2={r1(sx(c.y))} y2={r1(sy(c.x) + 6)} />
            </g>
          );
        })}
        {ordered.map((g) => {
          const level = allOn ? 'on' : emphasis(g.club, highlightClub);
          return (
            <g key={`pts-${g.club}`} fill={g.color} fillOpacity={DOT[level]}
              {...(level === 'on' ? { stroke: SURFACE, strokeWidth: 1.5 } : {})}>
              {g.stats.points.filter((p) => p.shotId !== selectedId).map((p) => (
                <circle key={p.shotId} data-shot-id={p.shotId} data-club={g.club} cx={r1(sx(p.y))} cy={r1(sy(p.x))} r={level === 'on' ? 5.5 : 5}
                  {...(onSelect ? { style: { cursor: 'pointer' }, onClick: () => onSelect(p.shotId) } : {})} />
              ))}
            </g>
          );
        })}
        {sel && path && (
          <g>
            <path data-testid="selected-path" d={path} fill="none" stroke={INK} strokeOpacity={0.7} strokeWidth={1.5} />
            <circle data-shot-id={sel.shotId} aria-current="true" cx={r1(sx(sel.y))} cy={r1(sy(sel.x))} r={8}
              fill={INK} stroke={SURFACE} strokeWidth={2}
              {...(onSelect ? { style: { cursor: 'pointer' }, onClick: () => onSelect(sel.shotId) } : {})} />
            <text x={r1(sx(sel.y) + (labelLeft ? -14 : 14))} y={r1(sy(sel.x) - 8)} textAnchor={labelLeft ? 'end' : 'start'}
              fill={INK} fontSize={13} fontWeight={600} fontFamily={FONT} stroke={SURFACE} strokeWidth={3} paintOrder="stroke">
              {labelFor(sel.shotId)}
            </text>
          </g>
        )}
      </svg>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED }}>{note}</p>
    </div>
  );
}
