import type { PreviewFile } from '../state/staging';
import { PreviewRow } from './PreviewRow';

export function PreviewList({ files, onInclude, onRemove }: {
  files: readonly PreviewFile[];
  onInclude(key: string, include: boolean): void;
  onRemove(key: string): void;
}) {
  if (files.length === 0) return null;
  return (
    <ul className="preview-list" aria-label="Files">
      {files.map((f) => (
        <PreviewRow
          key={f.key}
          file={f}
          duplicateOfName={files.find((o) => o.key === f.duplicateOf)?.name ?? null}
          onInclude={(inc) => onInclude(f.key, inc)}
          onRemove={() => onRemove(f.key)}
        />
      ))}
    </ul>
  );
}
