import { formatMeasurement, type ClubCategory, type Handedness } from '@fsa/domain';
import { HEAD_SPECS, type HeadSpec } from './heads/specs';
import { bodySilhouette, faceOutline, scoreLines, type Pt } from './heads/shape';
import { BALL, BALL_EDGE, BORDER, CLUB, FACE_FILL, FONT, INK, MUTED, SURFACE } from './theme';

export interface FaceImpactDiagramProps {
  category: ClubCategory;
  handedness: Handedness;
  selected: { x: number; y: number } | null;
  others: { x: number; y: number }[];
  showOthers: boolean;
}

const PX_PER_IN = 40;
const GRID_IN = 0.5;
const W = 400, H = 280, CX = W / 2, CY = H / 2;
interface HeadDrawing { spec: HeadSpec; face: Pt[]; lines: { z: number; x1: number; x2: number }[]; body: Pt[] | null }
const DRAWINGS = new Map<ClubCategory, HeadDrawing>();
/** Shape data per category, built once: bodySilhouette rebuilds a mesh on every call. */
function drawingFor(category: ClubCategory): HeadDrawing {
  let d = DRAWINGS.get(category);
  if (!d) {
    const spec = HEAD_SPECS[category];
    d = { spec, face: faceOutline(spec), lines: scoreLines(spec), body: bodySilhouette(spec) };
    DRAWINGS.set(category, d);
  }
  return d;
}
const loop = (pts: Pt[], at: (p: Pt) => string) => `${pts.map((p, i) => `${i ? 'L' : 'M'}${at(p)}`).join(' ')} Z`;

const CATEGORY_NAME: Record<ClubCategory, string> = { driver: 'Driver', wood: 'Wood', hybrid: 'Hybrid', iron: 'Iron' };

/** Face-on view. Right-handed: toe on the viewer's left, so +lateral (toe) plots left. Left-handed mirrors. */
export function FaceImpactDiagram({ category, handedness, selected, others, showOthers }: FaceImpactDiagramProps) {
  const { spec, face, lines, body } = drawingFor(category);
  const side = handedness === 'right' ? 1 : -1; // +1: toe on the left
  const px = (x: number) => CX - side * x * PX_PER_IN;
  const py = (y: number) => CY - y * PX_PER_IN;
  const at = ([x, z]: Pt) => `${px(x).toFixed(2)} ${py(z).toFixed(2)}`;
  const hoselEnd: Pt = [
    spec.hosel.base[0] - spec.hosel.lengthIn * Math.cos((spec.lieDeg * Math.PI) / 180),
    spec.hosel.base[2] + spec.hosel.lengthIn * Math.sin((spec.lieDeg * Math.PI) / 180),
  ];
  const step = GRID_IN * PX_PER_IN;
  const vLines = Array.from({ length: Math.floor(W / 2 / step) * 2 + 1 }, (_, i) => CX + (i - Math.floor(W / 2 / step)) * step);
  const hLines = Array.from({ length: Math.floor(H / 2 / step) * 2 + 1 }, (_, i) => CY + (i - Math.floor(H / 2 / step)) * step);
  const toeX = side === 1 ? 14 : W - 14;
  const heelX = side === 1 ? W - 14 : 14;
  const anchor = (x: number) => (x < CX ? 'start' : 'end');
  const aria =
    `${CATEGORY_NAME[category]} face seen face-on, ${handedness}-handed.` +
    (selected
      ? ` This shot struck ${formatMeasurement('impactLateral', selected.x)} and ${formatMeasurement('impactVertical', selected.y)}.`
      : ' No impact location measured for this shot.') +
    (showOthers && others.length ? ` Fainter dots show ${others.length} other shots.` : '');

  return (
    <div className="fsa-face-impact">
      <svg role="img" aria-label={aria} data-category={category} viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} rx={8} fill={SURFACE} />
        {body && <path data-role="body-silhouette" d={loop(body, at)} fill={spec.finish.body} fillOpacity={0.9} />}
        <line data-role="hosel" x1={px(spec.hosel.base[0])} y1={py(spec.hosel.base[2])} x2={px(hoselEnd[0])} y2={py(hoselEnd[1])}
          stroke={spec.finish.hosel} strokeWidth={2 * spec.hosel.radiusIn * PX_PER_IN} strokeLinecap="round" />
        <path d={loop(face, at)} fill={FACE_FILL} />
        <path data-role="face-outline" d={loop(face, at)} fill={spec.finish.face} fillOpacity={0.35} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        <g stroke={BORDER} strokeWidth={1}>
          {lines.map((l, i) => <line key={i} data-role="score-line" x1={px(l.x1)} x2={px(l.x2)} y1={py(l.z)} y2={py(l.z)} />)}
        </g>
        <g stroke={BORDER} strokeWidth={1} strokeOpacity={0.6}>
          {vLines.map((x) => <line key={`v${x}`} x1={x} x2={x} y1={0} y2={H} />)}
          {hLines.map((y) => <line key={`h${y}`} x1={0} x2={W} y1={y} y2={y} />)}
        </g>
        <line data-role="face-center" x1={CX} y1={0} x2={CX} y2={H} stroke={MUTED} strokeWidth={1.5} strokeDasharray="6 6" />
        <line data-role="face-center-h" x1={0} y1={CY} x2={W} y2={CY} stroke={MUTED} strokeWidth={1.5} strokeDasharray="6 6" />
        {showOthers && (
          <g fill={CLUB} fillOpacity={0.45}>
            {others.map((p, i) => <circle key={i} data-role="other-impact" cx={px(p.x)} cy={py(p.y)} r={5} />)}
          </g>
        )}
        {selected && (
          <circle data-role="selected-impact" cx={px(selected.x)} cy={py(selected.y)} r={7} fill={BALL} stroke={BALL_EDGE} strokeWidth={2} />
        )}
        <g fill={MUTED} fontSize={12} fontFamily={FONT}>
          <text data-role="toe-label" x={toeX} y={H - 12} textAnchor={anchor(toeX)}>Toe</text>
          <text data-role="heel-label" x={heelX} y={H - 12} textAnchor={anchor(heelX)}>Heel</text>
          <text x={CX} y={H - 12} textAnchor="middle">Grid 0.5 in</text>
        </g>
      </svg>
    </div>
  );
}
