import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { change, seriesForMetric, type MetricStats, type ProgressionShot, type Range } from '@fsa/analytics';
import { fieldDef, formatMeasurement, formatSessionDate, type MeasurementKey } from '@fsa/domain';
import { BALL, CLUB, SOFT, TrendChart, type TrendSeries } from '@fsa/visualizations';
import type { SessionRow, TargetRange } from '../api';
import { formatChange, formatPlain, tickFormatter } from './format';
import type { Scope } from './scope';
import { TargetRangeForm } from './TargetRangeForm';
import { CATEGORIES, type TileDef } from './tiles';
import { isFew, TileDetails } from './TileDetails';

export interface MetricTileProps {
  def: TileDef;
  /** Shown sessions, oldest first: S1…Sn. */
  sessions: readonly SessionRow[];
  /** The club's shots in those sessions, excluded ones included (the scope's Shots choice filters them). */
  shots: readonly ProgressionShot[];
  scope: Scope;
  range: TargetRange | null;
  /** Move / remove buttons from the dashboard editor. */
  controls: ReactNode;
  /** Metric and accuracy tiles: editing the target range. Absent, the tile offers no `Set target range`. */
  rangeEditor?: RangeEditor;
}

export interface RangeEditor {
  save: (low: number | null, high: number | null) => void;
  clear: () => void;
  /** A save or clear is in flight. */
  busy: boolean;
}

const BAND_LABEL = { iqr: 'P25–P75', p10p90: 'P10–P90' } as const;

/** Ball-flight metrics orange, club-delivery blue. */
const colorFor = (key: MeasurementKey) => (fieldDef(key).group === 'club' ? CLUB : BALL);

const categoryTitle = (def: TileDef) => CATEGORIES.find((c) => c.id === def.category)?.title ?? '';

export interface TileFrameProps {
  def: TileDef;
  controls: ReactNode;
  /** A line under the title, e.g. which shots or sessions the tile uses. */
  subtitle?: ReactNode;
  /** Extra class on the article, e.g. `prog-tile--wide`. */
  className?: string;
  /** The big number and the change line. */
  headline?: ReactNode;
  /** The chart(s). */
  body?: ReactNode;
  /** Legend, caption, notes and the target range control. */
  notes?: ReactNode;
  /** The Details expander. */
  footer?: ReactNode;
}

/**
 * A dashboard tile in five rows: title, headline, chart, notes, details. The rows are shared with the other tiles
 * in the same grid row (CSS subgrid), so headlines, charts and Details line up across tiles of different contents.
 */
export function TileFrame({ def, controls, subtitle, className, headline, body, notes, footer }: TileFrameProps) {
  const id = useId();
  return (
    <article className={className ? `prog-tile ${className}` : 'prog-tile'} aria-labelledby={id}>
      <header className="prog-tile__head" data-slot="head">
        <div>
          <div className="prog-tile__eyebrow">{categoryTitle(def)}</div>
          <h2 id={id} className="prog-tile__title">{def.title}</h2>
          {subtitle && <p className="prog-tile__subtitle">{subtitle}</p>}
        </div>
        <div className="prog-tile__controls">{controls}</div>
      </header>
      <div className="prog-tile__slot" data-slot="headline">{headline}</div>
      <div className="prog-tile__slot" data-slot="body">{body}</div>
      <div className="prog-tile__slot" data-slot="notes">{notes}</div>
      <div className="prog-tile__slot" data-slot="footer">{footer}</div>
    </article>
  );
}

const ICON = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export interface TileControlsProps {
  title: string;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}

/** Icon buttons: `Move {title} earlier`, `Move {title} later`, `Remove {title}`. */
export function TileControls({ title, first, last, onMove, onRemove }: TileControlsProps) {
  return (
    <>
      <button type="button" className="prog-tile__ctl fsa-touch" aria-label={`Move ${title} earlier`} disabled={first} onClick={() => onMove(-1)}>
        <svg aria-hidden="true" {...ICON}><path d="M9 2L4 7l5 5" /></svg>
      </button>
      <button type="button" className="prog-tile__ctl fsa-touch" aria-label={`Move ${title} later`} disabled={last} onClick={() => onMove(1)}>
        <svg aria-hidden="true" {...ICON}><path d="M5 2l5 5-5 5" /></svg>
      </button>
      <button type="button" className="prog-tile__ctl fsa-touch" aria-label={`Remove ${title}`} onClick={onRemove}>
        <svg aria-hidden="true" {...ICON}><path d="M3 3l8 8M11 3l-8 8" /></svg>
      </button>
    </>
  );
}

