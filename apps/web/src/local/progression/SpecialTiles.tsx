import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  clubGapping, FEW_SHOTS, impactHeatmap, impactStats, mishitFrequency, seriesForMetric,
  type MetricStats, type ProgressionShot,
} from '@fsa/analytics';
import { formatMeasurement, formatSessionDate, NOT_MEASURED, NUMBER_LOCALE, numberFormat } from '@fsa/domain';
import { SelectField } from '@fsa/ui';
import { BALL, CLUB, GappingChart, ImpactHeatmap, SOFT, TrendChart, type TrendSeries } from '@fsa/visualizations';
import * as api from '../api';
import type { SessionRow } from '../api';
import { formatPlain, tickFormatter } from './format';
import { TileFrame } from './MetricTile';
import { sessionsForGapping, toProgressionShot, type Scope } from './scope';
import type { TileDef } from './tiles';
import { isFew } from './TileDetails';

export interface SpecialTileProps {
  def: TileDef;
  /** Every session in the library: Club gapping picks its own. */
  rows: readonly SessionRow[];
  /** Sessions shown for the club, oldest first: S1…Sn. */
  sessions: readonly SessionRow[];
  /** The club's shots in those sessions, excluded ones included. */
  shots: readonly ProgressionShot[];
  scope: Scope;
  controls: ReactNode;
}

/** Mishit frequency, Speed & smash, Impact location and Club gapping. */
export function SpecialTile(props: SpecialTileProps) {
  switch (props.def.kind) {
    case 'mishit': return <MishitTile {...props} />;
    case 'speedSmash': return <SpeedSmashTile {...props} />;
    case 'impact': return <ImpactTile {...props} />;
    case 'gapping': return <GappingTile {...props} />;
    default: return <TileFrame def={props.def} controls={props.controls} />;
  }
}

const label = (i: number) => `S${i + 1}`;
const dateOf = (s: SessionRow) => formatSessionDate(s.date, { setByYou: false });
const sessionText = (s: SessionRow, i: number) => `${label(i)} · ${s.name} · ${dateOf(s)}`;
const fewText = (st: Pick<MetricStats, 'few' | 'n'>) => (isFew(st) ? ' · few shots' : '');
/** `few` for a plain count, by the page's rule (0 < n < FEW_SHOTS). */
const countFew = (n: number) => ({ n, few: n < FEW_SHOTS });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const useIds = (sessions: readonly SessionRow[]) => useMemo(() => sessions.map((s) => s.id), [sessions]);

function Headline({ value, what, long = false }: { value: string; what: string; long?: boolean }) {
  return (
    <div className="prog-tile__headline">
      <span className={long ? 'prog-tile__value prog-tile__value--long' : 'prog-tile__value'}>{value}</span>
      <span className="prog-tile__what">{what}</span>
    </div>
  );
}

