import { clsx } from 'clsx';
import { useState, type ReactNode } from 'react';

export const isCsv = (f: File) => /\.csv$/i.test(f.name) || f.type === 'text/csv';

export function FileDropZone({ onFiles, onReject, children }: {
  onFiles(files: File[]): void;
  /** Called with the dropped files that are not .csv; they are never passed to onFiles. */
  onReject(files: File[]): void;
  children?: ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={clsx('dropzone', over && 'is-over')}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const all = Array.from(e.dataTransfer?.files ?? []);
        const csv = all.filter(isCsv);
        const other = all.filter((f) => !isCsv(f));
        if (other.length > 0) onReject(other);
        if (csv.length > 0) onFiles(csv);
      }}
    >
      <span>or drop one or more .csv files here</span>
      {children}
    </div>
  );
}