function rangeText(key: MeasurementKey, r: Range, abs: boolean): string {
  const fmt = (v: number) => (abs ? formatPlain(key, v) : formatMeasurement(key, v));
  if (r.low !== null && r.high !== null) return `${fmt(r.low)} – ${fmt(r.high)}`;
  return r.low !== null ? `≥ ${fmt(r.low)}` : `≤ ${fmt(r.high!)}`;
}

function bandsOf(stats: readonly MetricStats[], band: Scope['band']): ([number, number] | null)[] {
  return stats.map((s) => {
    const [lo, hi] = band === 'iqr' ? [s.p25, s.p75] : [s.p10, s.p90];
    return lo === null || hi === null ? null : [lo, hi];
  });
}

/** Standard, accuracy (|value| plus the signed median as bias) and variation (SD per session) tiles. */
export function MetricTile({ def, sessions, shots, scope, range, controls, rangeEditor }: MetricTileProps) {
  const [editingRange, setEditingRange] = useState(false);
  // Closing the form puts focus back on `Set target range`.
  const rangeButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!editingRange && refocus.current) {
      refocus.current = false;
      rangeButton.current?.focus();
    }
  }, [editingRange]);
  const closeRange = () => { refocus.current = true; setEditingRange(false); };
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
  const latestInRange = stats.length ? stats[stats.length - 1]!.inRange : null;
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
    tooltip: `S${i + 1} · ${s.name} · ${formatSessionDate(s.date, { setByYou: false })} · n ${stats[i]!.n}${isFew(stats[i]!) ? ' · few shots' : ''}`,
  }));
  const last = sessions.length;
  const what = variation ? 'SD' : accuracy ? 'median distance from the line' : 'median';

  return (
    <TileFrame
      def={def}
      controls={controls}
      headline={(
        <>
          <div className="prog-tile__headline">
            <span className="prog-tile__value">{headline}</span>
            <span className="prog-tile__what">{`S${last} · ${what}`}</span>
            {latestInRange && <span className="prog-tile__inrange">{`${Math.round(latestInRange.pct)}% in range`}</span>}
          </div>
          {changeLine && <div className="prog-tile__change">{changeLine}</div>}
        </>
      )}
      body={(
        <TrendChart
          title={`${def.title} by session`}
          sessions={chartSessions}
          series={series}
          target={target}
          formatTick={tickFormatter(key)}
          // Signed values (L/R, up/down, ahead/behind): show where zero is.
          zeroLine={fieldDef(key).direction !== null && !variation}
        />
      )}
      notes={(
        <>
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
              {target && (
                <li>
                  <span className="prog-legend__target" aria-hidden="true" />
                  {`Target range: ${rangeText(key, target, accuracy)}`}
                </li>
              )}
            </ul>
          )}
          {rangeEditor && (editingRange ? (
            <TargetRangeForm
              metric={key}
              abs={accuracy}
              range={range}
              onSave={(low, high) => { rangeEditor.save(low, high); closeRange(); }}
              onClear={() => { rangeEditor.clear(); closeRange(); }}
              onCancel={closeRange}
            />
          ) : (
            <div className="prog-tile__range">
              {/* aria-disabled, not disabled, while a save is in flight: the button keeps focus after the form closes. */}
              <button
                ref={rangeButton}
                type="button"
                className="fsa-btn fsa-btn--ghost fsa-touch"
                aria-disabled={rangeEditor.busy}
                onClick={() => { if (!rangeEditor.busy) setEditingRange(true); }}
              >
                Set target range
              </button>
            </div>
          ))}
        </>
      )}
      footer={<TileDetails metric={key} sessions={sessions} stats={stats} abs={accuracy} signed={signed} hasRange={target !== null} />}
    />
  );
}
