import { trajectoryCurve, type DispersionStats, type LandingMode, type TrajectoryCurve } from '@fsa/analytics';
import type { Shot } from '@fsa/domain';
import { SegmentedControl } from '@fsa/ui';
import { DispersionPlot, patternXMax, PATTERN_WIDTH, TrajectoryPlot, type ClubSeries } from '@fsa/visualizations';
import { shotLabel } from './shotLabel';
import { usePhone } from './usePhone';

export type ClubGroup = ClubSeries & { stats: DispersionStats };

const TITLE: Record<LandingMode, string> = {
  carry: 'Landing dispersion · top view',
  total: 'Total Distance vs. Landing Offset',
};
/** Narrower viewBox on phones, so the plot text stays readable once scaled to the screen. */
const PHONE_WIDTH = 420;

function ellipseCaption(groups: readonly ClubGroup[], mode: LandingMode): string {
  const withEllipse = groups.filter((g) => g.stats.ellipse);
  if (withEllipse.length === 0) return `Ellipse needs at least 3 shots with lateral and ${mode} values.`;
  const inside = withEllipse.reduce((n, g) => n + g.stats.observedInside, 0);
  const n = withEllipse.reduce((k, g) => k + g.stats.points.length, 0);
  const missing = groups.some((g) => !g.stats.ellipse && g.stats.points.length > 0) ? ' Clubs with fewer than 3 shots have no ellipse.' : '';
  return `1σ covariance ellipse per club · about ${Math.round(withEllipse[0]!.stats.expectedCoverage * 100)}% expected coverage if shots were bivariate normal · observed: ${inside} of ${n} shots inside. Cross: each club's mean landing.${missing}`;
}

/** Top view and side view stacked on one distance scale, one colour per club. */
export function ShotPatternPanel({ shots, groups, mode, onMode, selectedId, onSelect, highlightClub }: {
  shots: readonly Shot[];
  /** Per-club dispersion with colours, in bag order. */
  groups: readonly ClubGroup[];
  mode: LandingMode;
  onMode(m: LandingMode): void;
  selectedId: string | null;
  onSelect(id: string): void;
  highlightClub: string | null;
}) {
  const width = usePhone() ? PHONE_WIDTH : PATTERN_WIDTH;
  const byId = new Map(shots.map((s) => [s.id, s]));
  const curves = groups.map((g) => ({
    club: g.club,
    color: g.color,
    curves: shots.filter((s) => s.club === g.club).map(trajectoryCurve).filter((c): c is TrajectoryCurve => c !== null),
  }));
  const nPoints = groups.reduce((n, g) => n + g.stats.points.length, 0);
  const nCurves = curves.reduce((n, g) => n + g.curves.length, 0);
  const longest = Math.max(0, ...groups.flatMap((g) => g.stats.points.map((p) => p.y)), ...curves.flatMap((g) => g.curves.map((c) => c.p3[0])));
  const xMax = patternXMax(longest);
  const selected = selectedId ? byId.get(selectedId) : undefined;

  return (
    <div className="panel overview__pattern">
      <div className="panel__head">
        <h2>{TITLE[mode]}</h2>
        <SegmentedControl
          label="Landing position"
          value={mode}
          onChange={onMode}
          options={[{ value: 'carry', label: 'Carry' }, { value: 'total', label: 'Total' }]}
        />
      </div>
      <DispersionPlot
        mode={mode}
        groups={[...groups]}
        xMax={xMax}
        width={width}
        selectedId={selectedId}
        highlightClub={highlightClub}
        selectedLaunchH={selected?.m.launchH ?? null}
        onSelect={onSelect}
        labelFor={(id) => { const s = byId.get(id); return s ? `${s.club} · ${shotLabel(s)}` : ''; }}
      />
      <p className="panel__note">{`n ${nPoints} of ${shots.length} shots have lateral and ${mode} values`}</p>
      <p className="panel__note">{ellipseCaption(groups, mode)}</p>
      <div className="panel__head overview__side-view-head">
        <h3>Trajectory · side view</h3>
        <span className="panel__note">{`n ${nCurves} of ${shots.length} shots · same distance scale as the top view`}</span>
      </div>
      <TrajectoryPlot groups={curves} selectedId={selectedId} highlightClub={highlightClub} xMax={xMax} width={width} />
    </div>
  );
}
