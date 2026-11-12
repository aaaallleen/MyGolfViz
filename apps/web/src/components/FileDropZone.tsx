import { clsx } from 'clsx';
import { useId, useState, type Ref } from 'react';
import { useCoarsePointer } from './useCoarsePointer';

export const isCsv = (f: File) => /\.csv$/i.test(f.name) || f.type === 'text/csv';

/**
 * One target for loading CSVs: click (or Enter/Space) opens the file picker via `onBrowse`,
 * and files can be dragged onto it. The "Upload" pill is decoration inside the button,
 * not a second control, so there is no nested interactive element.
 */
export function FileDropZone({ onFiles, onReject, onBrowse, ref }: {
  onFiles(files: File[]): void;
  /** Called with the dropped files that are not .csv; they are never passed to onFiles. */
  onReject(files: File[]): void;
  /** Opens the file picker. */
  onBrowse(): void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const [over, setOver] = useState(false);
  // Touch-first devices can't (practically) drag files in, so don't offer it there.
  const touch = useCoarsePointer();
  const titleId = useId();
  const hintId = useId();
  return (
    <button
      ref={ref}
      type="button"
      className={clsx('dropzone', over && 'is-over')}
      aria-labelledby={titleId}
      aria-describedby={hintId}
      onClick={onBrowse}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      // dragleave also fires when the pointer moves onto a child; only clear when it leaves the zone.
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
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
      <svg className="dropzone__icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 15V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
      </svg>
      <span id={titleId} className="dropzone__title">{over ? 'Drop to load Session CSV' : touch ? 'Upload Session CSV' : 'Drag or upload Session CSV'}</span>
      <span id={hintId} className="dropzone__hint">One or more FlightScope .csv exports</span>
      <span className="dropzone__cta fsa-btn fsa-btn--primary" aria-hidden="true">Upload</span>
    </button>
  );
}
