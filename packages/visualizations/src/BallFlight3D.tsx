import { useMemo, useState } from 'react';
import { flightFrame, flightPhase, type ReplayScene } from '@fsa/analytics';
import { SegmentedControl } from '@fsa/ui';
import { flightCamera, type CameraPreset } from './camera';
import { ReplayControls, useReplayClock } from './ReplayControls';
import { Banner, H, Panel, W, f1, groundGrid, makeProjector, noteStyle } from './SceneChrome';
import { BALL, BALL_EDGE, DISPLAY_FONT, FONT, INK, MUTED, SOFT, SURFACE } from './theme';

export interface BallFlight3DProps { selected: ReplayScene; others: ReplayScene[] }

const CAMERAS: { value: CameraPreset; label: string }[] = [
  { value: 'dtl', label: 'DTL' }, { value: 'perspective', label: 'Perspective' },
  { value: 'side', label: 'Side' }, { value: 'top', label: 'Top' },
];
const PHASES = ['Launch', 'Ball flight', 'Landing'];

export function BallFlight3D({ selected, others }: BallFlight3DProps) {
  const [preset, setPreset] = useState<CameraPreset>('perspective');
  const [showOthers, setShowOthers] = useState(true);
  const clock = useReplayClock({ initial: 0 });
  const phase = flightPhase(clock.progress);

  // Everything in `geom` depends only on camera/selection inputs, never on replay progress,
  // so the per-frame clock re-render reuses it and recomputes just the ball position.
  const geom = useMemo(() => {
    const otherScenes = showOthers ? others.filter((s) => s.ballFlight) : [];
    const flights = [...otherScenes.map((s) => s.ballFlight!), ...(selected.ballFlight ? [selected.ballFlight] : [])];
    const cam = flightCamera(preset, flights, selected.handedness, W);
    const { proj, pathOf, lineEl } = makeProjector(cam);
    const landings = [...otherScenes, ...(selected.ballFlight ? [selected] : [])].map((s) => s.landing!);
    const yMax = Math.max(40, Math.ceil((Math.max(0, ...landings.map((l) => l[1])) + 10) / 10) * 10);
    const xMax = Math.max(30, Math.ceil((Math.max(0, ...landings.map((l) => Math.abs(l[0]))) + 10) / 10) * 10);
    const targetP = proj([0, yMax * 0.45, 0]);
    const label = CAMERAS.find((c) => c.value === preset)!.label;
    const text = { fontFamily: FONT, fontSize: 13 } as const;
    const scene = (
      <>
        {groundGrid(lineEl, -xMax, xMax, 0, yMax, 10)}
        <g data-role="target-line">
          {lineEl('target', [0, -2, 0], [0, yMax, 0], { stroke: MUTED, strokeWidth: 1.5, strokeDasharray: '7 6' })}
          {targetP && <text x={f1(targetP.x + 8)} y={f1(targetP.y)} fill={MUTED} {...text}>Target line</text>}
        </g>
        {otherScenes.map((s) => (
          <path key={s.shotId} data-role="other-flight" d={pathOf(s.ballFlight!)} fill="none" stroke={MUTED} strokeWidth={2} strokeLinecap="round" opacity={0.3} />
        ))}
        {landings.map((l, i) => {
          const p = proj(l);
          const isSel = selected.ballFlight !== null && i === landings.length - 1;
          return p && <circle key={i} data-role="landing" cx={f1(p.x)} cy={f1(p.y)} r={isSel ? 6 : 4} fill="none" stroke={isSel ? BALL : MUTED} strokeWidth={2} opacity={isSel ? 1 : 0.3} />;
        })}
        {selected.ballFlight && (
          <>
            {/* A dark halo keeps the selected flight readable where it crosses other shots. */}
            <path data-role="ball-flight-halo" d={pathOf(selected.ballFlight)} fill="none" stroke={SURFACE} strokeWidth={8} strokeLinecap="round" />
            <path data-role="ball-flight" d={pathOf(selected.ballFlight)} fill="none" stroke={BALL} strokeWidth={3.5} strokeLinecap="round" />
          </>
        )}
      </>
    );
    return { proj, scene, label, text };
  }, [preset, showOthers, selected, others]);
  const { proj, scene, label, text } = geom;
  const ball = selected.ballFlight ? proj(flightFrame(selected, clock.progress)) : null;

  return (
    <Panel>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: 600 }}>Ball flight</h2>
        <SegmentedControl<CameraPreset> label="Camera angle" options={CAMERAS} value={preset} onChange={setPreset} />
      </div>
      <Banner title="Illustrative flight path" copy="Drawn from launch angle, apex height, descent angle, carry and lateral landing. It is not a measured flight track." />
      <svg role="img" aria-label={`${label} 3D ball flight: the target line, the flight path and the landing point.`}
        viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} rx={8} fill={SURFACE} />
        {scene}
        {ball && <circle data-role="ball" cx={f1(ball.x)} cy={f1(ball.y)} r={7} fill={BALL} stroke={BALL_EDGE} strokeWidth={2} />}
        <text x={16} y={28} fill={MUTED} {...text}>{`${label} camera`}</text>
        <text x={784} y={28} textAnchor="end" fill={MUTED} {...text}>{phase}</text>
      </svg>
      {!selected.ballFlight && <p style={noteStyle}>Ball flight not measured for this shot</p>}
      <ReplayControls clock={clock} phases={PHASES} active={phase} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: SOFT }}>
        <input type="checkbox" checked={showOthers} onChange={() => setShowOthers((v) => !v)} style={{ width: 16, height: 16, accentColor: INK }} />Show other shots
      </label>
    </Panel>
  );
}
