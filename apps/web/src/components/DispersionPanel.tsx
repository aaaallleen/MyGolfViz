import { dispersionStats, type LandingMode } from '@fsa/analytics';
import { formatMeasurement, NOT_MEASURED, type Shot } from '@fsa/domain';
import { SegmentedControl } from '@fsa/ui';
import { DispersionPlot } from '@fsa/visualizations';

const TITLE: Record<LandingMode, string> = {
  carry: 'Landing dispersion · top view',
  total: 'Total Distance vs. Landing Offset',
};
const yd = (v: number | null) => (v === null ? NOT_MEASURED : `${v.toFixed(1)} yd`);

export function shotLabel(s: Shot): string {
  return `Shot ${s.shotLabel ?? s.sourceRow}`;
}

export function DispersionPanel({ shots, mode, onMode, selectedId, onSelect }: {
  shots: readonly Shot[];
  mode: LandingMode;
  onMode(m: LandingMode): void;
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  const stats = dispersionStats(shots, mode);
  const word = mode === 'carry' ? 'Carry' : 'Total';
  const n = stats.points.length;
  const caption = stats.ellipse
    ? `1σ covariance ellipse · about ${Math.round(stats.expectedCoverage * 100)}% expected coverage if shots were bivariate normal · observed: ${stats.observedInside} of ${n} shots inside. Cross: mean landing.`
    : `Ellipse needs at least 3 shots with lateral and ${mode} values.`;
  const byId = new Map(shots.map((s) => [s.id, s]));
  return (
    <div className="panel">
      <div className="panel__head">
        <h2>{TITLE[mode]}</h2>
        <SegmentedControl
          label="Landing position"
          value={mode}
          onChange={onMode}
          options={[{ value: 'carry', label: 'Carry' }, { value: 'total', label: 'Total' }]}
        />
      </div>
      <DispersionPlot stats={stats} selectedId={selectedId} onSelect={onSelect} labelFor={(id) => { const s = byId.get(id); return s ? shotLabel(s) : ''; }} />
      <dl className="stat-list">
        <div><dt>Average lateral error</dt><dd>{yd(stats.meanAbsLateral)}</dd></div>
        <div><dt>{word} SD</dt><dd>{yd(stats.sdY)}</dd></div>
        <div><dt>Lateral SD</dt><dd>{yd(stats.sdX)}</dd></div>
        <div>
          <dt>Mean position</dt>
          <dd>{stats.centroid ? `${formatMeasurement(mode, stats.centroid.y)} · ${formatMeasurement('lateral', stats.centroid.x)}` : NOT_MEASURED}</dd>
        </div>
      </dl>
      <p className="panel__note">{`n ${n} of ${shots.length} shots have lateral and ${mode} values`}</p>
      <p className="panel__note">{caption}</p>
    </div>
  );
}
