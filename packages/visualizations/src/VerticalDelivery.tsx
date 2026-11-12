import { formatMeasurement } from '@fsa/domain';
import { Missing, ProvenanceTag } from '@fsa/ui';
import { BALL, BALL_EDGE, BORDER, CLUB, DISPLAY_FONT, FACE_FILL, FONT, INK, MUTED, SOFT, SURFACE } from './theme';

export interface VerticalDeliveryProps {
  aoa: number | null;
  dynamicLoft: number | null;
  launchV: number | null;
  spinLoft: number | null;
  exaggerate: 1 | 2;
  /** Inches from the ball: negative = behind, positive = ahead (target side). Omit to leave the row out. */
  lowPoint?: number | null;
  /** Which 2D layers to draw; default true. */
  layers?: { dynamicLoft?: boolean };
  /** Heading text; defaults to "Impact geometry · side view". */
  title?: string;
}

const BX = 300, BY = 330, GROUND = 346; // ball centre and ground line
const PX_PER_IN = 30;
const MAX_DRAWN = 80;
const f1 = (n: number) => Number(n.toFixed(1));

const dir = (deg: number, k: number) => {
  const a = (Math.max(-MAX_DRAWN, Math.min(MAX_DRAWN, deg * k)) * Math.PI) / 180;
  return { x: Math.cos(a), y: -Math.sin(a) };
};
const at = (d: { x: number; y: number }, t: number) => ({ x: f1(BX + d.x * t), y: f1(BY + d.y * t) });

function Row({ label, text, swatch }: { label: string; text: string | null; swatch?: React.CSSProperties }) {
  if (text === null) return <li style={{ color: MUTED, fontSize: 14 }}>{label} · <Missing /></li>;
  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: SOFT }}>
        {swatch && <span aria-hidden="true" style={{ width: 14, height: 3, ...swatch }} />}
        {label}
      </span>{' '}
      <strong style={{ fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: 600 }}>{text}</strong>
    </li>
  );
}

const fmt = (key: 'aoa' | 'dynamicLoft' | 'launchV' | 'spinLoft' | 'lowPoint', v: number | null) =>
  v === null ? null : formatMeasurement(key, v);

