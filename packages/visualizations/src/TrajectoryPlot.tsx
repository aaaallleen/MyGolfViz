import type { TrajectoryCurve } from '@fsa/analytics';
import { ProvenanceTag } from '@fsa/ui';
import { emphasis, PATTERN_LEFT, PATTERN_RIGHT_PAD, PATTERN_WIDTH, patternXMax, type ClubSeries } from './clubSeries';
import { linear, niceTicks } from './scale';
import { INK, MUTED, GRID, SURFACE, FONT } from './theme';

export interface TrajectoryPlotProps {
  /** One entry per club, in bag order; each club's illustrative flight curves. */
  groups: (ClubSeries & { curves: TrajectoryCurve[] })[];
  selectedId: string | null;
  /** The club whose curves are drawn solid while the rest fade; null for none. */
  highlightClub?: string | null;
  /** Far end of the distance axis (yd). Pass the top view's value so the two line up. */
  xMax?: number;
  /** viewBox width; pass the top view's value so the two line up. */
  width?: number;
  /** Draw every group at full emphasis (Compare's two shots). */
  allOn?: boolean;
  /** Label each curve's carry (yd) at its landing point, in its group colour. */
  endLabels?: boolean;
}

const T = 20, BOTTOM = 40;
// Stroke opacity per emphasis level: nothing highlighted / this club highlighted / another club highlighted.
const LINE = { normal: 0.4, on: 0.9, off: 0.1 } as const;

const r1 = (n: number) => Number(n.toFixed(1));

function apex(c: TrajectoryCurve): number {
  let max = 0;
  for (let i = 0; i <= 50; i++) {
    const t = i / 50, u = 1 - t;
    max = Math.max(max, 3 * u * u * t * c.p1[1] + 3 * u * t * t * c.p2[1]);
  }
  return max;
}

export function TrajectoryPlot({ groups, selectedId, highlightClub = null, xMax, width = PATTERN_WIDTH, allOn = false, endLabels = false }: TrajectoryPlotProps) {
  const all = groups.flatMap((g) => g.curves.map((c) => ({ c, g })));
  if (all.length === 0) {
    return <p className="fsa-trajectory fsa-trajectory--empty">No shots with launch, apex, descent and carry</p>;
  }
  const L = PATTERN_LEFT, R = width - PATTERN_RIGHT_PAD;
  const plotH = Math.max(110, Math.round(width * 0.22));
  const B = T + plotH, H = B + BOTTOM;
  const xEnd = xMax ?? patternXMax(Math.max(...all.map(({ c }) => c.p3[0])));
  const yMaxFt = Math.max(...all.map(({ c }) => apex(c) * 3), 3) * 1.1;
  const sx = linear(0, xEnd, L, R);
  const sy = linear(0, yMaxFt / 3, B, T); // y in yards
  const xTicks = niceTicks(0, xEnd, 6).filter((t) => t > 0);
  const yTicks = niceTicks(0, yMaxFt, 4).filter((t) => t > 0);

  const sel = all.find(({ c }) => c.shotId === selectedId) ?? null;
  const ordered = [...groups].sort((a, b) => Number(a.club === highlightClub) - Number(b.club === highlightClub));
  const d = (c: TrajectoryCurve) =>
    `M${r1(sx(c.p0[0]))} ${r1(sy(c.p0[1]))} C${r1(sx(c.p1[0]))} ${r1(sy(c.p1[1]))} ${r1(sx(c.p2[0]))} ${r1(sy(c.p2[1]))} ${r1(sx(c.p3[0]))} ${r1(sy(c.p3[1]))}`;
  const aria =
    'Side-view trajectories of height against distance from the tee, one colour per club.' +
    (highlightClub ? ` ${highlightClub} highlighted.` : '') +
    (sel ? ` Selected shot peaks at ${Math.round(apex(sel.c) * 3)} feet and carries ${Math.round(sel.c.p3[0])} yards.` : '');

  return (
    <div className="fsa-trajectory">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <ProvenanceTag kind="illustrative" />
        <span style={{ fontSize: 13, color: MUTED }}>Drawn from launch angle, apex height, descent angle and carry</span>
      </div>
      <svg role="img" aria-label={aria} viewBox={`0 0 ${width} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={width} height={H} rx={8} fill={SURFACE} />
        <g stroke={GRID} strokeWidth={1}>
          {yTicks.map((t) => <line key={`gy${t}`} x1={L} y1={r1(sy(t / 3))} x2={R} y2={r1(sy(t / 3))} />)}
          {xTicks.map((t) => <line key={`gx${t}`} x1={r1(sx(t))} y1={T} x2={r1(sx(t))} y2={B} />)}
        </g>
        <line x1={L} y1={B} x2={R} y2={B} stroke={MUTED} strokeWidth={1.5} />
        {ordered.map((g) => {
          const level = allOn ? 'on' : emphasis(g.club, highlightClub);
          return (
            <g key={g.club} fill="none" stroke={g.color} strokeOpacity={LINE[level]} strokeWidth={level === 'on' ? 1.75 : 1.25}>
              {g.curves.filter((c) => c.shotId !== selectedId).map((c) => (
                <path key={c.shotId} data-shot-id={c.shotId} data-club={g.club} d={d(c)} />
              ))}
            </g>
          );
        })}
        {sel && (
          <g>
            <path data-shot-id={sel.c.shotId} data-club={sel.g.club} data-selected="true" d={d(sel.c)} fill="none" stroke={INK} strokeWidth={2.5} />
            <circle cx={r1(sx(sel.c.p3[0]))} cy={r1(sy(0))} r={5} fill={INK} />
          </g>
        )}
        {endLabels && ordered.map((g) => (
          <g key={`end-${g.club}`} fill={g.color} fontSize={12} fontWeight={600} fontFamily={FONT} textAnchor="middle">
            {g.curves.map((c) => (
              <text key={c.shotId} data-testid="end-label" x={r1(sx(c.p3[0]))} y={r1(sy(0) - 8)}>{Math.round(c.p3[0])}</text>
            ))}
          </g>
        ))}
        <g fill={MUTED} fontSize={12} fontFamily={FONT}>
          {yTicks.map((t) => <text key={`ty${t}`} x={8} y={r1(sy(t / 3) + 4)}>{t} ft</text>)}
          {xTicks.map((t) => <text key={`tx${t}`} x={r1(sx(t))} y={r1(B + 18)} textAnchor="middle">{t}</text>)}
          <text x={R} y={H - 6} textAnchor="end" fontSize={11}>Distance (yd)</text>
        </g>
      </svg>
    </div>
  );
}
