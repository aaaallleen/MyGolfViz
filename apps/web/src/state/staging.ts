import type { Shot, SourceFile, WorkingSet } from '@fsa/domain';
import type { ParseResult } from '@fsa/csv-parser';

export interface IncomingFile { name: string; byteLength: number; sha256: string; parse: ParseResult }
export interface PreviewFile extends IncomingFile { key: string; duplicateOf: string | null; include: boolean }

export function stageFiles(existing: readonly PreviewFile[], incoming: readonly IncomingFile[], makeKey: () => string): PreviewFile[] {
  const out = [...existing];
  for (const f of incoming) {
    const dup = out.find((e) => e.sha256 === f.sha256);
    out.push({
      ...f,
      key: makeKey(),
      duplicateOf: dup ? dup.key : null,
      include: !dup && f.parse.ok,
    });
  }
  return out;
}

export function buildWorkingSet(staged: readonly PreviewFile[]): WorkingSet {
  const files: SourceFile[] = [];
  const shots: Shot[] = [];
  for (const f of staged) {
    if (!f.include || !f.parse.ok) continue;
    files.push({
      id: f.key,
      name: f.name,
      ordinal: files.length + 1,
      sha256: f.sha256,
      byteLength: f.byteLength,
      parserVersion: f.parse.parserVersion,
    });
    const fileShots = [...f.parse.shots].sort((a, b) => a.sourceRow - b.sourceRow);
    for (const s of fileShots) shots.push({ ...s, id: `${f.key}:${s.sourceRow}`, fileId: f.key });
  }
  return { files, shots };
}
