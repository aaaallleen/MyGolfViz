import type { SessionDetails, Shot, SourceFile, WorkingSet } from '@fsa/domain';
import { exclusionKey } from '@fsa/analytics';
import type { ImportRow, SessionRow, ShotOut } from './api';
import { toShot } from './toShot';

/** Turns a saved session's API rows into the in-memory working set the store and charts use. */
export function sessionToWorkingSet(
  session: SessionRow,
  imports: ImportRow[],
  shots: ShotOut[],
): { workingSet: WorkingSet; details: SessionDetails; excluded: Set<string> } {
  const ordered = [...imports].sort((a, b) => a.ordinal - b.ordinal);
  const files: SourceFile[] = ordered.map((i) => ({
    id: i.id,
    name: i.displayName ?? i.originalFilename,
    ordinal: i.ordinal,
    sha256: i.sha256,
    byteLength: i.byteLength,
    parserVersion: i.parserVersion,
  }));
  const fileById = new Map(files.map((f) => [f.id, f]));
  const ordinalOf = (id: string) => fileById.get(id)?.ordinal ?? Number.MAX_SAFE_INTEGER;

  const excluded = new Set<string>();
  const out: Shot[] = [...shots]
    .sort((a, b) => ordinalOf(a.importId) - ordinalOf(b.importId) || a.sourceRow - b.sourceRow)
    .map((s) => {
      const file = fileById.get(s.importId);
      if (s.excluded && file) excluded.add(exclusionKey(file.sha256, s.sourceRow));
      return toShot(s);
    });

  return {
    workingSet: { files, shots: out },
    details: { name: session.name, date: session.date, notes: session.notes, handedness: session.handedness },
    excluded,
  };
}
