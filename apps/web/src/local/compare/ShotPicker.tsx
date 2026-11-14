import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Dialog } from '@base-ui/react/dialog';
import { Button } from '@fsa/ui';
import { compareClubs, formatSessionDate } from '@fsa/domain';
import * as api from '../api';
import type { SessionRow, ShotOut } from '../api';
import { toShot } from '../toShot';
import { sessionsNewestFirst, shotPickLabel } from './compareState';
import './compare.css';

export interface ShotPickerProps {
  slot: 'A' | 'B';
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Starting session and club; null picks the newest session and its first club. */
  initial: { sessionId: string; club: string } | null;
  onPick(shotId: string): void;
}

interface Detail {
  sessionId: string;
  shots: ShotOut[];
  ordinals: Map<string, number>;
  fileCount: number;
}

export function ShotPicker({ slot, open, onOpenChange, initial, onPick }: ShotPickerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog shot-picker">
          <Dialog.Title className="dialog__title">{`Choose shot ${slot}`}</Dialog.Title>
          <PickerBody initial={initial} onOpenChange={onOpenChange} onPick={onPick} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PickerBody({ initial, onOpenChange, onPick }: Pick<ShotPickerProps, 'initial' | 'onOpenChange' | 'onPick'>) {
  const ids = { session: useId(), club: useId(), shot: useId() };
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pickedSession, setPickedSession] = useState<string | null>(initial?.sessionId ?? null);
  const [pickedClub, setPickedClub] = useState<string | null>(initial?.club ?? null);
  const [shotId, setShotId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);

  // The chosen session, falling back to the newest; the club likewise falls back to the session's first.
  const session = sessions?.find((s) => s.id === pickedSession) ?? sessions?.[0] ?? null;
  const clubs = session ? session.clubs.map((c) => c.club).sort(compareClubs) : [];
  const club = pickedClub !== null && clubs.includes(pickedClub) ? pickedClub : (clubs[0] ?? '');
  const sessionId = session?.id ?? null;

  useEffect(() => {
    const mine = ++listRequest.current;
    setFailed(false);
    api.listSessions().then(
      (rows) => { if (listRequest.current === mine) setSessions(sessionsNewestFirst(rows)); },
      () => { if (listRequest.current === mine) setFailed(true); },
    );
  }, [attempt]);

  useEffect(() => {
    if (sessionId === null) return;
    const mine = ++detailRequest.current;
    setDetail(null);
    Promise.all([api.getSession(sessionId), api.getShots(sessionId)]).then(
      ([d, shots]) => {
        if (detailRequest.current !== mine) return;
        setDetail({ sessionId, shots, ordinals: new Map(d.imports.map((i) => [i.id, i.ordinal])), fileCount: d.imports.length });
      },
      () => { if (detailRequest.current === mine) setFailed(true); },
    );
  }, [sessionId, attempt]);

  if (failed) {
    return (
      <div className="shot-picker__state">
        <p className="dialog__body">Couldn&apos;t load your sessions</p>
        <div className="dialog__actions">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setSessions(null); setAttempt((n) => n + 1); }}>Retry</Button>
        </div>
      </div>
    );
  }
  if (sessions === null) return <p className="dialog__body">Loading sessions…</p>;
  if (sessions.length === 0) {
    return (
      <div className="shot-picker__state">
        <p className="dialog__body">No saved sessions yet</p>
        <div className="dialog__actions">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Link to="/import" className="fsa-btn fsa-btn--primary fsa-touch" onClick={() => onOpenChange(false)}>Import a CSV</Link>
        </div>
      </div>
    );
  }

  const options = (detail && detail.sessionId === sessionId ? detail : null)?.shots
    .filter((s) => toShot(s).club === club)
    .sort((x, y) => (detail!.ordinals.get(x.importId) ?? 0) - (detail!.ordinals.get(y.importId) ?? 0) || x.sourceRow - y.sourceRow)
    .map((s) => ({ id: s.id, label: shotPickLabel(toShot(s), detail!.ordinals.get(s.importId), detail!.fileCount, s.excluded) }));
  const chosen = options?.some((o) => o.id === shotId) ? shotId : '';

  return (
    <>
      <div className="shot-picker__field">
        <label htmlFor={ids.session}>Session</label>
        <select id={ids.session} className="fsa-select fsa-touch" value={session?.id ?? ''}
          onChange={(e) => { setPickedSession(e.target.value); setShotId(''); }}>
          {sessions.map((s) => <option key={s.id} value={s.id}>{`${s.name} · ${formatSessionDate(s.date, { setByYou: false })}`}</option>)}
        </select>
      </div>
      <div className="shot-picker__field">
        <label htmlFor={ids.club}>Club</label>
        <select id={ids.club} className="fsa-select fsa-touch" value={club}
          onChange={(e) => { setPickedClub(e.target.value); setShotId(''); }}>
          {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="shot-picker__field">
        <label htmlFor={ids.shot}>Shot</label>
        <select id={ids.shot} className="fsa-select fsa-touch" value={chosen} disabled={!options}
          onChange={(e) => setShotId(e.target.value)}>
          <option value="">Choose a shot</option>
          {options?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div className="dialog__actions">
        <Dialog.Close render={<Button />}>Cancel</Dialog.Close>
        <Button variant="primary" disabled={chosen === ''} onClick={() => { onPick(chosen); onOpenChange(false); }}>Choose</Button>
      </div>
    </>
  );
}
