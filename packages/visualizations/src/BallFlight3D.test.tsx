import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Shot } from '@fsa/domain';
import { buildReplayScene } from '@fsa/analytics';
import { BallFlight3D } from './BallFlight3D';
import { flightCamera, projectPoint } from './camera';

const driver = {
  id: 's', fileId: 'f', sourceRow: 1,
  m: { swingH: 7, swingV: 50.5, aoa: -1.3, ftt: 8.6, carry: 198.9, lateral: 10.4, launchH: 2.2, height: 149.7, launchV: 19.1, descentV: 54.6 },
} as unknown as Shot;
const wedge = {
  id: 'w', fileId: 'f', sourceRow: 2,
  m: { swingH: 7, swingV: 50.5, aoa: -1.3, ftt: 8.6, carry: 110, lateral: -4, launchH: -1, height: 90, launchV: 30, descentV: 50 },
} as unknown as Shot;
const emptyShot = { id: 'e', fileId: 'f', sourceRow: 1, m: {
  swingH: null, swingV: null, aoa: null, ftt: null, carry: null, lateral: null, launchH: null, height: null, launchV: null, descentV: null,
} } as unknown as Shot;
const sel = buildReplayScene(driver, 'right');
const wedgeScene = buildReplayScene(wedge, 'right');
const nullScene = buildReplayScene(emptyShot, 'right');
const role = (c: HTMLElement, r: string) => c.querySelector(`[data-role="${r}"]`);
const all = (c: HTMLElement, r: string) => c.querySelectorAll(`[data-role="${r}"]`);
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

test('flight banner copy present; camera buttons with Perspective pressed; defaults', () => {
  const { container } = render(<BallFlight3D selected={sel} others={[wedgeScene, nullScene]} />);
  expect(container.textContent).toContain('Illustrative flight path');
  expect(container.textContent).toContain('Drawn from launch angle, apex height, descent angle, carry and lateral landing. It is not a measured flight track.');
  for (const n of ['DTL', 'Perspective', 'Side', 'Top']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Perspective' })).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('svg')!.textContent).toContain('Perspective camera');
  fireEvent.click(screen.getByRole('button', { name: 'Top' }));
  expect(container.querySelector('svg')!.textContent).toContain('Top camera');
  expect(slider().value).toBe('0');
  expect(screen.getByLabelText('Speed')).toHaveValue('0.5');
  expect(screen.getByLabelText('Loop')).toBeChecked();
  expect(role(container, 'ball-flight')).not.toBeNull();
  expect(live()).toBe(0);
});

test("'Show other shots' checked → 1 other-flight (null-flight skipped, opacity <= 0.3); unchecked → 0", () => {
  const { container } = render(<BallFlight3D selected={sel} others={[wedgeScene, nullScene]} />);
  const cb = screen.getByLabelText('Show other shots');
  expect(cb).toBeChecked();
  expect(all(container, 'other-flight')).toHaveLength(1);
  expect(Number(role(container, 'other-flight')!.getAttribute('opacity'))).toBeLessThanOrEqual(0.3);
  fireEvent.click(cb);
  expect(all(container, 'other-flight')).toHaveLength(0);
});

test("slider 0 → 'Launch', 50 → 'Ball flight', 100 → 'Landing' and ball sits at projected landing", () => {
  const { container } = render(<BallFlight3D selected={sel} others={[wedgeScene]} />);
  for (const [v, name] of [[0, 'Launch'], [50, 'Ball flight'], [100, 'Landing']] as const) {
    fireEvent.change(slider(), { target: { value: String(v) } });
    expect(container.querySelector('svg')!.textContent).toContain(name);
  }
  const cam = flightCamera('perspective', [sel.ballFlight!, wedgeScene.ballFlight!], 'right', 800);
  const p = projectPoint(sel.landing!, cam, { width: 800, height: 480 })!;
  const ball = role(container, 'ball')!;
  expect(Number(ball.getAttribute('cx'))).toBeCloseTo(p.x, 1);
  expect(Number(ball.getAttribute('cy'))).toBeCloseTo(p.y, 1);
  expect(slider().style.minHeight).toBe('44px');
});

test("selected flight null → note shown; others still drawn", () => {
  const { container } = render(<BallFlight3D selected={nullScene} others={[wedgeScene]} />);
  expect(container.textContent).toContain('Ball flight not measured for this shot');
  expect(role(container, 'ball-flight')).toBeNull();
  expect(all(container, 'other-flight')).toHaveLength(1);
});

test('no svg attribute contains NaN and no seconds text (normal and null-flight scenes)', () => {
  const cases: [typeof sel, typeof sel[]][] = [[sel, [wedgeScene, nullScene]], [nullScene, [wedgeScene]], [nullScene, []]];
  for (const [s, o] of cases) {
    const { container, unmount } = render(<BallFlight3D selected={s} others={o} />);
    for (const cam of ['DTL', 'Perspective', 'Side', 'Top']) {
      fireEvent.click(screen.getByRole('button', { name: cam }));
      for (const v of ['0', '3', '50', '97', '100']) {
        fireEvent.change(slider(), { target: { value: v } });
        expect(container.textContent).not.toMatch(/\d+(\.\d+)?\s?s\b/);
        for (const el of Array.from(container.querySelectorAll('svg *'))) {
          for (const a of Array.from(el.attributes)) expect(a.value, `${el.tagName} ${a.name}`).not.toMatch(/NaN|Infinity|undefined/);
        }
      }
    }
    unmount();
  }
});

test('Play toggles to "Pause replay" and advances under fake rAF; frame cancelled on unmount', () => {
  const { unmount } = render(<BallFlight3D selected={sel} others={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
  expect(screen.getByRole('button', { name: 'Pause replay' })).toBeInTheDocument();
  tick(0); tick(400);
  expect(Number(slider().value)).toBe(5);
  fireEvent.click(screen.getByRole('button', { name: 'Pause replay' }));
  expect(live()).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
  expect(live()).toBe(1);
  unmount();
  expect(live()).toBe(0);
});
