import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { toast } from 'sonner';
import { Button } from '@fsa/ui';
import { useWorkingSet } from '../state/store';
import * as api from './api';
import type { SessionRow } from './api';

/** Confirms, then deletes a saved session. Controlled so a menu item can open it. */
export function DeleteSessionDialog({
  session,
  open,
  onOpenChange,
  onDeleted,
}: {
  session: SessionRow;
  open: boolean;
  onOpenChange(open: boolean): void;
  onDeleted(id: string): void;
}) {
  const ws = useWorkingSet();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.deleteSession(session.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the session.');
      setBusy(false);
      return;
    }
    setBusy(false);
    onOpenChange(false);
    if (ws.sessionId === session.id) {
      ws.clear();
      navigate('/sessions');
    }
    onDeleted(session.id);
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="dialog-backdrop" />
        <AlertDialog.Popup className="dialog">
          <AlertDialog.Title className="dialog__title">{`Delete “${session.name}”?`}</AlertDialog.Title>
          <AlertDialog.Description className="dialog__body">
            {`This removes ${session.shotCount} shots and ${session.fileCount} files from MyGolfViz. The original CSVs on your computer are not touched.`}
          </AlertDialog.Description>
          <div className="dialog__actions">
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={confirm}>Delete session</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
