import { IMPACT_CONVENTION, formatMeasurement, type ClubCategory, type Handedness } from '@fsa/domain';
import { FACE_OUTLINES } from './faceOutlines';
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
const CATEGORY_NAME: Record<ClubCategory, string> = { driver: 'Driver', wood: 'Wood or hybrid', iron: 'Iron' };

/** Face-on view. Right-handed: toe on the viewer's left, so +lateral (toe) plots left. Left-handed mirrors. */
export function FaceImpactDiagram({ category, handedness, selected, others, showOthers }: FaceImpactDiagramProps) {
  const o = FACE_OUTLINES[category];
  const side = handedness === 'right' ? 1 : -1; // +1: toe on the left
  const px = (x: number) => CX - side * x * PX_PER_IN;
  const py = (y: number) => CY - y * PX_PER_IN;
  const s = (o.widthIn * PX_PER_IN) / o.frameWidth;
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
        <g transform={`translate(${CX} ${CY}) scale(${side} 1) scale(${s}) translate(${-o.centre.x} ${-o.centre.y})`}>
          {o.hosel && <line {...o.hosel} stroke={INK} strokeWidth={9} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
          <path data-role="face-outline" d={o.d} fill={FACE_FILL} stroke={INK} strokeWidth={2} strokeLinejoin="round"
            vectorEffect="non-scaling-stroke" />
          {o.grooves && (
            <g stroke={BORDER} strokeWidth={1}>
              {o.grooves.ys.map((y) => <line key={y} x1={o.grooves!.x1} x2={o.grooves!.x2} y1={y} y2={y} vectorEffect="non-scaling-stroke" />)}
            </g>
          )}
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
      {!IMPACT_CONVENTION.verified && (
        <p style={{ color: MUTED, fontSize: 13 }}>Impact direction convention is provisional.</p>
      )}
    </div>
  );
}
