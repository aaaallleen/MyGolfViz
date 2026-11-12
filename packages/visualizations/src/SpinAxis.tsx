import { formatMeasurement } from '@fsa/domain';
import { BALL, BALL_EDGE, BORDER, DISPLAY_FONT, INK, MUTED, SOFT, SURFACE } from './theme';

export interface SpinAxisDiagramProps {
  spinAxis: number | null;
}

const CX = 160, CY = 110, R = 62, HALF = 100;
const f1 = (n: number) => Number(n.toFixed(1));

/** Flat view from behind the ball: spin axis against a level reference. Positive (right) tilts the right end down, as in SpinBallDiagram. */
export function SpinAxisDiagram({ spinAxis }: SpinAxisDiagramProps) {
  const text = spinAxis === null ? null : formatMeasurement('spinAxis', spinAxis);
  const a = spinAxis === null ? 0 : (spinAxis * Math.PI) / 180;
  const dx = Math.cos(a) * HALF, dy = Math.sin(a) * HALF; // screen y grows downward
  return (
    <div className="fsa-spin-axis" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <svg role="img" aria-label={`Spin axis seen from behind the ball: ${text ?? 'not measured'}.`}
        viewBox="0 0 320 220" style={{ width: '100%', maxWidth: 360, height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={320} height={220} rx={8} fill={SURFACE} />
        <circle data-role="ball" cx={CX} cy={CY} r={R} fill={BALL} fillOpacity={0.18} stroke={BALL} strokeWidth={2} />
        <line data-role="reference" x1={CX - HALF} y1={CY} x2={CX + HALF} y2={CY} stroke={MUTED} strokeWidth={1.5} strokeDasharray="5 5" />
        {spinAxis !== null && (
          <>
            <line data-role="spin-axis" x1={f1(CX - dx)} y1={f1(CY - dy)} x2={f1(CX + dx)} y2={f1(CY + dy)}
              stroke={INK} strokeWidth={3} strokeLinecap="round" />
            <circle cx={f1(CX + dx)} cy={f1(CY + dy)} r={4} fill={INK} stroke={BALL_EDGE} />
          </>
        )}
      </svg>
      {text === null ? (
        <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>Spin axis · Not measured</p>
      ) : (
        <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12, color: SOFT }}>Spin axis</span>
          <strong style={{ fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: 600 }}>{text}</strong>
        </p>
      )}
      <span style={{ fontSize: 13, color: MUTED, borderTop: `1px solid ${BORDER}`, paddingTop: 6 }}>
        Viewed from behind the ball · axis tilted right = ball curves right
      </span>
    </div>
  );
}
