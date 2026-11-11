import { formatMeasurement, type Vec3 } from '@fsa/domain';
import { clubFrame, clubPhase, type ReplayScene } from '@fsa/analytics';
import { clubCamera, planeQuad } from './camera';
import { ReplayControls, useReplayClock } from './ReplayControls';
import { Banner, H, Panel, W, f1, groundGrid, makeProjector, noteStyle } from './SceneChrome';
import { BALL, BALL_EDGE, CLUB, DISPLAY_FONT, FONT, INK, MUTED, SURFACE } from './theme';

export interface ClubReplay3DProps {
  scene: ReplayScene;
  aoa: number | null;
  vPlane: number | null;
  show: { vPlane: boolean; aoa: boolean };
}

const PHASES = ['Downswing', 'Impact', 'Follow-through'];
const SHAFT_YD = 1.0;

export function ClubReplay3D({ scene, aoa, vPlane, show }: ClubReplay3DProps) {
  const clock = useReplayClock({ initial: 0.6 });
  const phase = clubPhase(clock.progress);
  const cam = clubCamera(scene, W);
  const { proj, pt, pathOf, lineEl } = makeProjector(cam);

  const arc = scene.clubArc;
  const head = clubFrame(scene, clock.progress);
  const headP = head ? proj(head) : null;
  const gripP = head ? proj([head[0], head[1], head[2] + SHAFT_YD]) : null;
  const origin: Vec3 = [0, 0, 0];
  const originP = proj(origin);

  const quad = show.vPlane && scene.plane ? planeQuad(scene).map(proj) : [];
  const quadOk = quad.length === 4 && quad.every((c) => c !== null);
  const arcSolid = arc ? arc.slice(0, scene.impactIndex + 1) : [];
  const arcDashed = arc ? arc.slice(scene.impactIndex) : [];
  const targetP = proj([0, 4, 0]);
  const text = { fontFamily: FONT, fontSize: 13 } as const;

  return (
    <Panel>
      <h2 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: 600 }}>Club replay</h2>
      <Banner title="Illustrative reconstruction" copy="The club trajectory is inferred from launch-monitor measurements at impact. It is not captured swing motion." />
      <svg role="img" aria-label="3D club replay: the target line, the swing plane, the club arc and the club head, reconstructed from impact measurements."
        viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} rx={8} fill={SURFACE} />
        {groundGrid(lineEl, -4, 4, -4, 4, 1)}
        <g data-role="target-line">
          {lineEl('target', [0, -4, 0], [0, 4, 0], { stroke: MUTED, strokeWidth: 1.5, strokeDasharray: '7 6' })}
          {targetP && <text x={f1(targetP.x + 8)} y={f1(targetP.y)} fill={MUTED} {...text}>Target line</text>}
        </g>

        {quadOk && (
          <g data-role="v-plane">
            <path d={`M${quad.map((c) => pt(c!)).join(' L')} Z`} fill={CLUB} fillOpacity={0.13} stroke={CLUB} strokeWidth={1.5} />
            {vPlane !== null && (
              <text x={f1(quad[3]!.x + 6)} y={f1(quad[3]!.y - 6)} fill={CLUB} fontWeight={600} {...text}>{`V-plane ${formatMeasurement('swingV', vPlane)}`}</text>
            )}
          </g>
        )}

        {arc && (
          <g data-role="club-arc">
            <path d={pathOf(arcSolid)} fill="none" stroke={CLUB} strokeWidth={3} strokeLinecap="round" />
            <path d={pathOf(arcDashed)} fill="none" stroke={CLUB} strokeWidth={2} strokeLinecap="round" strokeDasharray="5 7" />
          </g>
        )}

        {headP && (
          <g data-role="club-head">
            {gripP && <line x1={f1(headP.x)} y1={f1(headP.y)} x2={f1(gripP.x)} y2={f1(gripP.y)} stroke={INK} strokeWidth={3} strokeLinecap="round" />}
            <ellipse cx={f1(headP.x)} cy={f1(headP.y)} rx={13} ry={8} fill={INK} />
          </g>
        )}
        {originP && <circle data-role="ball" cx={f1(originP.x)} cy={f1(originP.y)} r={7} fill={BALL} stroke={BALL_EDGE} strokeWidth={2} />}

        {show.aoa && scene.plane && aoa !== null && originP && (
          <text data-role="aoa-label" x={f1(originP.x + 20)} y={f1(originP.y + 38)} fill={INK} fontWeight={600} {...text}>{`Attack angle ${formatMeasurement('aoa', aoa)}`}</text>
        )}
        <text x={16} y={28} fill={MUTED} {...text}>Club at impact</text>
        <text x={784} y={28} textAnchor="end" fill={MUTED} {...text}>{phase}</text>
      </svg>
      {!scene.plane && <p style={noteStyle}>Club delivery not measured for this shot</p>}
      <ReplayControls clock={clock} phases={PHASES} active={phase} />
    </Panel>
  );
}
