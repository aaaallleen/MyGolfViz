import { useId, useMemo, type ReactNode } from 'react';
import { change, seriesForMetric, type MetricStats, type ProgressionShot, type Range } from '@fsa/analytics';
import { fieldDef, formatMeasurement, formatSessionDate, type MeasurementKey } from '@fsa/domain';
import { BALL, CLUB, SOFT, TrendChart, type TrendSeries } from '@fsa/visualizations';
import type { SessionRow, TargetRange } from '../api';
import { formatChange, formatPlain, tickFormatter } from './format';
import type { Scope } from './scope';
import { CATEGORIES, type TileDef } from './tiles';
import { TileDetails } from './TileDetails';

export interface MetricTileProps {
  def: TileDef;
  /** Shown sessions, oldest first: S1…Sn. */
  sessions: readonly SessionRow[];
  /** The club's shots in those sessions, excluded ones included (the scope's Shots choice filters them). */
  shots: readonly ProgressionShot[];
  scope: Scope;
  range: TargetRange | null;
  /** Move / remove buttons (filled by the dashboard editor). */
  controls?: ReactNode;
}

const BAND_LABEL = { iqr: 'P25–P75', p10p90: 'P10–P90' } as const;

/** Ball-flight metrics orange, club-delivery blue. */
const colorFor = (key: MeasurementKey) => (fieldDef(key).group === 'club' ? CLUB : BALL);

const categoryTitle = (def: TileDef) => CATEGORIES.find((c) => c.id === def.category)?.title ?? '';

export function TileFrame({ def, controls, children }: { def: TileDef; controls?: ReactNode; children?: ReactNode }) {
  const id = useId();
  return (
    <article className="prog-tile" aria-labelledby={id}>
      <header className="prog-tile__head">
        <div>
          <div className="prog-tile__eyebrow">{categoryTitle(def)}</div>
          <h2 id={id} className="prog-tile__title">{def.title}</h2>
        </div>
        {controls && <div className="prog-tile__controls">{controls}</div>}
      </header>
      {children}
    </article>
  );
}

function bandsOf(stats: readonly MetricStats[], band: Scope['band']): ([number, number] | null)[] {
  return stats.map((s) => {
    const [lo, hi] = band === 'iqr' ? [s.p25, s.p75] : [s.p10, s.p90];
    return lo === null || hi === null ? null : [lo, hi];
  });
}

/** Standard, accuracy (|value| plus the signed median as bias) and variation (SD per session) tiles. */
export function MetricTile({ def, sessions, shots, scope, range, controls }: MetricTileProps) {
  const key = def.metric!;
  const accuracy = def.kind === 'accuracy';
  const variation = def.kind === 'variation';
  const ids = useMemo(() => sessions.map((s) => s.id), [sessions]);
  // Target ranges belong to metric and accuracy tiles; on accuracy tiles they apply to |value|.
  const target = useMemo<Range | null>(
    () => (range && !variation ? { low: range.low, high: range.high } : null),
    [range, variation],
  );

  const stats = useMemo(
    () => seriesForMetric(ids, shots, key, { shots: scope.shots, abs: accuracy, range: target }),
    [ids, shots, key, scope.shots, accuracy, target],
  );
  const signed = useMemo(
    () => (accuracy ? seriesForMetric(ids, shots, key, { shots: scope.shots }) : null),
    [accuracy, ids, shots, key, scope.shots],
  );

  const values = stats.map((s) => (variation ? s.sd : s.median));
  const latest = values.length ? values[values.length - 1]! : null;
  const plain = accuracy || variation;
  const headline = plain ? formatPlain(key, latest) : formatMeasurement(key, latest);
  // No change line when the latest session has no value: an older pair would read as the latest change.
  let changeLine: string | null = null;
  if (latest !== null) {
    const diff = change(values);
    if (!diff) changeLine = 'First session shown';
    else {
      const text = formatChange(key, diff.delta);
      changeLine = `${text} since S${diff.since + 1}`;
      if (variation && !text.startsWith('→')) changeLine += diff.delta < 0 ? ' · more consistent' : ' · less consistent';
    }
  }

  const color = colorFor(key);
  const series: TrendSeries[] = [{
    name: variation ? 'SD' : accuracy ? 'Distance from the line (median)' : 'Median',
    color,
    values,
    ...(variation ? {} : { bands: bandsOf(stats, scope.band) }),
    few: stats.map((s) => s.few),
  }];
  if (signed) {
    series.push({ name: 'Bias (signed median)', color: SOFT, values: signed.map((s) => s.median), few: signed.map((s) => s.few) });
  }
  const chartSessions = sessions.map((s, i) => ({
    label: `S${i + 1}`,
    tooltip: `S${i + 1} · ${s.name} · ${formatSessionDate(s.date, { setByYou: false })} · n ${stats[i]!.n}${stats[i]!.few ? ' · few shots' : ''}`,
  }));
  const last = sessions.length;
  const what = variation ? 'SD' : accuracy ? 'median distance from the line' : 'median';

  return (
    <TileFrame def={def} controls={controls}>
      <div className="prog-tile__headline">
        <span className="prog-tile__value">{headline}</span>
        <span className="prog-tile__what">{`S${last} · ${what}`}</span>
      </div>
      {changeLine && <div className="prog-tile__change">{changeLine}</div>}
      <TrendChart
        title={`${def.title} by session`}
        sessions={chartSessions}
        series={series}
        target={target}
        formatTick={tickFormatter(key)}
        // Signed values (L/R, up/down, ahead/behind): show where zero is.
        zeroLine={fieldDef(key).direction !== null && !variation}
      />
      {variation ? (
        <p className="prog-tile__caption">Lower = more consistent</p>
      ) : (
        <ul className="prog-legend">
          {series.map((s) => (
            <li key={s.name}>
              <span className="prog-legend__swatch" style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </li>
          ))}
          <li className="prog-legend__band">{`Band: ${BAND_LABEL[scope.band]}`}</li>
        </ul>
      )}
      <TileDetails metric={key} sessions={sessions} stats={stats} abs={accuracy} signed={signed} hasRange={target !== null} />
    </TileFrame>
  );
}
