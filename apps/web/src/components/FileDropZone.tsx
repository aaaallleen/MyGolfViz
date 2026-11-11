import { useState, type ReactNode } from 'react';

export const isCsv = (f: File) => /\.csv$/i.test(f.name) || f.type === 'text/csv';

export function FileDropZone({ onFiles, children }: { onFiles(files: File[]): void; children?: ReactNode }) {
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState(false);
  return (
    <div
      className={`dropzone${over ? ' is-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const all = Array.from(e.dataTransfer?.files ?? []);
        const csv = all.filter(isCsv);
        setRejected(all.length > 0 && csv.length < all.length);
        if (csv.length > 0) onFiles(csv);
      }}
    >
      <span>or drop one or more .csv files here</span>
      {rejected && <span role="status" className="dropzone__note">Only .csv files can be loaded</span>}
      {children}
    </div>
  );
}
