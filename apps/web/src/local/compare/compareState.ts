import { formatMeasurement, MISSING_MARK, type Shot } from '@fsa/domain';

/** The four Compare slots. A is the baseline every other shot is measured against. */
export const SLOTS = ['A', 'B', 'C', 'D'] as const;
export type Slot = (typeof SLOTS)[number];
const EXTRA_SLOTS = ['C', 'D'] as const;

/** The shots on the Compare page: A and B, plus up to two more (C, then D), always without gaps. */
export interface CompareSet {
  a: string | null;
  b: string | null;
  extra: string[];
}

export const EMPTY_SET: CompareSet = { a: null, b: null, extra: [] };
const MAX_EXTRA = SLOTS.length - 2;

const idOf = (v: string | null): string | null => (v !== null && v.trim() !== '' ? v : null);

/** The shot ids in a Compare URL; an empty or whitespace value is no shot, and a lone d moves up to C. */
export function readSet(search: URLSearchParams): CompareSet {
  const extra = [idOf(search.get('c')), idOf(search.get('d'))].filter((v): v is string => v !== null);
  return { a: idOf(search.get('a')), b: idOf(search.get('b')), extra: extra.slice(0, MAX_EXTRA) };
}

/** The query string for a set: '', '?a=x', '?a=x&b=y', '?a=x&b=y&c=z&d=w', … */
export function setSearch(p: CompareSet): string {
  const parts: string[] = [];
  if (p.a !== null) parts.push(`a=${encodeURIComponent(p.a)}`);
  if (p.b !== null) parts.push(`b=${encodeURIComponent(p.b)}`);
  p.extra.slice(0, MAX_EXTRA).forEach((id, i) => parts.push(`${'cd'[i]}=${encodeURIComponent(id)}`));
  return parts.length ? `?${parts.join('&')}` : '';
}

export const isEmptySet = (p: CompareSet): boolean => p.a === null && p.b === null && p.extra.length === 0;

/** The slot Add shot fills next (C, then D), or null when A or B is still empty or four shots are shown. */
export const nextSlot = (p: CompareSet): 'C' | 'D' | null =>
  p.a !== null && p.b !== null ? (EXTRA_SLOTS[p.extra.length] ?? null) : null;

/** Each slot that is in use, with its id: A and B always, then C and D while they hold a shot. */
export function slotIds(p: CompareSet): { slot: Slot; id: string | null }[] {
  return [{ slot: 'A', id: p.a }, { slot: 'B', id: p.b }, ...p.extra.flatMap((id, i) => {
    const slot = EXTRA_SLOTS[i];
    return slot ? [{ slot, id }] : [];
  })];
}

/** The set with one slot's shot replaced; for C or D one past the end, the shot is added. */
export function withShot(p: CompareSet, slot: Slot, id: string): CompareSet {
  if (slot === 'A') return { ...p, a: id };
  if (slot === 'B') return { ...p, b: id };
  const i = SLOTS.indexOf(slot) - 2;
  const extra = [...p.extra];
  if (i < extra.length) extra[i] = id;
  else extra.push(id);
  return { ...p, extra: extra.slice(0, MAX_EXTRA) };
}

/** The set without C or D; D moves up to C. */
export function withoutShot(p: CompareSet, slot: 'C' | 'D'): CompareSet {
  const i = SLOTS.indexOf(slot) - 2;
  return { ...p, extra: p.extra.filter((_, j) => j !== i) };
}

// In memory only: it lasts until the page reloads, by design.
let remembered: CompareSet | null = null;

export function rememberSet(p: CompareSet): void {
  remembered = isEmptySet(p) ? null : { a: p.a, b: p.b, extra: [...p.extra] };
}

export function rememberedSet(): CompareSet | null {
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
