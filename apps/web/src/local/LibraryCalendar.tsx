import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@fsa/ui';
import type { SessionRow } from './api';
import { ClubChips } from './LibraryList';
import { monthGrid, sessionsByDate, todayLocal } from './library';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function LibraryCalendar({ rows }: { rows: SessionRow[] }) {
  const today = todayLocal();
  const [month, setMonth] = useState({ y: Number(today.slice(0, 4)), m0: Number(today.slice(5, 7)) - 1 });
  const [selected, setSelected] = useState(today);
  const byDate = useMemo(() => sessionsByDate(rows), [rows]);
  const grid = useMemo(() => monthGrid(month.y, month.m0), [month]);
  const shift = (by: number) => setMonth(({ y, m0 }) => {
    const d = new Date(Date.UTC(y, m0 + by, 1));
    return { y: d.getUTCFullYear(), m0: d.getUTCMonth() };
  });
  const daySessions = byDate.get(selected) ?? [];

  return (
    <section className="lib-cal">
      <div className="lib-card lib-cal__main">
        <div className="lib-cal__head">
          <h2>{MONTH_FORMAT.format(new Date(Date.UTC(month.y, month.m0, 1)))}</h2>
          <div className="lib-cal__nav">
            <Button onClick={() => { setMonth({ y: Number(today.slice(0, 4)), m0: Number(today.slice(5, 7)) - 1 }); setSelected(today); }}>Today</Button>
            <Button aria-label="Previous month" className="lib-cal__arrow" onClick={() => shift(-1)}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 2L4 7l5 5" /></svg>
            </Button>
            <Button aria-label="Next month" className="lib-cal__arrow" onClick={() => shift(1)}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 2l5 5-5 5" /></svg>
            </Button>
          </div>
        </div>
        <div className="lib-cal__grid lib-cal__weekdays" aria-hidden="true">
          {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="lib-cal__grid">
          {grid.map((d) => {
            const list = byDate.get(d.date) ?? [];
            const classes = ['lib-day', d.inMonth ? '' : 'is-out', d.date === today ? 'is-today' : '', d.date === selected ? 'is-selected' : ''].filter(Boolean).join(' ');
            return (
              // The whole box picks the day (the number button stays for the keyboard); session chips open their session.
              <div key={d.date} className={classes} onClick={() => setSelected(d.date)}>
                <button
                  type="button"
                  className="lib-day__num"
                  aria-pressed={d.date === selected}
                  aria-label={DAY_FORMAT.format(utc(d.date))}
                  onClick={() => setSelected(d.date)}
                >
                  {Number(d.date.slice(8))}
                </button>
                {list.map((s) => (
                  <Link key={s.id} to={`/sessions/${s.id}`} className="lib-day__session" title={s.name}>
                    <span className="lib-day__name">{s.name}</span>
                    <span className="lib-day__meta">{`${plural(s.shotCount, 'shot')} · ${plural(s.fileCount, 'file')}`}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
        <div className="lib-cal__legend">
          <span><i className="lib-swatch lib-swatch--session" />Session on its date</span>
          <span><i className="lib-swatch lib-swatch--today" />Today</span>
          <span>Dates are the ones you set, never read from filenames</span>
        </div>
      </div>
      <aside className="lib-cal__side">
        <div className="lib-card lib-day-panel">
          <div>
            <h2>{DAY_FORMAT.format(utc(selected))}</h2>
            <span className="lib-muted">{plural(daySessions.length, 'session')}</span>
          </div>
          <Link className="fsa-btn fsa-btn--primary fsa-touch lib-day-panel__add" to={`/import?date=${selected}`}>Add session data</Link>
          {daySessions.map((s) => (
            <Link key={s.id} to={`/sessions/${s.id}`} className="lib-day-session" aria-label={`Open ${s.name}`}>
              <span className="lib-name">{s.name}</span>
              <div className="lib-stats">
                <div><b>{s.shotCount}</b><span>shots</span></div>
                <div><b>{s.fileCount}</b><span>files</span></div>
                <div><b>{s.clubs.length}</b><span>clubs</span></div>
              </div>
              <ClubChips clubs={s.clubs} />
            </Link>
          ))}
        </div>
      </aside>
    </section>
  );
}
