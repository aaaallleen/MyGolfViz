import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router';
import { formatSessionDate, sessionTitle } from '@fsa/domain';
import { Button } from '@fsa/ui';
import * as api from '../api';
import type { ShotDetail } from '../api';
import { toShot } from '../toShot';
import { CompareDiagrams, SLOT_COLORS } from './CompareDiagrams';
import {
  EMPTY_SET, isEmptySet, nextSlot, readSet, rememberedSet, rememberSet, setSearch, SLOTS, slotIds, withBaseline, withoutShot, withShot,
  type CompareSet, type Slot,
} from './compareState';
import { ShotPicker } from './ShotPicker';
import { WhatChanged } from './WhatChanged';
import './compare.css';

type SlotState = { status: 'loading' } | { status: 'found'; detail: ShotDetail } | { status: 'missing' } | { status: 'error' };

// The slot colours for the header and the table, from the same theme the diagrams draw with.
const COLORS = Object.fromEntries(SLOTS.map((s) => [`--compare-${s.toLowerCase()}`, SLOT_COLORS[s]])) as CSSProperties;
const LOADING: SlotState = { status: 'loading' };

// Shots already loaded on this page, by id, so Make baseline, removing C and re-picking a shot show it at once
// instead of flashing "Loading shot…". Each slot still refetches, so an edit made elsewhere lands.
const loaded = new Map<string, ShotDetail>();
/** Empties the loaded-shot memory; for tests. */
export function forgetLoadedShots(): void {
  loaded.clear();
}

/** One slot's shot, fetched by id. Only the newest request's answer lands; null when the slot has no id. */
function useShotSlot(id: string | null): { state: SlotState | null; retry(): void } {
  const [answer, setAnswer] = useState<{ id: string; state: SlotState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const mine = ++request.current;
    setAnswer(null);
    if (id === null) return;
    api.getShot(id).then(
      (d) => {
        if (d) loaded.set(id, d);
        else loaded.delete(id);
        if (request.current === mine) setAnswer({ id, state: d ? { status: 'found', detail: d } : { status: 'missing' } });
      },
      () => { if (request.current === mine) setAnswer({ id, state: { status: 'error' } }); },
    );
  }, [id, attempt]);

  if (id === null) return { state: null, retry: () => {} };
  const known = loaded.get(id);
  const waiting: SlotState = known ? { status: 'found', detail: known } : LOADING;
  return { state: answer?.id === id ? answer.state : waiting, retry: () => setAttempt((n) => n + 1) };
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

function SlotCard({ slot, state, onChoose, onRetry, onRemove, onMakeBaseline }: {
  slot: Slot;
  state: SlotState | null;
  onChoose(): void;
  onRetry(): void;
  /** C and D only: takes the shot off the page. */
  onRemove?(): void;
  /** B, C and D only: makes this shot the baseline A. */
  onMakeBaseline?(): void;
}) {
  const choose = <Button onClick={onChoose}>Choose shot…</Button>;
  let label: ReactNode = `Shot ${slot}`;
  let body = choose;
  if (state?.status === 'found') {
    label = slotLabel(slot, state.detail);
    body = (
      <div className="compare-slot__actions">
        <Button onClick={onChoose}>Change shot…</Button>
        {onMakeBaseline && <Button onClick={onMakeBaseline}>Make baseline</Button>}
      </div>
    );
  } else if (state?.status === 'loading') {
    body = <p className="compare-slot__msg" role="status">Loading shot…</p>;
  } else if (state?.status === 'missing') {
    body = <><p className="compare-slot__msg">That shot is no longer in your library</p>{choose}</>;
  } else if (state?.status === 'error') {
    body = <><p className="compare-slot__msg">Couldn&apos;t load that shot</p><Button onClick={onRetry}>Retry</Button></>;
  }
  return (
    <div className={`compare-slot compare-slot--${slot.toLowerCase()}`}>
      <div className="compare-slot__top">
        {/* One span for the text, so the flex gap only separates it from the swatch. */}
        <p className="compare-slot__label"><span className="compare-slot__swatch" aria-hidden="true" /><span>{label}</span></p>
        {slot === 'A' && <span className="compare-baseline">Baseline</span>}
        {onRemove && (
          <Button variant="ghost" className="compare-slot__remove" aria-label={`Remove shot ${slot}`} onClick={onRemove}>×</Button>
        )}
      </div>
      {body}
    </div>
  );
}

