import { BALL, FONT, GRID, INK, MUTED } from './theme';

export interface ImpactHeatmapProps { counts: readonly (readonly number[])[]; title: string }

const CELL = 36, LEFT = 34, TOP = 16, BOTTOM = 16, RIGHT = 34;

/** counts[row][col]; row 0 = highest, col 0 = most heel. Not mirrored for handedness. */
export function ImpactHeatmap({ counts, title }: ImpactHeatmapProps) {
  const rows = counts.length, cols = counts[0]?.length ?? 0;
  const max = Math.max(0, ...counts.flat());
  const w = LEFT + cols * CELL + RIGHT, h = TOP + rows * CELL + BOTTOM;
  const midY = TOP + (rows * CELL) / 2, midX = LEFT + (cols * CELL) / 2;

  return (
    <svg role="img" aria-label={title} viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block', fontFamily: FONT }}>
      {counts.map((row, r) =>
        row.map((c, k) => {
          const x = LEFT + k * CELL, y = TOP + r * CELL;
          return (
            <g key={`${r}-${k}`}>
              <rect
                data-cell=""
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                fill={c > 0 ? BALL : 'none'}
                fillOpacity={c > 0 && max > 0 ? c / max : undefined}
                stroke={GRID}
                strokeWidth={1}
              />
              {c > 0 && (
                <text x={x + CELL / 2} y={y + CELL / 2 + 4} textAnchor="middle" fontSize={11} fill={INK} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {c}
                </text>
              )}
            </g>
          );
        }),
      )}
      <text x={LEFT - 6} y={midY + 3} textAnchor="end" fontSize={10} fill={MUTED}>Heel</text>
      <text x={LEFT + cols * CELL + 6} y={midY + 3} fontSize={10} fill={MUTED}>Toe</text>
      <text x={midX} y={TOP - 5} textAnchor="middle" fontSize={10} fill={MUTED}>High</text>
      <text x={midX} y={TOP + rows * CELL + 12} textAnchor="middle" fontSize={10} fill={MUTED}>Low</text>
    </svg>
  );
}
