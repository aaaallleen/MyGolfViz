import { useEffect, useId, useState } from 'react';
import { formatMeasurement, type Vec3 } from '@fsa/domain';
import { spinAxisVector, spinComponents } from '@fsa/analytics';
import { Missing, ProvenanceTag } from '@fsa/ui';
import { BALL, BALL_EDGE, BORDER, DISPLAY_FONT, FONT, INK, MUTED, SOFT, SURFACE } from './theme';

export interface SpinBallDiagramProps {
  spin: number | null;
  spinAxis: number | null;
}

/** The rotation is drawn this many times slower than measured. */
export const SPIN_DISPLAY_SLOWDOWN = 50;

const C = 160, R = 110; // viewBox 320×320
const PSI = (30 * Math.PI) / 180; // yaw: viewed from behind the ball, turned 30°
const RIGHT: Vec3 = [Math.cos(PSI), -Math.sin(PSI), 0];
const UP: Vec3 = [0, 0, 1];
const DEPTH: Vec3 = [Math.sin(PSI), Math.cos(PSI), 0]; // positive = away from the viewer
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const proj = (p: Vec3) => ({ x: C + R * dot(p, RIGHT), y: C - R * dot(p, UP), depth: dot(p, DEPTH) });
const f1 = (n: number) => Number(n.toFixed(1));

/** Twelve points fixed on the ball surface (Fibonacci spiral). */
const MARKS: Vec3[] = Array.from({ length: 12 }, (_, i) => {
  const z = 1 - (2 * (i + 0.5)) / 12;
  const r = Math.sqrt(1 - z * z);
  const t = i * Math.PI * (3 - Math.sqrt(5));
  return [r * Math.cos(t), r * Math.sin(t), z];
});

/** Rodrigues rotation of p about unit axis a by phi. */
function rotate(p: Vec3, a: Vec3, phi: number): Vec3 {
  const c = Math.cos(phi), s = Math.sin(phi), d = dot(a, p) * (1 - c);
  const x = cross(a, p);
  return [p[0] * c + x[0] * s + a[0] * d, p[1] * c + x[1] * s + a[1] * d, p[2] * c + x[2] * s + a[2] * d];
}

function Row({ label, text, derived }: { label: string; text: string | null; derived?: boolean }) {
  if (text === null) return <li style={{ color: MUTED, fontSize: 14 }}>{label} · <Missing /></li>;
  return (
    <li style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 8px' }}>
      <span style={{ fontSize: 12, color: SOFT }}>{label}</span>{' '}
      <strong style={{ fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: 600 }}>{text}</strong>
      {derived && <ProvenanceTag kind="derived" />}
    </li>
  );
}

