// Calendar arithmetic on plain `YYYY-MM-DD` strings, in UTC so no time zone can shift a day.
// Shared by the date picker (both builds) and the local library calendar.

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(y: number, m0: number, d: number): string {
  const dt = new Date(Date.UTC(y, m0, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** A valid `YYYY-MM-DD` as numbers, or null. */
export function parseYmd(date: string | null | undefined): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!m) return null;
  const [y, m0, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  return ymd(y, m0, d) === date ? { y, m0, d } : null;
}

export function addDays(date: string, days: number): string {
  const p = parseYmd(date)!;
  return ymd(p.y, p.m0, p.d + days);
}

/** The same day `months` later, clamped to the end of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const p = parseYmd(date)!;
  const last = new Date(Date.UTC(p.y, p.m0 + months + 1, 0)).getUTCDate();
  return ymd(p.y, p.m0 + months, Math.min(p.d, last));
}

/** Six Monday-first weeks covering the month. */
export function monthGrid(year: number, month0: number): { date: string; inMonth: boolean }[] {
  const lead = (new Date(Date.UTC(year, month0, 1)).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = ymd(year, month0, 1 - lead + i);
    return { date, inMonth: Number(date.slice(5, 7)) === month0 + 1 };
  });
}

/** Today's date on the user's own calendar (never UTC, so late evenings keep the right day). */
export function todayLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Monday 0 … Sunday 6. */
export function weekdayIndex(date: string): number {
  const p = parseYmd(date)!;
  return (new Date(Date.UTC(p.y, p.m0, p.d)).getUTCDay() + 6) % 7;
}
