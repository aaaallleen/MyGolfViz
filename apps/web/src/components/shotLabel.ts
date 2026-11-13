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

/** A picker option: every shot in the filter is listed, and excluded ones say so. */
export function pickerOptionLabel(s: Shot, files: readonly SourceFile[], excludedIds: ReadonlySet<string>): string {
  return excludedIds.has(s.id) ? `${shotOptionLabel(s, files)} (excluded)` : shotOptionLabel(s, files);
}