export function SpinBallDiagram({ spin, spinAxis }: SpinBallDiagramProps) {
  const gid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [playing, setPlaying] = useState(false);
  const [phi, setPhi] = useState(0);
  const canPlay = spin !== null && spinAxis !== null;

  useEffect(() => {
    if (!playing || spin === null || spinAxis === null) return;
    const revPerSec = spin / 60 / SPIN_DISPLAY_SLOWDOWN;
    let last: number | null = null;
    let id = 0;
    const step = (ts: number) => {
      if (last !== null) setPhi((p) => (p + 2 * Math.PI * revPerSec * ((ts - last!) / 1000)) % (2 * Math.PI));
      last = ts;
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [playing, spin, spinAxis]);

  if (spin === null && spinAxis === null) {
    return <div className="fsa-spin-ball"><p style={{ margin: 0, color: MUTED }}>Ball spin not measured for this shot</p></div>;
  }

  const axis: Vec3 | null = spinAxis === null ? null : spinAxisVector(spinAxis);
  const { backspin, sidespin } = spinComponents(spin, spinAxis);
  const marks = MARKS.map((m) => proj(axis ? rotate(m, axis, phi) : m));

  let ring: { front: string; back: string; arrows: string[]; ends: [ReturnType<typeof proj>, ReturnType<typeof proj>] } | null = null;
  if (axis) {
    // basis perpendicular to the axis: u = ŷ, w = a × u; p(t) = cos t·u + sin t·w, dp/dt = ω × p
    const u: Vec3 = [0, 1, 0];
    const w = cross(axis, u);
    const at = (t: number): Vec3 => [Math.cos(t) * u[0] + Math.sin(t) * w[0], Math.cos(t) * u[1] + Math.sin(t) * w[1], Math.cos(t) * u[2] + Math.sin(t) * w[2]];
    const N = 72;
    let front = '', back = '';
    let prevSide: boolean | null = null;
    for (let i = 0; i <= N; i++) {
      const pr = proj(at((i / N) * 2 * Math.PI));
      const isBack = pr.depth > 0;
      const pt = `${f1(pr.x)} ${f1(pr.y)}`;
      if (prevSide === isBack) {
        if (isBack) back += `L${pt}`; else front += `L${pt}`;
      } else {
        // start (or switch) a subpath; repeat the previous point so the halves meet
        const prev = i > 0 ? proj(at(((i - 1) / N) * 2 * Math.PI)) : pr;
        const pp = `${f1(prev.x)} ${f1(prev.y)}`;
        if (isBack) back += `M${pp}L${pt}`; else front += `M${pp}L${pt}`;
      }
      prevSide = isBack;
    }
    const arrows = [90, 210, 330].map((deg) => {
      const t = (deg * Math.PI) / 180;
      const p = proj(at(t));
      const v = [Math.cos(t) * w[0] - Math.sin(t) * u[0], Math.cos(t) * w[1] - Math.sin(t) * u[1], Math.cos(t) * w[2] - Math.sin(t) * u[2]] as Vec3;
      let dx = dot(v, RIGHT), dy = -dot(v, UP);
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const nx = -dy, ny = dx;
      return `${f1(p.x + dx * 8)},${f1(p.y + dy * 8)} ${f1(p.x - dx * 4 + nx * 5)},${f1(p.y - dy * 4 + ny * 5)} ${f1(p.x - dx * 4 - nx * 5)},${f1(p.y - dy * 4 - ny * 5)}`;
    });
    ring = { front, back, arrows, ends: [proj(axis.map((c) => c * 1.35) as Vec3), proj(axis.map((c) => -c * 1.35) as Vec3)] };
  }
  const [ea, eb] = ring ? (ring.ends[0].x >= ring.ends[1].x ? [ring.ends[0], ring.ends[1]] : [ring.ends[1], ring.ends[0]]) : [null, null];
  const axisText = formatMeasurement('spinAxis', spinAxis);
  const sideText = sidespin === null ? null : `${formatMeasurement('spin', Math.abs(sidespin))}${sidespin > 0.5 ? ' R' : sidespin < -0.5 ? ' L' : ''}`;

  return (
    // The drawing takes the panel's full width and any spare height (flex: 1), with the ball centred in it;
    // the sunken background is the SVG box itself, so it fills that whole area rather than a fixed square.
    <div className="fsa-spin-ball" style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 auto' }}>
      <svg role="img" aria-label={`Ball seen from behind with its spin axis. Total spin ${formatMeasurement('spin', spin)}, spin axis ${axisText}.`}
        viewBox="0 0 320 320" style={{ width: '100%', height: 'auto', minHeight: 240, flex: '1 1 auto', display: 'block', background: SURFACE, borderRadius: 8 }}>
        <defs>
          <radialGradient id={`${gid}-ball`} cx="36%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#FFD9A0" />
            <stop offset="45%" stopColor={BALL} />
            <stop offset="100%" stopColor="#7A4B12" />
          </radialGradient>
        </defs>
        <circle data-role="ball" cx={C} cy={C} r={R} fill={`url(#${gid}-ball)`} stroke={BALL_EDGE} strokeWidth={2} />
        {ring && (
          <g data-role="spin-ring" fill="none" stroke={INK} strokeWidth={2}>
            <path d={ring.back} strokeDasharray="4 5" strokeOpacity={0.6} />
            <path d={ring.front} />
          </g>
        )}
        {ring && ring.arrows.map((pts, i) => <polygon key={i} data-role="spin-arrow" points={pts} fill={INK} />)}
        <g fill={INK} stroke={BALL_EDGE} strokeWidth={1}>
          {marks.map((m, i) => (
            <circle key={i} data-role="surface-mark" cx={f1(m.x)} cy={f1(m.y)} r={5} fillOpacity={m.depth > 0 ? 0.2 : 0.95} strokeOpacity={m.depth > 0 ? 0.2 : 1} />
          ))}
        </g>
        {ea && eb && (
          <>
            <line data-role="spin-axis" x1={f1(eb.x)} y1={f1(eb.y)} x2={f1(ea.x)} y2={f1(ea.y)} stroke={INK} strokeWidth={2} strokeLinecap="round" />
            <text data-role="spin-axis-label" x={f1(Math.min(ea.x + 4, 316))} y={f1(ea.y + 16)} textAnchor="end" fill={INK} fontSize={13} fontWeight={600} fontFamily={FONT}>{axisText}</text>
          </>
        )}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px' }}>
        <button type="button" disabled={!canPlay} onClick={() => setPlaying((p) => !p)}
          style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, border: `1px solid ${BORDER}`, background: 'transparent', color: INK, font: 'inherit', fontWeight: 600, opacity: canPlay ? 1 : 0.5 }}>
          {playing ? 'Pause rotation' : 'Play rotation'}
        </button>
        {canPlay && <span style={{ fontSize: 13, color: MUTED }}>Rotation shown {SPIN_DISPLAY_SLOWDOWN}× slower than measured</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', fontSize: 13, color: MUTED }}>
        <span>Viewed from behind the ball · axis tilted right = ball curves right</span>
        <ProvenanceTag kind="illustrative" />
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Row label="Total spin" text={spin === null ? null : formatMeasurement('spin', spin)} />
        <Row label="Spin axis" text={spinAxis === null ? null : axisText} />
        {backspin !== null && sideText !== null && (
          <>
            <Row label="Backspin ≈" text={formatMeasurement('spin', backspin)} derived />
            <Row label="Sidespin ≈" text={sideText} derived />
          </>
        )}
      </ul>
    </div>
  );
}
