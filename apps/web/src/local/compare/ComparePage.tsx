import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router';
import { formatSessionDate, sessionTitle } from '@fsa/domain';
import { Button } from '@fsa/ui';
import { COMPARE_A, COMPARE_B } from '@fsa/visualizations';
import * as api from '../api';
import type { ShotDetail } from '../api';
import { toShot } from '../toShot';
import { CompareDiagrams } from './CompareDiagrams';
import { pairSearch, readPair, rememberedPair, rememberPair, type ComparePair } from './compareState';
import { ShotPicker } from './ShotPicker';
import { WhatChanged } from './WhatChanged';
import './compare.css';

type Slot = 'A' | 'B';
type SlotState = { status: 'loading' } | { status: 'found'; detail: ShotDetail } | { status: 'missing' } | { status: 'error' };

// The slot colours for the header and the table, from the same theme the diagrams draw with.
const COLORS = { '--compare-a': COMPARE_A, '--compare-b': COMPARE_B } as CSSProperties;
const LOADING: SlotState = { status: 'loading' };

/** One slot's shot, fetched by id. Only the newest request's answer lands; null when the slot has no id. */
function useShotSlot(id: string | null): { state: SlotState | null; retry(): void } {
  const [answer, setAnswer] = useState<{ id: string; state: SlotState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const mine = ++request.current;
    if (id === null) return;
    setAnswer({ id, state: LOADING });
    api.getShot(id).then(
      (d) => { if (request.current === mine) setAnswer({ id, state: d ? { status: 'found', detail: d } : { status: 'missing' } }); },
      () => { if (request.current === mine) setAnswer({ id, state: { status: 'error' } }); },
    );
  }, [id, attempt]);

  if (id === null) return { state: null, retry: () => {} };
  return { state: answer?.id === id ? answer.state : LOADING, retry: () => setAttempt((n) => n + 1) };
}

const foundDetail = (s: SlotState | null): ShotDetail | null => (s?.status === 'found' ? s.detail : null);
const startFrom = (d: ShotDetail) => ({ sessionId: d.session.id, club: toShot(d.shot).club });
const ownShot = (d: ShotDetail) => ({ ...startFrom(d), shotId: d.shot.id });

/** `A · Driver · F2 Shot 7 · Range practice · 7 Nov 2026`, plus ` · excluded`; the file badge shows for a session with two or more files. */
function slotLabel(slot: Slot, d: ShotDetail) {
  const s = toShot(d.shot);
  const date = formatSessionDate(d.session.date, { setByYou: false });
  const file = d.session.fileCount >= 2 ? `F${d.import.ordinal} ` : '';
  const head = `${slot} · ${s.club} · ${file}Shot ${s.shotLabel ?? s.sourceRow} · ${sessionTitle(d.session)} · `;
  return <>{head}<span className="compare-slot__date">{date}</span>{d.shot.excluded ? ' · excluded' : ''}</>;
}

function SlotCard({ slot, state, onChoose, onRetry }: { slot: Slot; state: SlotState | null; onChoose(): void; onRetry(): void }) {
  const choose = <Button onClick={onChoose}>Choose shot…</Button>;
  let label: ReactNode = `Shot ${slot}`;
  let body = choose;
  if (state?.status === 'found') {
    label = slotLabel(slot, state.detail);
    body = <Button onClick={onChoose}>Change shot…</Button>;
  } else if (state?.status === 'loading') {
    body = <p className="compare-slot__msg" role="status">Loading shot…</p>;
  } else if (state?.status === 'missing') {
    body = <><p className="compare-slot__msg">That shot is no longer in your library</p>{choose}</>;
  } else if (state?.status === 'error') {
    body = <><p className="compare-slot__msg">Couldn&apos;t load that shot</p><Button onClick={onRetry}>Retry</Button></>;
  }
  return (
    <div className={`compare-slot compare-slot--${slot.toLowerCase()}`}>
      <p className="compare-slot__label"><span className="compare-slot__swatch" aria-hidden="true" />{label}</p>
      {body}
    </div>
  );
}

export default function ComparePage() {
  const [params] = useSearchParams();
  const pair = readPair(params);
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const a = useShotSlot(pair.a);
  const b = useShotSlot(pair.b);
  const [picking, setPicking] = useState<Slot | null>(null);
  // Set by the Inspector's Compare… link; B's picker opens once A has settled, so it can start from A.
  const [pendingPickB, setPendingPickB] = useState(false);

  const aFound = foundDetail(a.state);
  const bFound = foundDetail(b.state);
  const empty = pair.a === null && pair.b === null;
  const go = (p: ComparePair) => navigate({ pathname: location.pathname, search: pairSearch(p) });

  // Remember what's shown for the Compare tab, leaving out a shot that no longer exists.
  const aMissing = a.state?.status === 'missing';
  const bMissing = b.state?.status === 'missing';
  useEffect(() => {
    if (pair.a === null && pair.b === null) return;
    rememberPair({ a: aMissing ? null : pair.a, b: bMissing ? null : pair.b });
  }, [pair.a, pair.b, aMissing, bMissing]);

  // A nav click (PUSH) to bare /compare reopens the last comparison; Back, Forward and reload (POP) don't.
  // It runs once per location, so it never fights a later change on the same page.
  useEffect(() => {
    if (!empty || navigationType !== 'PUSH') return;
    const last = rememberedPair();
    if (last) navigate({ pathname: location.pathname, search: pairSearch(last) }, { replace: true });
  }, [location.key]);

  const pickB = (location.state as { pickB?: unknown } | null)?.pickB === true;
  useEffect(() => {
    if (!pickB) return;
    setPendingPickB(true);
    // Clear the state so a reload doesn't reopen the picker.
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [pickB]);
  const aSettled = a.state?.status !== 'loading';
  useEffect(() => {
    if (!pendingPickB || !aSettled) return;
    setPendingPickB(false);
    setPicking('B');
  }, [pendingPickB, aSettled]);

  // A slot that holds a shot starts from that shot; an empty one starts from the other slot's session and club.
  const initial: Record<Slot, { sessionId: string; club: string; shotId?: string } | null> = {
    A: aFound ? ownShot(aFound) : bFound ? startFrom(bFound) : null,
    B: bFound ? ownShot(bFound) : aFound ? startFrom(aFound) : null,
  };

  return (
    <div className="compare" style={COLORS}>
      <h1>Compare</h1>
      <div className="compare-head">
        <SlotCard slot="A" state={a.state} onChoose={() => setPicking('A')} onRetry={a.retry} />
        {aFound && bFound && (
          <Button className="compare-head__swap" onClick={() => go({ a: pair.b, b: pair.a })}>Swap</Button>
        )}
        <SlotCard slot="B" state={b.state} onChoose={() => setPicking('B')} onRetry={b.retry} />
      </div>
      {empty && <p className="compare-hint">Pick two shots to see what changed</p>}
      {aFound && bFound && (
        <div className="compare-body">
          <CompareDiagrams a={toShot(aFound.shot)} b={toShot(bFound.shot)} />
          <WhatChanged a={toShot(aFound.shot)} b={toShot(bFound.shot)} />
        </div>
      )}
      {(['A', 'B'] as const).map((slot) => (
        <ShotPicker
          key={slot}
          slot={slot}
          open={picking === slot}
          onOpenChange={(open) => setPicking(open ? slot : null)}
          initial={initial[slot]}
          onPick={(id) => go(slot === 'A' ? { ...pair, a: id } : { ...pair, b: id })}
        />
      ))}
    </div>
  );
}