/** Side view at impact: attack angle, dynamic loft and launch angle; optional club arc and low point. */
export function VerticalDeliveryDiagram({ aoa, dynamicLoft, launchV, spinLoft, exaggerate, lowPoint, layers, title }: VerticalDeliveryProps) {
  const showLoft = layers?.dynamicLoft ?? true;
  const k = exaggerate;
  const none = aoa === null && dynamicLoft === null && launchV === null && spinLoft === null && (lowPoint ?? null) === null;
  const attack = aoa === null ? null : dir(aoa, k);
  const loft = !showLoft || dynamicLoft === null ? null : dir(dynamicLoft, k);
  const launch = launchV === null ? null : dir(launchV, k);
  const lpx = lowPoint == null ? null : Math.max(60, Math.min(850, BX + lowPoint * PX_PER_IN));
  const arc: string[] = [];
  if (lpx !== null) {
    for (let x = Math.max(30, lpx - 280); x <= Math.min(870, lpx + 280); x += 20) {
      arc.push(`${f1(x)} ${f1(GROUND - 4 - 0.0016 * (x - lpx) ** 2)}`);
    }
  }
  const aria = none
    ? 'Side view at impact. Club delivery not measured for this shot.'
    : `Side view at impact: attack angle ${fmt('aoa', aoa) ?? 'not measured'}, dynamic loft ${fmt('dynamicLoft', dynamicLoft) ?? 'not measured'}, launch angle ${fmt('launchV', launchV) ?? 'not measured'}.`;
  const label = { fontSize: 15, fontWeight: 600, fontFamily: FONT } as const;

  return (
    <div className="fsa-vertical-delivery" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: 600 }}>{title ?? 'Impact geometry · side view'}</h3>
        {k !== 1 && <span style={{ fontSize: 12, color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 8px' }}>Angles ×{k}</span>}
      </div>
      <svg role="img" aria-label={aria} viewBox="0 0 900 420" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={900} height={420} rx={8} fill={SURFACE} />
        <line data-role="ground" x1={30} y1={GROUND} x2={870} y2={GROUND} stroke={MUTED} strokeWidth={1.5} />
        <text x={820} y={366} fill={MUTED} fontSize={13} fontFamily={FONT}>Ground</text>
        <line x1={BX} y1={BY} x2={790} y2={BY} stroke={BORDER} strokeWidth={1.5} strokeDasharray="5 6" />
        <text x={798} y={BY + 4} fill={MUTED} fontSize={13} fontFamily={FONT}>Level</text>
        {lpx !== null && (
          <>
            <polyline data-role="club-arc" points={arc.join(' ')} fill="none" stroke={CLUB} strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 5" />
            <line data-role="low-point" x1={lpx} y1={GROUND - 12} x2={lpx} y2={GROUND + 6} stroke={CLUB} strokeWidth={2} />
            <text x={lpx} y={GROUND + 24} textAnchor="middle" fill={CLUB} fontSize={13} fontFamily={FONT}>Low point</text>
          </>
        )}
        {attack && (() => {
          const a = at(attack, -160), b = at(attack, -26), c = at(attack, 26), d = at(attack, 400);
          return (
            <>
              <line data-role="attack" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={CLUB} strokeWidth={4} strokeLinecap="round" />
              <line x1={c.x} y1={c.y} x2={d.x} y2={d.y} stroke={CLUB} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="7 7" />
              <text x={d.x + 8} y={d.y - 4} fill={CLUB} {...label}>Attack angle {fmt('aoa', aoa)}</text>
            </>
          );
        })()}
        {loft && (() => {
          const b = at(loft, 250);
          return (
            <>
              <line data-role="loft" x1={BX} y1={BY} x2={b.x} y2={b.y} stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
              <text x={b.x - 4} y={b.y - 12} textAnchor="end" fill={INK} {...label}>Dynamic loft {fmt('dynamicLoft', dynamicLoft)}</text>
            </>
          );
        })()}
        {launch && (() => {
          const b = at(launch, 380);
          return (
            <>
              <line data-role="launch" x1={BX} y1={BY} x2={b.x} y2={b.y} stroke={BALL} strokeWidth={4} strokeLinecap="round" strokeDasharray="2 9" />
              <text x={b.x + 10} y={b.y - 2} fill={BALL} {...label}>Launch angle {fmt('launchV', launchV)}</text>
            </>
          );
        })()}
        {!none && (
          <>
            <g data-role="club-head">
              <line x1={236} y1={298} x2={214} y2={110} stroke={INK} strokeWidth={4} strokeLinecap="round" />
              <path d="M264.2 299.8 C210 290 170 315 172 338 C174 348 230 350 290.1 344.9 Z" fill={FACE_FILL} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
              <line x1={264.2} y1={299.8} x2={290.1} y2={344.9} stroke={INK} strokeWidth={5} strokeLinecap="round" />
            </g>
            <circle data-role="ball" cx={BX} cy={BY} r={16} fill={BALL} stroke={BALL_EDGE} strokeWidth={2} />
          </>
        )}
      </svg>
      {none ? (
        <p style={{ margin: 0, color: MUTED }}>Club delivery not measured for this shot</p>
      ) : (
        <>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 16px' }}>
            <Row label="Attack angle" text={fmt('aoa', aoa)} swatch={{ background: CLUB }} />
            {showLoft && <Row label="Dynamic loft" text={fmt('dynamicLoft', dynamicLoft)} swatch={{ background: INK }} />}
            <Row label="Launch angle" text={fmt('launchV', launchV)} swatch={{ borderTop: `3px dotted ${BALL}`, boxSizing: 'border-box' }} />
            <Row label={spinLoft === null ? "Spin loft" : "Spin loft · as reported"} text={fmt("spinLoft", spinLoft)} />
            {lowPoint !== undefined && <Row label="Low point" text={fmt('lowPoint', lowPoint)} swatch={{ background: CLUB }} />}
          </ul>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', fontSize: 13, color: MUTED }}>
            <ProvenanceTag kind="illustrative" />
            <span>Club head is a generic profile, drawn for orientation only</span>
          </div>
        </>
      )}
    </div>
  );
}
