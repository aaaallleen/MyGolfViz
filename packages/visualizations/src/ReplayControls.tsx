import { useEffect, useRef, useState } from 'react';
import { BALL_EDGE, BORDER, INK, MUTED, SURFACE } from './theme';

const PASS_MS = 4000;
const STEP = 0.02;
const SPEEDS = [0.25, 0.5, 1] as const;
type Speed = (typeof SPEEDS)[number];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** rAF-driven replay clock. One pass takes 4 s divided by speed; paused initially. */
export function useReplayClock(opts: { initial: number }) {
  const [progress, setProgressState] = useState(opts.initial);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(0.5);
  const [loop, setLoop] = useState(true);
  const ref = useRef(progress);

  const setProgress = (p: number) => { const c = clamp01(p); ref.current = c; setProgressState(c); };

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | null = null;
    const frame = (ts: number) => {
      const dt = last === null ? 0 : ts - last;
      last = ts;
      const next = ref.current + (dt * speed) / PASS_MS;
      if (next >= 1) {
        if (loop) setProgress(next % 1);
        else { setProgress(1); setPlaying(false); return; }
      } else setProgress(next);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, loop]);

  return {
    progress, setProgress, playing, speed, setSpeed, loop, setLoop,
    toggle: () => { if (!playing && ref.current >= 1) setProgress(0); setPlaying((p) => !p); },
    step: (delta: number) => setProgress(ref.current + delta),
  };
}

export type ReplayClock = ReturnType<typeof useReplayClock>;

const btn = { border: `1px solid ${BORDER}`, background: 'transparent', color: INK, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;

export function ReplayControls({ clock, phases, active }: { clock: ReplayClock; phases: string[]; active?: string }) {
  const { progress, playing } = clock;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px' }}>
      <button type="button" aria-label="Step back one frame" onClick={() => clock.step(-STEP)} style={{ ...btn, width: 44, height: 44 }}>
        <svg aria-hidden="true" width={16} height={16} viewBox="0 0 16 16" fill={INK}><path d="M12 3v10L5 8z" /><rect x={3} y={3} width={2} height={10} /></svg>
      </button>
      <button type="button" aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={clock.toggle}
        style={{ ...btn, width: 52, height: 52, borderRadius: 26, border: 0, background: INK }}>
        <svg aria-hidden="true" width={18} height={18} viewBox="0 0 18 18" fill={BALL_EDGE}>
          {playing ? <path d="M4 3h3.5v12H4zM10.5 3H14v12h-3.5z" /> : <path d="M5 2.5v13l11-6.5z" />}
        </svg>
      </button>
      <button type="button" aria-label="Step forward one frame" onClick={() => clock.step(STEP)} style={{ ...btn, width: 44, height: 44 }}>
        <svg aria-hidden="true" width={16} height={16} viewBox="0 0 16 16" fill={INK}><path d="M4 3v10l7-5z" /><rect x={11} y={3} width={2} height={10} /></svg>
      </button>
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <input type="range" min={0} max={100} value={Math.round(progress * 100)} aria-label="Replay position"
          onChange={(e) => clock.setProgress(Number(e.target.value) / 100)}
          style={{ width: '100%', minHeight: 44, accentColor: INK, margin: 0 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED }}>
          {phases.map((p) => <span key={p} style={p === active ? { color: INK, fontWeight: 600 } : undefined}>{p}</span>)}
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: MUTED, fontSize: 13 }}>Speed
        <select value={String(clock.speed)} onChange={(e) => clock.setSpeed(Number(e.target.value) as Speed)}
          style={{ minHeight: 44, padding: '0 10px', borderRadius: 8, border: `1px solid ${BORDER}`, background: SURFACE, color: INK, font: 'inherit' }}>
          {SPEEDS.map((s) => <option key={s} value={String(s)}>{`${s}×`}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: MUTED }}>
        <input type="checkbox" checked={clock.loop} onChange={() => clock.setLoop(!clock.loop)} style={{ width: 16, height: 16, accentColor: INK }} />Loop
      </label>
    </div>
  );
}
