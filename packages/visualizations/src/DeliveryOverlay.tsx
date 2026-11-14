import { formatMeasurement } from '@fsa/domain';
import { GRID, MUTED, SURFACE, FONT } from './theme';

export interface DeliveryShot { id: string; label: string; color: string; clubPath: number | null; ftt: number | null }
export interface DeliveryOverlayProps { shots: DeliveryShot[]; width?: number }

const r1 = (n: number) => Number(n.toFixed(1));
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Top view of each shot's club path and face angle (degrees, right +, target line straight up). */
export function DeliveryOverlay({ shots, width = 360 }: DeliveryOverlayProps) {
  const H = Math.round(width * (300 / 360));
  const cx = width / 2, bottom = H - 24, len = H - 70, faceLen = width * 0.18;
  const mid = bottom - len / 2;

  const drawn: string[] = [];
  for (const s of shots) {
    if (s.clubPath !== null) drawn.push(`${s.label} path ${formatMeasurement('clubPath', s.clubPath)}`);
    if (s.ftt !== null) drawn.push(`${s.label} face ${formatMeasurement('ftt', s.ftt)}`);
  }
  const aria = `Top view of club path and face angle against the target line. ${drawn.join('. ')}`.trim();

  return (
    <div className="fsa-delivery">
      <svg role="img" aria-label={aria} viewBox={`0 0 ${width} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={width} height={H} rx={8} fill={SURFACE} />
        <line x1={cx} y1={bottom} x2={cx} y2={bottom - len} stroke={GRID} strokeWidth={1.5} strokeDasharray="6 5" />
        <text x={cx} y={bottom - len - 6} textAnchor="middle" fill={MUTED} fontSize={11} fontFamily={FONT}>Target</text>
        {shots.map((s, i) => {
          const px = s.clubPath === null ? null : cx + len * Math.sin(rad(s.clubPath));
          const py = s.clubPath === null ? null : bottom - len * Math.cos(rad(s.clubPath));
          const midX = s.clubPath === null ? cx : (cx + px!) / 2;
          const midY = s.clubPath === null ? mid : (bottom + py!) / 2;
          const dx = s.ftt === null ? 0 : (faceLen / 2) * Math.cos(rad(s.ftt));
          const dy = s.ftt === null ? 0 : (faceLen / 2) * Math.sin(rad(s.ftt));
          return (
            <g key={s.id} data-shot-id={s.id} stroke={s.color} fill={s.color}>
              {px !== null && py !== null && (
                <line data-kind="path" data-shot-id={s.id} x1={cx} y1={bottom} x2={r1(px)} y2={r1(py)} strokeWidth={2.5} strokeLinecap="round" />
              )}
              {s.ftt !== null && (
                <line data-kind="face" data-shot-id={s.id} x1={r1(midX - dx)} y1={r1(midY - dy)} x2={r1(midX + dx)} y2={r1(midY + dy)} strokeWidth={4} strokeLinecap="round" />
              )}
              {s.clubPath !== null && (
                <text data-kind="path-label" x={8} y={18 + i * 16} stroke="none" fontSize={12} fontFamily={FONT}>
                  {`${s.label} path ${formatMeasurement('clubPath', s.clubPath)}`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {shots.map((s) => (
        <div key={`miss-${s.id}`}>
          {s.clubPath === null && <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED }}>{`${s.label} has no club path data`}</p>}
          {s.ftt === null && <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED }}>{`${s.label} has no face angle data`}</p>}
        </div>
      ))}
    </div>
  );
}
