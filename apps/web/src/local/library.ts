import type { SessionRow } from './api';

export type LibrarySort = 'date-desc' | 'date-asc' | 'shots-desc' | 'shots-asc' | 'name-asc' | 'name-desc';

export function filterSessions(rows: SessionRow[], query: string): SessionRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.notes.toLowerCase().includes(q) ||
      r.clubs.some((c) => c.club.toLowerCase().includes(q)),
  );
}

const byCreatedDesc = (a: SessionRow, b: SessionRow) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
const cmp = <T extends string | number>(a: T, b: T) => (a < b ? -1 : a > b ? 1 : 0);

export function sortSessions(rows: SessionRow[], sort: LibrarySort): SessionRow[] {
  const key: Record<LibrarySort, (a: SessionRow, b: SessionRow) => number> = {
    'date-desc': (a, b) => cmp(b.date, a.date),
    'date-asc': (a, b) => cmp(a.date, b.date),
    'shots-desc': (a, b) => cmp(b.shotCount, a.shotCount),
    'shots-asc': (a, b) => cmp(a.shotCount, b.shotCount),
    'name-asc': (a, b) => a.name.localeCompare(b.name),
    'name-desc': (a, b) => b.name.localeCompare(a.name),
  };
  return [...rows].sort((a, b) => key[sort](a, b) || byCreatedDesc(a, b));
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m0: number, d: number) => {
  const dt = new Date(Date.UTC(y, m0, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

/** Six Monday-first weeks covering the month. */
export function monthGrid(year: number, month0: number): { date: string; inMonth: boolean }[] {
  const lead = (new Date(Date.UTC(year, month0, 1)).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = ymd(year, month0, 1 - lead + i);
    return { date, inMonth: Number(date.slice(5, 7)) === month0 + 1 };
  });
}

export function sessionsByDate(rows: SessionRow[]): Map<string, SessionRow[]> {
  const out = new Map<string, SessionRow[]>();
  for (const r of rows) out.set(r.date, [...(out.get(r.date) ?? []), r]);
  return out;
}

/** Today's date on the user's own calendar (never UTC, so late evenings keep the right day). */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
