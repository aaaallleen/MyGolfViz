import { formatMeasurement, MISSING_MARK, type Shot, type SourceFile } from '@fsa/domain';

export function shotLabel(s: Shot): string {
  return `Shot ${s.shotLabel ?? s.sourceRow}`;
}

export function rowTitle(shot: Shot, files: readonly SourceFile[]): string {
  const f = files.find((x) => x.id === shot.fileId);
  return `File ${f?.ordinal ?? '?'} · ${f?.name ?? ''} · CSV row ${shot.sourceRow}`;
}

/** Text for a shot in a picker: club, file badge (2+ files only), shot label and carry. */
export function shotOptionLabel(s: Shot, files: readonly SourceFile[]): string {
  const ordinal = files.find((x) => x.id === s.fileId)?.ordinal;
  const badge = files.length >= 2 ? `F${ordinal ?? '?'} ` : '';
  const carry = s.m.carry === null ? MISSING_MARK : formatMeasurement('carry', s.m.carry);
  return `${s.club} · ${badge}shot ${s.shotLabel ?? s.sourceRow} · ${carry}`;
}
