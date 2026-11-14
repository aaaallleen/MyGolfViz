import { useState } from 'react';
import { orderSessions } from '@fsa/analytics';
import { formatSessionDate } from '@fsa/domain';
import { Button, SegmentedControl, SelectField } from '@fsa/ui';
import type { SessionRow } from '../api';
import { clubsInLibrary, type Scope, type SessionsChoice } from './scope';

export interface ScopeBarProps {
  rows: readonly SessionRow[];
  /** The resolved club. */
  club: string;
  /** Sessions shown for the club, oldest first. */
  shown: readonly SessionRow[];
  scope: Scope;
  onChange: (next: Scope) => void;
  /** e.g. `All 214 shots`; null while the shots load. */
  line: string | null;
}

const LAST_OPTIONS = [
  { value: '3', label: 'Last 3' },
  { value: '6', label: 'Last 6' },
  { value: '10', label: 'Last 10' },
  { value: '20', label: 'Last 20' },
  { value: 'all', label: 'All' },
  { value: 'choose', label: 'Choose…' },
];

const shotsLabel = (n: number) => `${n} ${n === 1 ? 'shot' : 'shots'}`;
const countFor = (r: SessionRow, club: string) => r.clubs.find((c) => c.club === club)?.count ?? 0;

export function ScopeBar({ rows, club, shown, scope, onChange, line }: ScopeBarProps) {
  const [choosing, setChoosing] = useState<Set<string> | null>(null);
  const pickedActive = scope.picked !== null && shown.some((s) => scope.picked!.includes(s.id));
  const sessionsValue = choosing || pickedActive ? 'choose' : String(scope.last);
  const candidates = orderSessions(rows.filter((r) => countFor(r, club) > 0)).reverse();

  const pickSessions = (v: string) => {
    if (v === 'choose') {
      setChoosing(new Set(shown.map((s) => s.id)));
      return;
    }
    setChoosing(null);
    onChange({ ...scope, last: (v === 'all' ? 'all' : Number(v)) as SessionsChoice, picked: null });
  };
  const toggle = (id: string) =>
    setChoosing((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const apply = () => {
    if (!choosing || choosing.size === 0) return;
    onChange({ ...scope, picked: candidates.filter((r) => choosing.has(r.id)).map((r) => r.id) });
    setChoosing(null);
  };

  return (
    <section className="prog-scope" aria-label="Scope">
      <div className="prog-scope__controls">
        <SelectField
          label="Club"
          value={club}
          options={clubsInLibrary(rows).map((c) => ({ value: c.club, label: `${c.club} · ${shotsLabel(c.shots)}` }))}
          // A hand-picked set belongs to the club it was picked for.
          onChange={(v) => { setChoosing(null); onChange({ ...scope, club: v, picked: null }); }}
        />
        <SelectField label="Sessions" value={sessionsValue} options={LAST_OPTIONS} onChange={pickSessions} />
        {pickedActive && !choosing && (
          <Button variant="ghost" onClick={() => pickSessions('choose')}>Choose…</Button>
        )}
        <SegmentedControl
          label="Shots"
          value={scope.shots}
          options={[{ value: 'all', label: 'All shots' }, { value: 'stock', label: 'Stock shots only' }]}
          onChange={(shots) => onChange({ ...scope, shots })}
        />
        <SegmentedControl
          label="Band"
          value={scope.band}
          options={[{ value: 'iqr', label: 'P25–P75' }, { value: 'p10p90', label: 'P10–P90' }]}
          onChange={(band) => onChange({ ...scope, band })}
        />
      </div>
      {line && <p className="prog-scope__line" aria-live="polite">{line}</p>}
      {choosing && (
        <fieldset className="prog-choose">
          <legend>Choose sessions</legend>
          <ul className="prog-choose__list">
            {candidates.map((r) => (
              <li key={r.id}>
                <label className="prog-choose__item">
                  <input type="checkbox" checked={choosing.has(r.id)} onChange={() => toggle(r.id)} />
                  <span className="prog-choose__date">{formatSessionDate(r.date, { setByYou: false })}</span>
                  <span className="prog-choose__name">{r.name}</span>
                  <span className="prog-choose__n">{countFor(r, club)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="prog-choose__actions">
            <Button variant="primary" disabled={choosing.size === 0} onClick={apply}>Apply</Button>
            <Button onClick={() => setChoosing(null)}>Cancel</Button>
          </div>
        </fieldset>
      )}
    </section>
  );
}
