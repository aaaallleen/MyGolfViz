import type { DispersionStats } from '@fsa/analytics';
import { linear, niceTicks } from './scale';

export interface DispersionPlotProps {
  stats: DispersionStats;
  selectedId: string | null;
  onSelect(shotId: string): void;
  labelFor(shotId: string): string;
}

const W = 560, H = 440;
const L = 40, R = 520, T = 40, B = 400;
const AMBER = '#F5A742', INK = '#EAF0EC', MUTED = '#9BA9A1', GRID = '#26312C', BG = '#101714';
const FONT = 'Inter, sans-serif';

const NOTE = {
  carry: 'Actual reported landing position',
  total: 'Hybrid plot, not actual resting position',
} as const;

const r1 = (n: number) => Number(n.toFixed(1));
const tickX = (t: number) => (t === 0 ? 'Target' : `${Math.abs(t)} ${t < 0 ? 'L' : 'R'}`);

export function DispersionPlot({ stats, selectedId, onSelect, labelFor }: DispersionPlotProps) {
  const { mode, points, centroid, ellipse } = stats;
  const yTitle = mode === 'carry' ? 'Carry distance (yd)' : 'Total distance (yd)';
  const note = NOTE[mode];

  if (points.length === 0) {
    return (
      <div className="fsa-dispersion fsa-dispersion--empty">
        <p>No shots with both lateral and {mode} values</p>
        <p style={{ color: MUTED, fontSize: 13 }}>{note}</p>
      </div>
    );
  }

  const xr = Math.max(10, Math.max(...points.map((p) => Math.abs(p.x))) * 1.1);
  const ys = points.map((p) => p.y);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = Math.max((y1 - y0) * 0.1, 5);
  y0 -= pad; y1 += pad;
  const sx = linear(-xr, xr, L, R);
  const sy = linear(y0, y1, B, T);
  const xTicks = niceTicks(-xr, xr, 6);
  const yTicks = niceTicks(y0, y1, 4);

  const selected = points.find((p) => p.shotId === selectedId) ?? null;
  const modeWord = mode === 'carry' ? 'carry' : 'total';
  const aria =
    `Top-down dispersion plot of ${modeWord} distance against lateral landing, with a target centre line.` +
    (selected
      ? ` Selected ${labelFor(selected.shotId)} lands at ${r1(selected.y)} yards, ${r1(Math.abs(selected.x))} yards ${selected.x < 0 ? 'left' : 'right'}.`
      : '');

  // Ellipse: draw the unit circle through the data->pixel linear map (y flipped),
  // so the tilt stays correct under unequal x/y scales.
  let ellipseTransform: string | null = null;
  if (ellipse) {
    const th = (ellipse.angleDeg * Math.PI) / 180;
    const kx = (R - L) / (2 * xr), ky = (B - T) / (y1 - y0);
    const m = [
      kx * ellipse.rx * Math.cos(th), -ky * ellipse.rx * Math.sin(th),
      -kx * ellipse.ry * Math.sin(th), -ky * ellipse.ry * Math.cos(th),
      sx(ellipse.cx), sy(ellipse.cy),
    ];
    ellipseTransform = `matrix(${m.map((v) => r1(v * 1000) / 1000).join(' ')})`;
  }

  return (
    <div className="fsa-dispersion">
      <svg role="img" aria-label={aria} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} rx={8} fill={BG} />
        <g stroke={GRID} strokeWidth={1}>
          {yTicks.map((t) => <line key={`gy${t}`} x1={L} y1={sy(t)} x2={R} y2={sy(t)} />)}
          {xTicks.map((t) => <line key={`gx${t}`} x1={sx(t)} y1={T} x2={sx(t)} y2={B} />)}
        </g>
        <line x1={sx(0)} y1={T - 10} x2={sx(0)} y2={B + 10} stroke={MUTED} strokeWidth={1.5} strokeDasharray="6 5" />
        <g fill={MUTED} fontSize={12} fontFamily={FONT}>
          {yTicks.map((t) => <text key={`ty${t}`} x={8} y={sy(t) + 4}>{t}</text>)}
          {xTicks.map((t) => <text key={`tx${t}`} x={sx(t)} y={H - 12} textAnchor="middle">{tickX(t)}</text>)}
          <text x={(L + R) / 2} y={H - 0} textAnchor="middle" fontSize={11}>Lateral landing (yd) · right positive</text>
          <text x={8} y={22}>{yTitle}</text>
        </g>
        {ellipse && ellipseTransform && (
          <circle data-testid="ellipse" cx={0} cy={0} r={1} transform={ellipseTransform}
            fill={AMBER} fillOpacity={0.1} stroke={AMBER} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
        <g fill={AMBER} fillOpacity={0.8}>
          {points.map((p) => {
            const isSel = p.shotId === selectedId;
            return (
              <circle key={p.shotId} data-shot-id={p.shotId} cx={sx(p.x)} cy={sy(p.y)} r={isSel ? 9 : 6}
                {...(isSel ? { 'aria-current': 'true' as const, fill: INK, fillOpacity: 1, stroke: '#0D1210', strokeWidth: 2 } : {})}
                style={{ cursor: 'pointer' }} onClick={() => onSelect(p.shotId)} />
            );
          })}
        </g>
        {centroid && (
          <g data-testid="centroid" stroke={INK} strokeWidth={1.5}>
            <line x1={sx(centroid.x) - 12} y1={sy(centroid.y)} x2={sx(centroid.x) + 12} y2={sy(centroid.y)} />
            <line x1={sx(centroid.x)} y1={sy(centroid.y) - 12} x2={sx(centroid.x)} y2={sy(centroid.y) + 12} />
          </g>
        )}
        {selected && (
          <text x={sx(selected.x) + 15} y={sy(selected.y) - 5} fill={INK} fontSize={13} fontWeight={600} fontFamily={FONT}>
            {labelFor(selected.shotId)}
          </text>
        )}
      </svg>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED }}>{note}</p>
    </div>
  );
}
