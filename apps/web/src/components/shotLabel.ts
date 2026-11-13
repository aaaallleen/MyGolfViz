import { formatMeasurement, MISSING_MARK, type Shot, type SourceFile } from '@fsa/domain';

export function shotLabel(s: Shot): string {
  return `Shot ${s.shotLabel ?? s.sourceRow}`;
}

/** The 1-based ordinal of the file a shot came from, if that file is loaded. */
export function fileOrdinal(shot: Shot, files: readonly SourceFile[]): number | undefined {
  return files.find((f) => f.id === shot.fileId)?.ordinal;
}

export function carryText(s: Shot): string {
  return s.m.carry === null ? MISSING_MARK : formatMeasurement('carry', s.m.carry);
}

export function rowTitle(shot: Shot, files: readonly SourceFile[]): string {
  const f = files.find((x) => x.id === shot.fileId);
  return `File ${f?.ordinal ?? '?'} · ${f?.name ?? ''} · CSV row ${shot.sourceRow}`;
}

/** Text for a shot in a picker: club, file badge (2+ files only), shot label and carry. */
export function shotOptionLabel(s: Shot, files: readonly SourceFile[]): string {
  const badge = files.length >= 2 ? `F${fileOrdinal(s, files) ?? '?'} ` : '';
  return `${s.club} · ${badge}shot ${s.shotLabel ?? s.sourceRow} · ${carryText(s)}`;
}

/**
 * The shots a picker lists: the included ones, plus an excluded current shot at its place in display order
 * (`ordered` is every shot in the filter, excluded ones too).
 */
export function pickerShots(included: readonly Shot[], current: Shot | undefined, ordered: readonly Shot[]): Shot[] {
  if (!current || included.some((s) => s.id === current.id)) return [...included];
  const keep = new Set(included.map((s) => s.id));
  keep.add(current.id);
  return ordered.filter((s) => keep.has(s.id));
}