export default function ComparePage() {
  const [params] = useSearchParams();
  const set = readSet(params);
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  // One hook per slot, always called, so the hook order never changes.
  const loads: Record<Slot, ReturnType<typeof useShotSlot>> = {
    A: useShotSlot(set.a),
    B: useShotSlot(set.b),
    C: useShotSlot(set.extra[0] ?? null),
    D: useShotSlot(set.extra[1] ?? null),
  };
  const [picking, setPicking] = useState<Slot | null>(null);
  // Set by the Inspector's Compare… link; B's picker opens once A has settled, so it can start from A.
  const [pendingPickB, setPendingPickB] = useState(false);

  const slots = slotIds(set);
  const found = (slot: Slot) => foundDetail(loads[slot].state);
  const aFound = found('A');
  const bFound = found('B');
  const empty = isEmptySet(set);
  const go = (p: CompareSet) => navigate({ pathname: location.pathname, search: setSearch(p) });
  // Forget it first, so the Compare tab doesn't bring it back; Back still returns to it.
  const clear = () => {
    rememberSet(EMPTY_SET);
    go(EMPTY_SET);
  };

  // Remember what's shown for the Compare tab, leaving out shots that no longer exist.
  const missing = (slot: Slot) => loads[slot].state?.status === 'missing';
  const missingKey = SLOTS.filter(missing).join('');
  const search = setSearch(set);
  useEffect(() => {
    if (empty) return;
    rememberSet({
      a: missing('A') ? null : set.a,
      b: missing('B') ? null : set.b,
      extra: set.extra.filter((_, i) => !missing(i === 0 ? 'C' : 'D')),
    });
  }, [search, missingKey]);

  // A nav click (PUSH) to bare /compare reopens the last comparison; Back, Forward and reload (POP) don't.
  // It runs once per location, so it never fights a later change on the same page.
  useEffect(() => {
    if (!empty || navigationType !== 'PUSH') return;
    const last = rememberedSet();
    if (last) navigate({ pathname: location.pathname, search: setSearch(last) }, { replace: true });
  }, [location.key]);

  const pickB = (location.state as { pickB?: unknown } | null)?.pickB === true;
  useEffect(() => {
    if (!pickB) return;
    setPendingPickB(true);
    // Clear the state so a reload doesn't reopen the picker.
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [pickB]);
  const aSettled = loads.A.state?.status !== 'loading';
  useEffect(() => {
    if (!pendingPickB || !aSettled) return;
    setPendingPickB(false);
    setPicking('B');
  }, [pendingPickB, aSettled]);

  // A slot that holds a shot starts from that shot. An empty one starts from the baseline's session and club
  // (another chosen shot's, for an empty A).
  const initialFor = (slot: Slot): { sessionId: string; club: string; shotId?: string } | null => {
    const own = found(slot);
    if (own) return ownShot(own);
    const other = (['B', 'C', 'D'] as const).map(found).find((d) => d !== null) ?? null;
    const from = slot === 'A' ? other : aFound ?? other;
    return from ? startFrom(from) : null;
  };
  // Add shot opens the picker for the next free slot, C or D; picking a shot fills it.
  const addSlot = nextSlot(set);
  const shown = slots.flatMap(({ slot }) => {
    const d = found(slot);
    return d ? [{ slot, shot: toShot(d.shot) }] : [];
  });

  return (
    <div className="compare" style={COLORS}>
      <div className="compare-title">
        <h1>Compare</h1>
        {!empty && <Button onClick={clear}>Clear comparison</Button>}
      </div>
      <div className="compare-head">
        {slots.map(({ slot }) => (
            <SlotCard
              key={slot}
              slot={slot}
              state={loads[slot].state}
              onChoose={() => setPicking(slot)}
              onRetry={loads[slot].retry}
              onRemove={slot === 'C' || slot === 'D' ? () => go(withoutShot(set, slot)) : undefined}
              onMakeBaseline={slot === 'A' ? undefined : () => go(withBaseline(set, slot))}
            />
        ))}
        {addSlot && (
          <Button className="compare-head__add" onClick={() => setPicking(addSlot)}>+ Add shot</Button>
        )}
      </div>
      {empty && <p className="compare-hint">Pick two shots to see what changed</p>}
      {!empty && set.a === null && <p className="compare-hint">Choose shot A, the baseline, to see what changed</p>}
      {aFound && shown.length >= 2 && (
        <div className={`compare-body${shown.length > 2 ? ' compare-body--many' : ''}`}>
          <CompareDiagrams shots={shown} />
          <WhatChanged
            base={toShot(aFound.shot)}
            others={shown.flatMap((s) => (s.slot === 'A' ? [] : [{ slot: s.slot, shot: s.shot }]))}
          />
        </div>
      )}
      {SLOTS.map((slot) => (
        <ShotPicker
          key={slot}
          slot={slot}
          open={picking === slot}
          onOpenChange={(open) => setPicking(open ? slot : null)}
          initial={initialFor(slot)}
          onPick={(id) => go(withShot(set, slot, id))}
        />
      ))}
    </div>
  );
}