function Legend({ series }: { series: readonly TrendSeries[] }) {
  return (
    <ul className="prog-legend">
      {series.map((s) => (
        <li key={s.name}>
          <span className="prog-legend__swatch" style={{ background: s.color }} aria-hidden="true" />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/** Per-session numbers behind a special tile: S, session and date, then the tile's own columns. */
function Details({ columns, sessions, cells }: {
  columns: readonly string[];
  sessions: readonly SessionRow[];
  cells: (i: number) => readonly ReactNode[];
}) {
  return (
    <details className="prog-details">
      <summary>Details</summary>
      <div className="prog-details__scroll">
        <table className="prog-details__table">
          <thead>
            <tr>
              {['S', 'Session', 'Date', ...columns].map((c) => <th key={c} scope="col">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => (
              <tr key={s.id}>
                <td>{label(i)}</td>
                <td>{s.name}</td>
                <td>{dateOf(s)}</td>
                {cells(i).map((c, k) => <td key={k}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const percent = (v: number) => `${v.toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 1 })}%`;

function MishitTile({ def, sessions, shots, controls }: SpecialTileProps) {
  const ids = useIds(sessions);
  const freq = useMemo(() => mishitFrequency(ids, shots), [ids, shots]);
  const latest = freq.length ? freq[freq.length - 1]! : null;
  const few = freq.map((f) => isFew(countFew(f?.total ?? 0)));
  const series: TrendSeries[] = [{ name: 'Mishit rate', color: SOFT, values: freq.map((f) => (f ? f.rate * 100 : null)), few }];
  const chartSessions = sessions.map((s, i) => {
    const f = freq[i];
    return { label: label(i), tooltip: `${sessionText(s, i)} · ${f ? `${f.excluded} of ${f.total}` : 'no shots'}${few[i] ? ' · few shots' : ''}` };
  });

  return (
    // Mishits are the excluded shots, so the Shots switch does not apply.
    <TileFrame def={def} controls={controls} subtitle="All shots">
      <Headline
        value={latest ? `${latest.excluded} of ${latest.total} · ${Math.round(latest.rate * 100)}%` : NOT_MEASURED}
        what={`S${sessions.length} · excluded of all shots`}
      />
      <TrendChart title={`${def.title} by session`} sessions={chartSessions} series={series} formatTick={percent} />
      <p className="prog-tile__caption">A mishit is a shot you excluded.</p>
      <Details
        columns={['Excluded', 'Shots', 'Rate']}
        sessions={sessions}
        cells={(i) => {
          const f = freq[i];
          return f ? [f.excluded, <>{f.total}{few[i] && <span className="prog-few"> · few shots</span>}</>, percent(f.rate * 100)] : [0, 0, NOT_MEASURED];
        }}
      />
    </TileFrame>
  );
}

const SPEED_KEYS = ['clubSpeed', 'ballSpeed', 'smash'] as const;

function SpeedSmashTile({ def, sessions, shots, scope, controls }: SpecialTileProps) {
  const ids = useIds(sessions);
  const all = useMemo(
    () => SPEED_KEYS.map((key) => seriesForMetric(ids, shots, key, { shots: scope.shots })),
    [ids, shots, scope.shots],
  );
  const [club, ball, smash] = all as [MetricStats[], MetricStats[], MetricStats[]];
  const last = (stats: readonly MetricStats[]) => (stats.length ? stats[stats.length - 1]!.median : null);
  const c = last(club), b = last(ball), sm = last(smash);
  const number = (v: number) => v.toLocaleString(NUMBER_LOCALE, numberFormat(1));
  const speeds = c !== null && b !== null
    ? `${number(c)} → ${number(b)} mph`
    : `${formatMeasurement('clubSpeed', c)} → ${formatMeasurement('ballSpeed', b)}`;

  const line = (name: string, color: string, stats: readonly MetricStats[]): TrendSeries =>
    ({ name, color, values: stats.map((s) => s.median), few: stats.map((s) => s.few) });
  const speedSeries = [line('Club speed', CLUB, club), line('Ball speed', BALL, ball)];
  const chartSessions = sessions.map((s, i) => ({ label: label(i), tooltip: `${sessionText(s, i)} · n ${ball[i]!.total}` }));

  return (
    <TileFrame def={def} controls={controls}>
      <Headline value={`${speeds} · smash ${formatMeasurement('smash', sm)}`} what={`S${sessions.length} · medians`} long />
      <TrendChart title="Club and ball speed by session" sessions={chartSessions} series={speedSeries} formatTick={tickFormatter('ballSpeed')} />
      <Legend series={speedSeries} />
      <TrendChart
        title="Smash by session"
        sessions={chartSessions}
        series={[line('Smash', SOFT, smash)]}
        formatTick={tickFormatter('smash')}
        height={90}
      />
      <Details
        columns={['Club speed', 'Ball speed', 'Smash']}
        sessions={sessions}
        cells={(i) => all.map((stats, k) => `${formatMeasurement(SPEED_KEYS[k]!, stats[i]!.median)}${fewText(stats[i]!)}`)}
      />
    </TileFrame>
  );
}

const inches = (v: number | null) => formatPlain('impactLateral', v);

function ImpactTile({ def, sessions, shots, scope, controls }: SpecialTileProps) {
  const ids = useIds(sessions);
  // One session or all of them, for this tile only; back to all when the shown sessions change.
  const idsKey = ids.join('\n');
  const [pick, setPick] = useState({ forIds: idsKey, value: 'all' });
  const selected = pick.forIds === idsKey && ids.includes(pick.value) ? pick.value : 'all';
  const index = ids.indexOf(selected);

  const map = useMemo(
    () => impactHeatmap(selected === 'all' ? shots : shots.filter((s) => s.sessionId === selected), scope.shots),
    [shots, selected, scope.shots],
  );
  const stats = useMemo(() => impactStats(ids, shots, scope.shots), [ids, shots, scope.shots]);
  const notMeasured = map.total - map.measured;
  const measuredFew = stats.map((s) => isFew(countFew(s.measured)));
  const latest = stats.length ? stats[stats.length - 1]!.meanDistance : null;

  const options = [
    { value: 'all', label: 'All shown sessions' },
    ...sessions.map((s, i) => ({ value: s.id, label: `${label(i)} · ${s.name}` })),
  ];
  const chartSessions = sessions.map((s, i) => ({
    label: label(i),
    tooltip: `${sessionText(s, i)} · ${stats[i]!.measured} of ${stats[i]!.total} measured${measuredFew[i] ? ' · few shots' : ''}`,
  }));

  return (
    <TileFrame def={def} controls={controls} className="prog-tile--wide">
      <Headline value={inches(latest)} what={`S${sessions.length} · mean distance from face centre`} />
      <div className="prog-impact">
        <div className="prog-impact__map">
          <SelectField label="Sessions" value={selected} options={options} onChange={(value) => setPick({ forIds: idsKey, value })} />
          <ImpactHeatmap counts={map.counts} title={`Impact heatmap · ${options[index + 1]!.label}`} />
          {notMeasured > 0 && <p className="prog-tile__note">{`Impact not measured: ${notMeasured} of ${map.total}`}</p>}
        </div>
        <div className="prog-impact__trend">
          <TrendChart
            title="Distance from face centre"
            sessions={chartSessions}
            series={[{ name: 'Mean distance', color: BALL, values: stats.map((s) => s.meanDistance), few: measuredFew }]}
            formatTick={tickFormatter('impactLateral')}
          />
          <p className="prog-tile__caption">Distance from face centre · mean per session</p>
        </div>
      </div>
      <Details
        columns={['Measured', 'Mean distance', 'SD of distance', 'SD lateral', 'SD vertical']}
        sessions={sessions}
        cells={(i) => {
          const st = stats[i]!;
          return [
            <>{`${st.measured} of ${st.total}`}{measuredFew[i] && <span className="prog-few"> · few shots</span>}</>,
            inches(st.meanDistance), inches(st.sdDistance), inches(st.sdLateral), formatPlain('impactVertical', st.sdVertical),
          ];
        }}
      />
    </TileFrame>
  );
}

/**
 * Shots of every club in the gapping sessions. The previous answer stays while a new one loads, and only
 * the answer for the current sessions lands.
 */
export function useGappingShots(rows: readonly SessionRow[], scope: Scope) {
  const sessions = useMemo(() => sessionsForGapping(rows, scope), [rows, scope]);
  const ids = sessions.map((s) => s.id);
  const key = JSON.stringify(ids);
  const [loaded, setLoaded] = useState<{ key: string; shots: ProgressionShot[] } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFailedKey(null);
    // No `club`: all clubs.
    api.listLibraryShots({ sessionIds: ids }).then(
      (list) => { if (live) setLoaded({ key, shots: list.map(toProgressionShot) }); },
      () => { if (live) setFailedKey(key); },
    );
    return () => { live = false; };
    // `key` covers the session ids.
  }, [key]);

  const failed = failedKey === key;
  return { sessions, shots: loaded?.shots ?? null, loading: !failed && loaded?.key !== key, failed };
}

function GappingTile({ def, rows, scope, controls }: SpecialTileProps) {
  const { sessions, shots, loading, failed } = useGappingShots(rows, scope);
  const gaps = useMemo(() => (shots ? clubGapping(shots, scope.shots) : null), [shots, scope.shots]);
  // The same rule as sessionsForGapping: a hand-picked set counts while any of it still exists.
  const chosen = scope.picked !== null && rows.some((r) => scope.picked!.includes(r.id));
  const subtitle = chosen
    ? `Median carry · ${plural(sessions.length, 'chosen session')}`
    : `Median carry · last ${plural(sessions.length, 'session')} of any club`;

  return (
    <TileFrame def={def} controls={controls} subtitle={subtitle}>
      {failed ? (
        <p className="prog-tile__note" role="status">Couldn't load the shots for gapping.</p>
      ) : (
        <div className={`prog-gapping${loading && gaps ? ' prog-gapping--loading' : ''}`} aria-busy={loading}>
          {gaps && (gaps.length > 0 ? (
            <>
              <GappingChart rows={gaps} formatValue={(v) => formatPlain('carry', v)} />
              <p className="prog-tile__caption">Bar: P25–P75 · line: median · hollow bar: few shots</p>
            </>
          ) : (
            <p className="prog-tile__note">No carry measured in these sessions.</p>
          ))}
        </div>
      )}
    </TileFrame>
  );
}
