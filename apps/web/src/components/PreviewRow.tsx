import { fieldDef } from '@fsa/domain';
import type { PreviewFile } from '../state/staging';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PreviewRow({ file, duplicateOfName, onInclude, onRemove }: {
  file: PreviewFile;
  duplicateOfName: string | null;
  onInclude(include: boolean): void;
  onRemove(): void;
}) {
  const p = file.parse;
  const warnings = p.warnings;
  return (
    <li className="preview-row">
      <div className="preview-row__main">
        <label className="preview-row__name fsa-touch">
          <input type="checkbox" checked={file.include} disabled={!p.ok} onChange={(e) => onInclude(e.target.checked)} aria-label={`Include ${file.name}`} />
          <span>{file.name}</span>
        </label>
        {p.ok ? (
          <>
            <span className="preview-row__note">{`${plural(p.shots.length, 'shot', 'shots')} · ${plural(p.summaryRows.length, 'summary row', 'summary rows')} excluded`}</span>
            {file.duplicateOf && !file.include && (
              <span className="preview-row__warn">{`Byte-identical to ${duplicateOfName ?? 'another file'} · not included`}</span>
            )}
            {p.columns.missing.length > 0 && (
              <span className="preview-row__warn">{`Missing columns: ${p.columns.missing.map((k) => fieldDef(k).label).join(', ')}`}</span>
            )}
            {warnings.length > 0 && (
              <details className="preview-row__details">
                <summary className="fsa-touch">{plural(warnings.length, 'warning', 'warnings')}</summary>
                <ul>
                  {warnings.map((w, i) => (
                    <li key={i}>
                      {w.message}
                      {w.row != null ? ` · row ${w.row}` : ''}
                      {w.column ? ` · ${w.column}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <span className="preview-row__danger">{`Cannot analyze: ${p.error?.message ?? 'unreadable file'}`}</span>
        )}
      </div>
      <button type="button" className="preview-row__remove fsa-touch" aria-label={`Remove ${file.name}`} onClick={onRemove}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8" /></svg>
      </button>
    </li>
  );
}
