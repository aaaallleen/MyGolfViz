import type { Shot, WorkingSet } from '@fsa/domain';

export interface Filters { club: string | null; fileId: string | null }

export function filterShots(ws: WorkingSet, f: Filters): Shot[] {
  return ws.shots.filter((s) => (f.club === null || s.club === f.club) && (f.fileId === null || s.fileId === f.fileId));
}

/** Stable group-by-club, clubs in first-appearance order. */
export function displayOrder(shots: readonly Shot[]): Shot[] {
  const groups = new Map<string, Shot[]>();
  for (const s of shots) {
    const g = groups.get(s.club);
    if (g) g.push(s); else groups.set(s.club, [s]);
  }
  return [...groups.values()].flat();
}

/** Content-based key for a shot: survives re-import, unlike the shot id. */
export function exclusionKey(sha256: string, sourceRow: number): string {
  return `${sha256}:${sourceRow}`;
}

/** Ids of the shots in `ws` whose exclusion key is in `excluded`. */
export function excludedShotIds(ws: WorkingSet, excluded: ReadonlySet<string>): Set<string> {
  const sha = new Map(ws.files.map((f) => [f.id, f.sha256]));
  const ids = new Set<string>();
  for (const s of ws.shots) {
    const h = sha.get(s.fileId);
    if (h !== undefined && excluded.has(exclusionKey(h, s.sourceRow))) ids.add(s.id);
  }
  return ids;
}

/** Counts included shots only; a club whose shots are all excluded stays, with count 0. */
export function clubCounts(shots: readonly Shot[], excludedIds: ReadonlySet<string> = new Set()): { club: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of shots) counts.set(s.club, (counts.get(s.club) ?? 0) + (excludedIds.has(s.id) ? 0 : 1));
  return [...counts].map(([club, count]) => ({ club, count }));
}

export function reconcileSelection(selectedId: string | null, visible: readonly Shot[]): string | null {
  if (selectedId !== null && visible.some((s) => s.id === selectedId)) return selectedId;
  return visible[0]?.id ?? null;
}

export function stepSelection(selectedId: string | null, visible: readonly Shot[], delta: 1 | -1): string | null {
  const i = selectedId === null ? -1 : visible.findIndex((s) => s.id === selectedId);
  if (i < 0) return visible[0]?.id ?? null;
  const next = Math.min(visible.length - 1, Math.max(0, i + delta));
  return visible[next]!.id;
}

export function selectionPosition(selectedId: string | null, visible: readonly Shot[]): { index: number; total: number } | null {
  if (selectedId === null) return null;
  const i = visible.findIndex((s) => s.id === selectedId);
  return i < 0 ? null : { index: i + 1, total: visible.length };
}

/** After excluding `id` (already in `excludedIds`): next included shot, else previous, else null. */
export function nextAfterExclude(id: string, ordered: readonly Shot[], excludedIds: ReadonlySet<string>): string | null {
  const i = ordered.findIndex((s) => s.id === id);
  if (i < 0) return null;
  for (let j = i + 1; j < ordered.length; j++) if (!excludedIds.has(ordered[j]!.id)) return ordered[j]!.id;
  for (let j = i - 1; j >= 0; j--) if (!excludedIds.has(ordered[j]!.id)) return ordered[j]!.id;
  return null;
}
