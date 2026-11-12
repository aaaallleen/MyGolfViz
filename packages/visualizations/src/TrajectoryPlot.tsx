import type { TrajectoryCurve } from '@fsa/analytics';
import { ProvenanceTag } from '@fsa/ui';
import { linear, niceTicks } from './scale';
import { BALL, INK, MUTED, GRID, SURFACE, FONT } from './theme';

export interface TrajectoryPlotProps {
  curves: TrajectoryCurve[];
  selectedId: string | null;
}

const W = 560, H = 220;
const L = 40, R = 540, T = 20, B = 180;

function apex(c: TrajectoryCurve): number {
  let max = 0;
  for (let i = 0; i <= 50; i++) {
    const t = i / 50, u = 1 - t;
    max = Math.max(max, 3 * u * u * t * c.p1[1] + 3 * u * t * t * c.p2[1]);
  }
  return max;
}

export function TrajectoryPlot({ curves, selectedId }: TrajectoryPlotProps) {
  if (curves.length === 0) {
    return <p className="fsa-trajectory fsa-trajectory--empty">No shots with launch, apex, descent and carry</p>;
  }
  const xMax = Math.max(...curves.map((c) => c.p3[0]), 1) * 1.05;
  const yMaxFt = Math.max(...curves.map((c) => apex(c) * 3), 3) * 1.1;
  const sx = linear(0, xMax, L, R);
  const sy = linear(0, yMaxFt / 3, B, T); // y in yards
  const xTicks = niceTicks(0, xMax, 5).filter((t) => t > 0);
  const yTicks = niceTicks(0, yMaxFt, 3).filter((t) => t > 0);

  const sel = curves.find((c) => c.shotId === selectedId) ?? null;
  const ordered = sel ? [...curves.filter((c) => c !== sel), sel] : curves;
  const d = (c: TrajectoryCurve) =>
    `M${sx(c.p0[0])} ${sy(c.p0[1])} C${sx(c.p1[0])} ${sy(c.p1[1])} ${sx(c.p2[0])} ${sy(c.p2[1])} ${sx(c.p3[0])} ${sy(c.p3[1])}`;
  const aria =
    'Side-view trajectories of height against distance.' +
    (sel ? ` Selected shot peaks at ${Math.round(apex(sel) * 3)} feet and carries ${Math.round(sel.p3[0])} yards.` : '');

  return (
    <div className="fsa-trajectory">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <ProvenanceTag kind="illustrative" />
        <span style={{ fontSize: 13, color: MUTED }}>Drawn from launch angle, apex height, descent angle and carry</span>
      </div>
      <svg role="img" aria-label={aria} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} rx={8} fill={SURFACE} />
        <g stroke={GRID} strokeWidth={1}>
          {yTicks.map((t) => <line key={`gy${t}`} x1={L} y1={sy(t / 3)} x2={R} y2={sy(t / 3)} />)}
          {xTicks.map((t) => <line key={`gx${t}`} x1={sx(t)} y1={T} x2={sx(t)} y2={B} />)}
        </g>
        <line x1={L} y1={B} x2={R} y2={B} stroke={MUTED} strokeWidth={1.5} />
        <g fill="none" stroke={BALL} strokeOpacity={0.45} strokeWidth={1.5}>
          {ordered.map((c) => {
            const isSel = c === sel;
            return (
              <path key={c.shotId} data-shot-id={c.shotId} d={d(c)}
                {...(isSel ? { 'data-selected': 'true', stroke: INK, strokeOpacity: 1, strokeWidth: 3 } : {})} />
            );
          })}
        </g>
        {sel && <circle cx={sx(sel.p3[0])} cy={sy(0)} r={5} fill={INK} />}
        <g fill={MUTED} fontSize={12} fontFamily={FONT}>
          {yTicks.map((t) => <text key={`ty${t}`} x={8} y={sy(t / 3) + 4}>{t} ft</text>)}
          {xTicks.map((t) => <text key={`tx${t}`} x={sx(t)} y={H - 16} textAnchor="middle">{t}</text>)}
          <text x={R} y={H - 2} textAnchor="end" fontSize={11}>Distance (yd)</text>
        </g>
      </svg>
    </div>
  );
}
