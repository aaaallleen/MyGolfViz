import { useState } from 'react';
import { Link } from 'react-router';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { toast } from 'sonner';
import { Button } from '@fsa/ui';
import { useWorkingSet } from '../state/store';
import * as api from './api';
import type { ImportRow } from './api';
import { useOpenSession } from './OpenSession';
import { DeleteSessionDialog } from './DeleteSessionDialog';
import { useReloadSession } from './useReloadSession';

const nameOf = (i: ImportRow) => i.displayName ?? i.originalFilename;
const failure = (e: unknown) => (e as { detail?: string })?.detail ?? (e instanceof Error ? e.message : 'Something went wrong.');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The saved files behind the open session: reorder, rename, download, remove, add more, delete the session. */
export function ImportsPanel() {
  const { sessionId } = useWorkingSet();
  const reload = useReloadSession();
  const { open } = useOpenSession();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ImportRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (e) {
      toast.error(failure(e));
    } finally {
      setBusy(false);
    }
  };

  if (!sessionId || !open || open.session.id !== sessionId) return null;
  const { session, imports: rows } = open;
  const imports = [...rows].sort((a, b) => a.ordinal - b.ordinal);
  const move = (index: number, by: -1 | 1) => {
    const ids = imports.map((i) => i.id);
    const a = ids[index];
    const b = ids[index + by];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[index + by] = a;
    void run(() => api.reorderImports(session.id, ids));
  };
  const rename = (i: ImportRow, value: string) => {
    const trimmed = value.trim();
    if (trimmed === nameOf(i)) return;
    void run(() => api.renameImport(i.id, trimmed === '' ? null : trimmed));
  };

  return (
    <section className="panel imports-panel" aria-labelledby="imports-heading">
      <h2 id="imports-heading">Files</h2>
      <ul className="imports-panel__list">
        {imports.map((i, index) => (
          <li key={i.id} className="imports-panel__row">
            <span className={`file-badge file-badge--${i.ordinal}`}>F{i.ordinal}</span>
            <span className="imports-panel__name">{nameOf(i)}</span>
            <span>{`${i.shotCount} shots`}</span>
            <span>{new Date(i.importedAt).toLocaleDateString()}</span>
            <span>{plural(i.warnings.length, 'warning', 'warnings')}</span>
            <div className="imports-panel__controls">
              <Button aria-label={`Move up ${nameOf(i)}`} disabled={busy || index === 0} onClick={() => move(index, -1)}>Move up</Button>
              <Button aria-label={`Move down ${nameOf(i)}`} disabled={busy || index === imports.length - 1} onClick={() => move(index, 1)}>Move down</Button>
              <input
                disabled={busy}
                key={nameOf(i)}
                className="imports-panel__rename"
                aria-label={`Rename ${nameOf(i)}`}
                defaultValue={nameOf(i)}
                onBlur={(e) => rename(i, e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
              <a className="fsa-btn fsa-touch" href={api.originalUrl(i.id)} download aria-label={`Download original ${nameOf(i)}`}>Download original</a>
              <Button aria-label={`Remove file ${nameOf(i)}`} disabled={busy} onClick={() => setRemoving(i)}>Remove file</Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="imports-panel__actions">
        <Link className="fsa-btn fsa-btn--primary fsa-touch" to={`/import?session=${session.id}`}>Load Session CSV</Link>
        <Button disabled={busy} onClick={() => setDeleting(true)}>Delete session</Button>
      </div>

      <AlertDialog.Root open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="dialog-backdrop" />
          <AlertDialog.Popup className="dialog">
            <AlertDialog.Title className="dialog__title">{`Remove “${removing ? nameOf(removing) : ''}”?`}</AlertDialog.Title>
            <AlertDialog.Description className="dialog__body">
              {`Its ${removing?.shotCount ?? 0} shots leave this session. Exclusions you set on them are kept in case you add the file again.`}
            </AlertDialog.Description>
            <div className="dialog__actions">
              <Button onClick={() => setRemoving(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => {
                const target = removing;
                setRemoving(null);
                if (target) void run(() => api.deleteImport(target.id));
              }}>Remove file</Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <DeleteSessionDialog session={session} open={deleting} onOpenChange={setDeleting} onDeleted={() => {}} />
    </section>
  );
}
