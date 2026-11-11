import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Shot } from '@fsa/domain';
import { buildReplayScene } from '@fsa/analytics';
import { ClubReplay3D } from './ClubReplay3D';

const shot = {
  id: 's', fileId: 'f', sourceRow: 1,
  m: { swingH: 7, swingV: 50.5, aoa: -1.3, ftt: 8.6, carry: 198.9, lateral: 10.4, launchH: 2.2, height: 149.7, launchV: 19.1, descentV: 54.6 },
} as unknown as Shot;
const emptyShot = { id: 'e', fileId: 'f', sourceRow: 1, m: {
  swingH: null, swingV: null, aoa: null, ftt: null, carry: null, lateral: null, launchH: null, height: null, launchV: null, descentV: null,
} } as unknown as Shot;
const scene = buildReplayScene(shot, 'right');
const show = { vPlane: true, aoa: true };
const role = (c: HTMLElement, r: string) => c.querySelector(`[data-role="${r}"]`);
const slider = () => screen.getByLabelText('Replay position') as HTMLInputElement;

let frames: { id: number; cb: FrameRequestCallback }[] = [];
const cancelled = new Set<number>();
beforeEach(() => {
  vi.useFakeTimers();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { const f = { id: ++id, cb }; frames.push(f); return f.id; });
  vi.stubGlobal('cancelAnimationFrame', (i: number) => { cancelled.add(i); });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); frames = []; cancelled.clear(); });
const tick = (ts: number) => act(() => {
  const run = frames.filter((f) => !cancelled.has(f.id)); frames = [];
  run.forEach((f) => f.cb(ts));
});
const live = () => frames.filter((f) => !cancelled.has(f.id)).length;

test('club banner copy present; no ball-flight; corner shows "Impact" by default', () => {
  const { container } = render(<ClubReplay3D scene={scene} aoa={-1.3} vPlane={50.5} show={show} />);
  expect(container.textContent).toContain('Illustrative reconstruction');
  expect(container.textContent).toContain('The club trajectory is inferred from launch-monitor measurements at impact. It is not captured swing motion.');
  expect(role(container, 'ball-flight')).toBeNull();
  expect(role(container, 'other-flight')).toBeNull();
  const t = container.querySelector('svg')!.textContent!;
  expect(t).toContain('Club at impact');
  expect(t).toContain('Impact');
  expect(slider().value).toBe('60');
  expect(screen.getByLabelText('Speed')).toHaveValue('0.5');
  expect(screen.getByLabelText('Loop')).toBeChecked();
  expect(live()).toBe(0);
});

test('show.vPlane false removes v-plane; show.aoa false removes aoa-label', () => {
  const { container, rerender } = render(<ClubReplay3D scene={scene} aoa={-1.3} vPlane={50.5} show={show} />);
  expect(role(container, 'v-plane')).not.toBeNull();
  expect(role(container, 'aoa-label')).not.toBeNull();
  rerender(<ClubReplay3D scene={scene} aoa={-1.3} vPlane={50.5} show={{ vPlane: false, aoa: true }} />);
  expect(role(container, 'v-plane')).toBeNull();
  rerender(<ClubReplay3D scene={scene} aoa={-1.3} vPlane={50.5} show={{ vPlane: true, aoa: false }} />);
  expect(role(container, 'aoa-label')).toBeNull();
  expect(role(container, 'v-plane')).not.toBeNull();
});

test("slider 0 → 'Downswing', 63 → 'Impact', 100 → 'Follow-through'", () => {
  const { container } = render(<ClubReplay3D scene={scene} aoa={-1.3} vPlane={50.5} show={show} />);
  for (const [v, name] of [[0, 'Downswing'], [63, 'Impact'], [100, 'Follow-through']] as const) {
    fireEvent.change(slider(), { target: { value: String(v) } });
    expect(container.querySelector('svg')!.textContent).toContain(name);
  }
  expect(slider().style.minHeight).toBe('44px');
});

test("plane null → no v-plane/club-arc, note 'Club delivery not measured for this shot'", () => {
  const s = buildReplayScene({ ...shot, m: { ...shot.m, swingH: null, swingV: null } } as unknown as Shot, 'right');
  const { container } = render(<ClubReplay3D scene={s} aoa={-1.3} vPlane={null} show={show} />);
  expect(role(container, 'v-plane')).toBeNull();
  expect(role(container, 'club-arc')).toBeNull();
  expect(container.textContent).toContain('Club delivery not measured for this shot');
});

test('no svg attribute contains NaN and no seconds text (normal and null-plane scenes)', () => {
  const nullPlane = buildReplayScene({ ...shot, m: { ...shot.m, swingH: null, swingV: null } } as unknown as Shot, 'left');
  for (const sc of [scene, nullPlane, buildReplayScene(emptyShot, 'right')]) {
    const { container, unmount } = render(<ClubReplay3D scene={sc} aoa={-1.3} vPlane={50.5} show={show} />);
    for (const v of ['0', '20', '60', '63', '100']) {
      fireEvent.change(slider(), { target: { value: v } });
      expect(container.textContent).not.toMatch(/\d+(\.\d+)?\s?s\b/);
      for (const el of Array.from(container.querySelectorAll('svg *'))) {
        for (const a of Array.from(el.attributes)) expect(a.value, `${el.tagName} ${a.name}`).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
    unmount();
  }
});

test('Play toggles to "Pause replay" and advances under fake rAF; frame cancelled on unmount', () => {
  const { unmount } = render(<ClubReplay3D scene={scene} aoa={-1.3} vPlane={50.5} show={show} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
  expect(screen.getByRole('button', { name: 'Pause replay' })).toBeInTheDocument();
  tick(0); tick(400); // 0.5x -> 8 s per pass -> +0.05
  expect(Number(slider().value)).toBe(65);
  fireEvent.click(screen.getByRole('button', { name: 'Pause replay' }));
  expect(live()).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
  expect(live()).toBe(1);
  unmount();
  expect(live()).toBe(0);
});

test('step buttons move by 0.02; loop wraps, no loop stops at 100', () => {
  render(<ClubReplay3D scene={scene} aoa={-1.3} vPlane={50.5} show={show} />);
  fireEvent.click(screen.getByRole('button', { name: 'Step forward one frame' }));
  expect(slider().value).toBe('62');
  fireEvent.change(slider(), { target: { value: '99' } });
  fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
  tick(0); tick(1000);
  expect(Number(slider().value)).toBeLessThan(20);
  fireEvent.click(screen.getByLabelText('Loop'));
  fireEvent.change(slider(), { target: { value: '99' } });
  tick(2000); tick(3000);
  expect(slider().value).toBe('100');
  expect(screen.getByRole('button', { name: 'Play replay' })).toBeInTheDocument();
  expect(live()).toBe(0);
});
