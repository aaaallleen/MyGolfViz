import type { GapRow } from '@fsa/analytics';
import { linear, niceTicks } from './scale';
import { CLUB, FONT, GRID, INK, MUTED } from './theme';

export interface GappingChartProps { rows: readonly GapRow[]; formatValue: (v: number) => string }

const W = 360, LEFT = 8, RIGHT = 12, ROW = 22, GAP = 16, TOP = 6, AXIS = 18;
const r2 = (n: number) => Number(n.toFixed(2));

export function GappingChart({ rows, formatValue }: GappingChartProps) {
  const height = TOP + rows.length * ROW + Math.max(0, rows.length - 1) * GAP + AXIS;
  const vals = rows.flatMap((r) => [r.p25, r.p75, r.median]);
  let lo = vals.length ? Math.min(...vals) : 0;
  let hi = vals.length ? Math.max(...vals) : 1;
  if (hi === lo) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.05;
  const x = linear(lo - pad, hi + pad, LEFT, W - RIGHT);
  const ticks = niceTicks(lo - pad, hi + pad, 4);
  const axisY = height - AXIS + 2;

  return (
    <svg role="img" aria-label="Club gapping" viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: 'block', fontFamily: FONT }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={r2(x(t))} x2={r2(x(t))} y1={TOP} y2={axisY} stroke={GRID} strokeWidth={1} />
          <text x={r2(x(t))} y={axisY + 10} textAnchor="middle" fontSize={9} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatValue(t)}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = TOP + i * (ROW + GAP);
        const x1 = x(r.p25), x2 = x(r.p75), xm = x(r.median);
        return (
          <g key={`${i}:${r.club}`}>
            <text x={LEFT} y={y + 8} fontSize={10} fill={INK} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {`${r.club} · ${formatValue(r.median)}`}
            </text>
            <rect
              data-testid="gap-bar"
              x={r2(x1)}
              y={y + 12}
              width={r2(Math.max(x2 - x1, 1))}
              height={10}
              rx={2}
              fill={r.few ? 'none' : CLUB}
              fillOpacity={r.few ? undefined : 0.45}
              stroke={CLUB}
              strokeWidth={1.2}
            />
            <line x1={r2(xm)} x2={r2(xm)} y1={y + 10} y2={y + 24} stroke={INK} strokeWidth={2} />
            {i < rows.length - 1 && (r.overlapsNext || r.gapToNext != null) && (
              <text x={W - RIGHT} y={y + ROW + GAP / 2 + 3} textAnchor="end" fontSize={9} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {r.overlapsNext ? 'overlaps' : `${formatValue(r.gapToNext as number)} gap`}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
