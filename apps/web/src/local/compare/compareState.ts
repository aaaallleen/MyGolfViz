import { formatMeasurement, MISSING_MARK, type Shot } from '@fsa/domain';

export interface ComparePair {
  a: string | null;
  b: string | null;
}

const idOf = (v: string | null): string | null => (v !== null && v.trim() !== '' ? v : null);

/** The two shot ids in a Compare URL; an empty or whitespace value is no shot. */
export function readPair(search: URLSearchParams): ComparePair {
  return { a: idOf(search.get('a')), b: idOf(search.get('b')) };
}

/** The query string for a pair: '', '?a=x', '?b=y' or '?a=x&b=y'. */
export function pairSearch(p: ComparePair): string {
  const parts: string[] = [];
  if (p.a !== null) parts.push(`a=${encodeURIComponent(p.a)}`);
  if (p.b !== null) parts.push(`b=${encodeURIComponent(p.b)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// In memory only: it lasts until the page reloads, by design.
let remembered: ComparePair | null = null;

export function rememberPair(p: ComparePair): void {
  remembered = p.a === null && p.b === null ? null : { a: p.a, b: p.b };
}

export function rememberedPair(): ComparePair | null {
  return remembered;
}

/** Sessions by date, then by when they were created, newest first. Does not mutate the input. */
export function sessionsNewestFirst<T extends { date: string; createdAt: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((x, y) => y.date.localeCompare(x.date) || y.createdAt.localeCompare(x.createdAt));
}

/** A shot in the Compare picker: `F2 Shot 7 · 248.3 yd · 104.2 mph (excluded)`; the file badge shows with 2+ files. */
export function shotPickLabel(s: Shot, fileOrdinal: number | undefined, fileCount: number, excluded: boolean): string {
  const badge = fileCount >= 2 ? `F${fileOrdinal ?? '?'} ` : '';
  const num = (key: 'carry' | 'clubSpeed') => (s.m[key] === null ? MISSING_MARK : formatMeasurement(key, s.m[key]));
  return `${badge}Shot ${s.shotLabel ?? s.sourceRow} · ${num('carry')} · ${num('clubSpeed')}${excluded ? ' (excluded)' : ''}`;
}
