import { useEffect, useRef, useState } from 'react';
import { formatMeasurement, type Vec3 } from '@fsa/domain';
import { replayFrame, replayPhase, type ReplayScene } from '@fsa/analytics';
import { ProvenanceTag, SegmentedControl } from '@fsa/ui';
import { cameraFor, projectPoint, type CameraPreset } from './camera';
import { BALL, BALL_EDGE, BORDER, CLUB, DISPLAY_FONT, FONT, GRID, INK, MUTED, SOFT, SURFACE } from './theme';

export interface ShotReplay3DProps {
  scene: ReplayScene;
  aoa: number | null;
  vPlane: number | null;
}

const W = 800, H = 480;
const PASS_MS = 4000;
const STEP = 0.02;
const CAMERAS: { value: CameraPreset; label: string }[] = [
  { value: 'dtl', label: 'DTL' }, { value: 'perspective', label: 'Perspective' },
  { value: 'side', label: 'Side' }, { value: 'top', label: 'Top' },
];
const PHASES = ['Downswing', 'Impact', 'Ball flight', 'Landing'] as const;
const SPEEDS = [0.25, 0.5, 1] as const;
const f1 = (n: number) => Number(n.toFixed(1));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type Pt = { x: number; y: number };
type Show = { vPlane: boolean; arc: boolean; aoa: boolean; face: boolean; flight: boolean };

