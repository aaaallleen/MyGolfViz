import { formatMeasurement, type MeasurementKey } from '@fsa/domain';
import { Missing } from '@fsa/ui';
import { BALL, BALL_EDGE, BORDER, CLUB, DISPLAY_FONT, FONT, INK, MUTED, SOFT, SURFACE } from './theme';

export interface HorizontalDeliveryProps {
  clubPath: number | null;
  faceToTarget: number | null;
  faceToPath: number | null;
  launchH: number | null;
  exaggerate: 1 | 4;
  /** Which 2D layers to draw; all default to true. */
  layers?: { faceToTarget?: boolean; faceToPath?: boolean };
  /** Heading text; defaults to "Top view · face to path". */
  title?: string;
}

const OX = 200, OY = 250; // ball, top view; the target is straight up
const MAX_DRAWN = 75;
const f1 = (n: number) => Number(n.toFixed(1));

const dir = (deg: number, k: number) => {
  const a = (Math.max(-MAX_DRAWN, Math.min(MAX_DRAWN, deg * k)) * Math.PI) / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
};
const at = (d: { x: number; y: number }, t: number) => ({ x: f1(OX + d.x * t), y: f1(OY + d.y * t) });

function Row({ label, fieldKey, value, swatch }: { label: string; fieldKey: MeasurementKey; value: number | null; swatch?: React.CSSProperties }) {
  if (value === null) return <li style={{ color: MUTED, fontSize: 14 }}>{label} · <Missing /></li>;
  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: SOFT }}>
        {swatch && <span aria-hidden="true" style={{ width: 14, height: 3, ...swatch }} />}
        {label}
      </span>{' '}
      <strong style={{ fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: 600 }}>{formatMeasurement(fieldKey, value)}</strong>
    </li>
  );
}

/** Top view at impact: club path, face and launch direction against the target line. */
export function HorizontalDeliveryDiagram({ clubPath, faceToTarget, faceToPath, launchH, exaggerate, layers, title }: HorizontalDeliveryProps) {
  const k = exaggerate;
  const showFace = layers?.faceToTarget ?? true;
  const showFtp = layers?.faceToPath ?? true;
  const none = clubPath === null && faceToTarget === null && faceToPath === null && launchH === null;
  const path = clubPath === null ? null : dir(clubPath, k);
  const face = !showFace || faceToTarget === null ? null : dir(faceToTarget, k);
  const launch = launchH === null ? null : dir(launchH, k);
  const aria = none
    ? 'Top view at impact. Club delivery not measured for this shot.'
    : `Top view at impact: club path ${formatMeasurement('clubPath', clubPath)}, face to target ${formatMeasurement('ftt', faceToTarget)}, face to path ${formatMeasurement('ftp', faceToPath)}.`;

  return (
    <div className="fsa-horizontal-delivery" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: 600 }}>{title ?? 'Top view · face to path'}</h3>
        {k !== 1 && <span style={{ fontSize: 12, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 8px' }}>Angles ×{k}</span>}
      </div>
      <svg role="img" aria-label={aria} viewBox="0 20 400 310" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={0} y={20} width={400} height={310} rx={8} fill={SURFACE} />
        <line data-role="target-line" x1={200} y1={30} x2={200} y2={322} stroke={MUTED} strokeWidth={1.5} strokeDasharray="6 5" />
        <text x={208} y={44} fill={MUTED} fontSize={12} fontFamily={FONT}>Target line</text>
        {path && (() => {
          const a = at(path, -70), b = at(path, 195);
          const nx = -path.y, ny = path.x;
          return (
            <>
              <line data-role="club-path" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={CLUB} strokeWidth={3} strokeLinecap="round" />
              <path d={`M${b.x} ${b.y}L${f1(b.x - path.x * 12 + nx * 6)} ${f1(b.y - path.y * 12 + ny * 6)}M${b.x} ${b.y}L${f1(b.x - path.x * 12 - nx * 6)} ${f1(b.y - path.y * 12 - ny * 6)}`}
                stroke={CLUB} strokeWidth={3} strokeLinecap="round" fill="none" />
            </>
          );
        })()}
        {launch && (() => {
          const b = at(launch, 170);
          return <line data-role="launch" x1={OX} y1={OY} x2={b.x} y2={b.y} stroke={BALL} strokeWidth={3} strokeLinecap="round" strokeDasharray="2 7" />;
        })()}
        {face && (() => {
          const b = at(face, 140), c = at(face, -12);
          const nx = -face.y, ny = face.x;
          return (
            <>
              <line data-role="face" x1={OX} y1={OY} x2={b.x} y2={b.y} stroke={INK} strokeWidth={2} strokeLinecap="round" />
              <line data-role="face-bar" x1={f1(c.x - nx * 34)} y1={f1(c.y - ny * 34)} x2={f1(c.x + nx * 34)} y2={f1(c.y + ny * 34)}
                stroke={INK} strokeWidth={7} strokeLinecap="round" />
            </>
          );
        })()}
        {showFtp && clubPath !== null && faceToPath !== null && (() => {
          // Arc from the club-path direction to the implied face direction (path + face-to-path).
          const R = 60;
          const p0 = at(dir(clubPath, k), R), p1 = at(dir(clubPath + faceToPath, k), R);
          const sweep = faceToPath * k >= 0 ? 1 : 0;
          return (
            <path data-role="face-to-path" d={`M${p0.x} ${p0.y}A${R} ${R} 0 0 ${sweep} ${p1.x} ${p1.y}`}
              fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          );
        })()}
        {!none && <circle data-role="ball" cx={OX} cy={OY} r={9} fill={BALL} stroke={BALL_EDGE} strokeWidth={2} />}
      </svg>
      {none ? (
        <p style={{ margin: 0, color: MUTED }}>Club delivery not measured for this shot</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 16px' }}>
          <Row label="Club path" fieldKey="clubPath" value={clubPath} swatch={{ background: CLUB }} />
          {showFace && <Row label="Face to target" fieldKey="ftt" value={faceToTarget} swatch={{ background: INK }} />}
          {showFtp && <Row label="Face to path" fieldKey="ftp" value={faceToPath} />}
          <Row label="Launch direction" fieldKey="launchH" value={launchH} swatch={{ borderTop: `3px dotted ${BALL}`, boxSizing: 'border-box' }} />
        </ul>
      )}
    </div>
  );
}
