import type { Range } from '@fsa/analytics';
import { linear, niceTicks } from './scale';
import { BORDER, FONT, GRID, MUTED } from './theme';

export interface TrendSeries {
  name: string;
  color: string;
  /** One per session; null = gap (line breaks, no point). */
  values: readonly (number | null)[];
  /** Shaded low–high per session. */
  bands?: readonly ([number, number] | null)[];
  /** True → hollow point. */
  few?: readonly boolean[];
}

export interface TrendChartProps {
  /** Accessible name of the svg. */
  title: string;
  sessions: readonly { label: string; tooltip: string }[];
  series: readonly TrendSeries[];
  /** Shaded band across the plot; an open side runs to the plot edge. */
  target?: Range | null;
  formatTick: (v: number) => string;
  height?: number;
  /** Draw y = 0 when in range (signed metrics). */
  zeroLine?: boolean;
}

const W = 360, LEFT = 46, RIGHT = 10, TOP = 10, BOTTOM = 22;
const r2 = (n: number) => Number(n.toFixed(2));

/** Split indices into runs of consecutive non-null entries. */
function runs<T>(items: readonly (T | null | undefined)[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  items.forEach((v, i) => {
    if (v == null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(i);
  });
  if (cur.length) out.push(cur);
  return out;
}

export function TrendChart({ title, sessions, series, target = null, formatTick, height = 160, zeroLine = false }: TrendChartProps) {
  const nums: number[] = [];
  for (const s of series) {
    for (const v of s.values) if (v != null && Number.isFinite(v)) nums.push(v);
    for (const b of s.bands ?? []) if (b) nums.push(b[0], b[1]);
  }
  if (target) for (const b of [target.low, target.high]) if (b != null && Number.isFinite(b)) nums.push(b);

  let lo = nums.length ? Math.min(...nums) : 0;
  let hi = nums.length ? Math.max(...nums) : 1;
  if (hi === lo) {
    const pad = Math.max(1, Math.abs(lo) * 0.05);
    lo -= pad;
    hi += pad;
  }
  const pad = (hi - lo) * 0.05;
  const y0 = lo - pad, y1 = hi + pad;
  const ticks = niceTicks(y0, y1, 4);

  const plotT = TOP, plotB = height - BOTTOM;
  const sy = linear(y0, y1, plotB, plotT);
  const n = sessions.length;
  const xAt = (i: number) => (n <= 1 ? (LEFT + W - RIGHT) / 2 : LEFT + ((W - LEFT - RIGHT) * i) / (n - 1));

  let targetRect: { y: number; h: number } | null = null;
  if (target && (target.low != null || target.high != null)) {
    const top = target.high != null ? Math.max(plotT, Math.min(plotB, sy(target.high))) : plotT;
    const bottom = target.low != null ? Math.max(plotT, Math.min(plotB, sy(target.low))) : plotB;
    if (bottom > top) targetRect = { y: top, h: bottom - top };
  }

  return (
    <svg role="img" aria-label={title} viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: 'block', fontFamily: FONT }}>
      {targetRect && (
        <rect data-testid="target-band" x={LEFT} y={r2(targetRect.y)} width={W - LEFT - RIGHT} height={r2(targetRect.h)} fill={BORDER} opacity={0.35} />
      )}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={LEFT} x2={W - RIGHT} y1={r2(sy(t))} y2={r2(sy(t))} stroke={GRID} strokeWidth={1} />
          <text x={LEFT - 6} y={r2(sy(t)) + 3} textAnchor="end" fontSize={9} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatTick(t)}
          </text>
        </g>
      ))}
      {zeroLine && y0 < 0 && y1 > 0 && (
        <line x1={LEFT} x2={W - RIGHT} y1={r2(sy(0))} y2={r2(sy(0))} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />
      )}
      {sessions.map((s, i) => (
        <text key={i} x={r2(xAt(i))} y={height - 6} textAnchor="middle" fontSize={9} fill={MUTED}>
          {s.label}
        </text>
      ))}
      {series.map((s) => {
        const bandRuns = s.bands ? runs(s.bands) : [];
        const bandD = bandRuns
          .map((run) => {
            if (run.length === 1) {
              const i = run[0]!, b = s.bands![i]!;
              const x = xAt(i);
              return `M${r2(x - 3)} ${r2(sy(b[1]))} L${r2(x + 3)} ${r2(sy(b[1]))} L${r2(x + 3)} ${r2(sy(b[0]))} L${r2(x - 3)} ${r2(sy(b[0]))} Z`;
            }
            const up = run.map((i, k) => `${k ? 'L' : 'M'}${r2(xAt(i))} ${r2(sy(s.bands![i]![1]))}`);
            const down = [...run].reverse().map((i) => `L${r2(xAt(i))} ${r2(sy(s.bands![i]![0]))}`);
            return `${up.join(' ')} ${down.join(' ')} Z`;
          })
          .join(' ');
        const lineD = runs(s.values)
          .map((run) => run.map((i, k) => `${k ? 'L' : 'M'}${r2(xAt(i))} ${r2(sy(s.values[i]!))}`).join(' '))
          .join(' ');
        return (
          <g key={s.name}>
            {bandD && <path d={bandD} fill={s.color} opacity={0.18} />}
            {lineD && <path data-series={s.name} d={lineD} fill="none" stroke={s.color} strokeWidth={1.5} />}
            {s.values.map((v, i) =>
              v == null ? null : (
                <circle
                  key={i}
                  cx={r2(xAt(i))}
                  cy={r2(sy(v))}
                  r={3.5}
                  fill={s.few?.[i] ? 'none' : s.color}
                  stroke={s.color}
                  strokeWidth={1.5}
                >
                  <title>{`${sessions[i]?.tooltip ?? ''} · ${formatTick(v)}`}</title>
                </circle>
              ),
            )}
          </g>
        );
      })}
    </svg>
  );
}
