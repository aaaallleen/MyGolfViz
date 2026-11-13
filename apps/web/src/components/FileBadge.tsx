import type { Shot, SourceFile } from '@fsa/domain';
import { rowTitle } from './shotLabel';

/** F1/F2 token showing which file a shot came from. Only shown when 2+ files are loaded. */
export function FileBadge({ shot, files }: { shot: Shot; files: readonly SourceFile[] }) {
  if (files.length < 2) return null;
  const ordinal = files.find((x) => x.id === shot.fileId)?.ordinal;
  return (
    <span className={`file-badge file-badge--${ordinal ?? 'unknown'}`} title={rowTitle(shot, files)}>
      F{ordinal ?? '?'}
    </span>
  );
}