export function ShotReplay3D({ scene, aoa, vPlane }: ShotReplay3DProps) {
  const [preset, setPreset] = useState<CameraPreset>('perspective');
  const [progress, setProgress] = useState(0.3);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(0.5);
  const [loop, setLoop] = useState(true);
  const [show, setShow] = useState<Show>({ vPlane: true, arc: true, aoa: true, face: false, flight: true });
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | null = null;
    const step = (ts: number) => {
      const dt = last === null ? 0 : ts - last;
      last = ts;
      const next = progressRef.current + (dt * speed) / PASS_MS;
      if (next >= 1) {
        if (loop) { progressRef.current = next - 1; setProgress(next - 1); }
        else { progressRef.current = 1; setProgress(1); setPlaying(false); return; }
      } else { progressRef.current = next; setProgress(next); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, loop]);

  const cam = cameraFor(preset, scene, W);
  const proj = (p: Vec3): Pt | null => {
    const r = projectPoint(p, cam, { width: W, height: H });
    return r && Number.isFinite(r.x) && Number.isFinite(r.y) ? { x: r.x, y: r.y } : null;
  };
  const pt = (p: Pt) => `${f1(p.x)} ${f1(p.y)}`;
  /** Polyline path; segments with an endpoint behind the camera are skipped. */
  const pathOf = (pts: Vec3[]): string => {
    let d = '';
    let prev: Pt | null = null;
    for (const p of pts) {
      const q = proj(p);
      if (q && prev) d += ` L${pt(q)}`;
      else if (q) d += ` M${pt(q)}`;
      prev = q;
    }
    return d.trim();
  };
  const lineEl = (key: string, a: Vec3, b: Vec3, props: Record<string, string | number>) => {
    const p = proj(a), q = proj(b);
    if (!p || !q) return null;
    return <line key={key} x1={f1(p.x)} y1={f1(p.y)} x2={f1(q.x)} y2={f1(q.y)} {...props} />;
  };

  const flightEnd = scene.landing ? scene.landing[1] : 60;
  const yMax = Math.max(40, Math.ceil((flightEnd + 10) / 10) * 10);
  const grid: React.ReactNode[] = [];
  for (let x = -30; x <= 30; x += 10) grid.push(lineEl(`gx${x}`, [x, 0, 0], [x, yMax, 0], {}));
  for (let y = 0; y <= yMax; y += 10) grid.push(lineEl(`gy${y}`, [-30, y, 0], [30, y, 0], {}));

  const frame = replayFrame(scene, progress);
  const phase = replayPhase(progress);
  const arc = scene.clubArc;
  const ballP = proj(frame.ball);
  const headP = frame.clubHead ? proj(frame.clubHead) : null;
  const origin: Vec3 = [0, 0, 0];

  // Plane quad spanning the arc's extent in (u, w) coordinates.
  let planeD: string | null = null;
  let planeLabel: Pt | null = null;
  if (scene.plane && arc) {
    const { u, w } = scene.plane;
    const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const us = arc.map((p) => dot(p, u)), ws = arc.map((p) => dot(p, w));
    const pad = 0.15;
    const [u0, u1] = [Math.min(...us), Math.max(...us)], [w0, w1] = [Math.min(...ws), Math.max(...ws)];
    const du = (u1 - u0) * pad, dw = (w1 - w0) * pad;
    const corner = (a: number, b: number): Vec3 => [0, 1, 2].map((k) => a * u[k]! + b * w[k]!) as Vec3;
    const cs = [corner(u0 - du, w0 - dw), corner(u1 + du, w0 - dw), corner(u1 + du, w1 + dw), corner(u0 - du, w1 + dw)].map(proj);
    if (cs.every((c): c is Pt => c !== null)) {
      planeD = `M${cs.map(pt).join(' L')} Z`;
      planeLabel = cs[3]!;
    }
  }

  const arcSolid = arc ? arc.slice(0, scene.impactIndex + 1) : [];
  const arcDashed = arc ? arc.slice(scene.impactIndex) : [];
  const ghosts = arc ? [6, 13, 20].map((i) => proj(arc[i]!)) : [];
  const shaftLen = arc ? 0.8 * Math.hypot(arc[0]![0] - arc[arc.length - 1]![0], arc[0]![1] - arc[arc.length - 1]![1], arc[0]![2] - arc[arc.length - 1]![2]) / 2 : 0;
  const gripP = frame.clubHead ? proj([frame.clubHead[0], frame.clubHead[1], frame.clubHead[2] + shaftLen]) : null;
  const faceEl = scene.faceDirection
    ? lineEl('face', origin, [scene.faceDirection[0] * 8, scene.faceDirection[1] * 8, 0], { stroke: INK, strokeWidth: 2, strokeLinecap: 'round' })
    : null;
  const flightD = scene.ballFlight ? pathOf(scene.ballFlight) : '';
  const targetEl = lineEl('target', [0, -2, 0], [0, yMax, 0], { stroke: MUTED, strokeWidth: 1.5, strokeDasharray: '7 6' });
  const targetLabelP = proj([0, yMax * 0.45, 0]);
  const cameraLabel = CAMERAS.find((c) => c.value === preset)!.label;

  const toggle = (k: keyof Show) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const setP = (v: number) => { const c = clamp01(v); progressRef.current = c; setProgress(c); };
  const sliderValue = Math.round(progress * 100);

  const btn = { border: `1px solid ${BORDER}`, background: 'transparent', color: INK, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;
  const checkLabel = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: SOFT } as const;

  return (
    <div style={{ background: '#151C19', border: '1px solid #26312C', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: 600 }}>Shot replay</h2>
        <SegmentedControl<CameraPreset> label="Camera angle" options={CAMERAS} value={preset} onChange={setPreset} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 10, border: `2px dashed ${MUTED}`, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: INK, color: BALL_EDGE, whiteSpace: 'nowrap' }}>Illustrative reconstruction</span>
        <span style={{ color: SOFT, lineHeight: 1.45, flex: '1 1 240px' }}>
          The club trajectory is inferred from launch-monitor measurements at impact. It is not captured swing motion.
        </span>
        <ProvenanceTag kind="illustrative" />
      </div>

      <svg role="img" aria-label={`${cameraLabel} 3D replay: the target line, the swing plane, the club arc, the club and the ball flight, reconstructed from impact measurements.`}
        viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} rx={8} fill={SURFACE} />
        <g stroke={GRID} strokeWidth={1}>{grid}</g>
        <g data-role="target-line">
          {targetEl}
          {targetLabelP && <text x={f1(targetLabelP.x + 8)} y={f1(targetLabelP.y)} fill={MUTED} fontSize={13} fontFamily={FONT}>Target line</text>}
        </g>

        {show.vPlane && planeD && (
          <g data-role="v-plane">
            <path d={planeD} fill={CLUB} fillOpacity={0.13} stroke={CLUB} strokeWidth={1.5} />
            {vPlane !== null && planeLabel && (
              <text x={f1(planeLabel.x + 6)} y={f1(planeLabel.y - 6)} fill={CLUB} fontSize={13} fontWeight={600} fontFamily={FONT}>{`V-plane ${formatMeasurement('swingV', vPlane)}`}</text>
            )}
          </g>
        )}

        {show.arc && arc && (
          <g data-role="club-arc">
            <path d={pathOf(arcSolid)} fill="none" stroke={CLUB} strokeWidth={3} strokeLinecap="round" />
            <path d={pathOf(arcDashed)} fill="none" stroke={CLUB} strokeWidth={2} strokeLinecap="round" strokeDasharray="5 7" />
            {phase === 'Downswing' && ghosts.map((g, i) => g && (
              <circle key={i} cx={f1(g.x)} cy={f1(g.y)} r={7} fill={INK} fillOpacity={0.2 + 0.15 * i} />
            ))}
          </g>
        )}

        {show.face && faceEl && <g data-role="face-direction">{faceEl}</g>}

        {show.flight && flightD && (
          <path data-role="ball-flight" d={flightD} fill="none" stroke={BALL} strokeWidth={3} strokeLinecap="round" strokeDasharray="2 8" />
        )}

        {headP && (
          <g data-role="club-head">
            {gripP && <line x1={f1(headP.x)} y1={f1(headP.y)} x2={f1(gripP.x)} y2={f1(gripP.y)} stroke={INK} strokeWidth={3} strokeLinecap="round" />}
            <ellipse cx={f1(headP.x)} cy={f1(headP.y)} rx={13} ry={8} fill={INK} />
          </g>
        )}

        {ballP && <circle data-role="ball" cx={f1(ballP.x)} cy={f1(ballP.y)} r={7} fill={BALL} stroke={BALL_EDGE} strokeWidth={2} />}

        {show.aoa && scene.plane && aoa !== null && (() => {
          const o = proj(origin);
          return o && (
            <text data-role="aoa-label" x={f1(o.x + 20)} y={f1(o.y + 38)} fill={INK} fontSize={13} fontWeight={600} fontFamily={FONT}>{`Attack angle ${formatMeasurement('aoa', aoa)}`}</text>
          );
        })()}

        <text x={16} y={28} fill={MUTED} fontSize={13} fontFamily={FONT}>{`${cameraLabel} camera`}</text>
        <text x={784} y={28} textAnchor="end" fill={MUTED} fontSize={13} fontFamily={FONT}>{phase}</text>
      </svg>

      {!scene.plane && <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>Club delivery not measured for this shot — showing ball flight only</p>}
      {!scene.ballFlight && <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>Ball flight not measured for this shot</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px' }}>
        <button type="button" aria-label="Step back one frame" onClick={() => setP(progress - STEP)} style={{ ...btn, width: 44, height: 44 }}>
          <svg aria-hidden="true" width={16} height={16} viewBox="0 0 16 16" fill={INK}><path d="M12 3v10L5 8z" /><rect x={3} y={3} width={2} height={10} /></svg>
        </button>
        <button type="button" aria-label={playing ? 'Pause replay' : 'Play replay'}
          onClick={() => { if (!playing && progress >= 1) setP(0); setPlaying((p) => !p); }}
          style={{ ...btn, width: 52, height: 52, borderRadius: 26, border: 0, background: INK }}>
          <svg aria-hidden="true" width={18} height={18} viewBox="0 0 18 18" fill={BALL_EDGE}>
            {playing ? <path d="M4 3h3.5v12H4zM10.5 3H14v12h-3.5z" /> : <path d="M5 2.5v13l11-6.5z" />}
          </svg>
        </button>
        <button type="button" aria-label="Step forward one frame" onClick={() => setP(progress + STEP)} style={{ ...btn, width: 44, height: 44 }}>
          <svg aria-hidden="true" width={16} height={16} viewBox="0 0 16 16" fill={INK}><path d="M4 3v10l7-5z" /><rect x={11} y={3} width={2} height={10} /></svg>
        </button>
        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input type="range" min={0} max={100} value={sliderValue} aria-label="Replay position"
            onChange={(e) => setP(Number(e.target.value) / 100)}
            style={{ width: '100%', height: 24, accentColor: INK, margin: 0 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED }}>
            {PHASES.map((p) => <span key={p} style={p === phase ? { color: INK, fontWeight: 600 } : undefined}>{p}</span>)}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: MUTED, fontSize: 13 }}>Speed
          <select value={String(speed)} onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ minHeight: 44, padding: '0 10px', borderRadius: 8, border: `1px solid ${BORDER}`, background: SURFACE, color: INK, font: 'inherit' }}>
            {SPEEDS.map((s) => <option key={s} value={String(s)}>{`${s}×`}</option>)}
          </select>
        </label>
        <label style={checkLabel}>
          <input type="checkbox" checked={loop} onChange={() => setLoop((l) => !l)} style={{ width: 16, height: 16, accentColor: INK }} />Loop
        </label>
      </div>

      <fieldset style={{ margin: 0, padding: '12px 0 0', border: 0, borderTop: '1px solid #26312C', display: 'flex', flexWrap: 'wrap', gap: '6px 20px', minWidth: 0 }}>
        <legend style={{ float: 'left', padding: '0 12px 0 0', fontSize: 13, color: MUTED, lineHeight: '44px' }}>Show</legend>
        {([['vPlane', 'V-plane', CLUB], ['arc', 'Club arc', CLUB], ['aoa', 'Angle of attack', CLUB], ['face', 'Face direction', CLUB], ['flight', 'Ball flight', BALL]] as const).map(([k, label, c]) => (
          <label key={k} style={checkLabel}>
            <input type="checkbox" checked={show[k]} onChange={() => toggle(k)} style={{ width: 16, height: 16, accentColor: c }} />{label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
