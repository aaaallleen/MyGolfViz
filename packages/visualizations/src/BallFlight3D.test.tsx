import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Shot } from '@fsa/domain';
import { buildReplayScene } from '@fsa/analytics';
import { BallFlight3D } from './BallFlight3D';
import { BALL } from './theme';
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
const iron = {
  id: 'i', fileId: 'f', sourceRow: 3,
  m: { swingH: 7, swingV: 50.5, aoa: -1.3, ftt: 8.6, carry: 150, lateral: 3, launchH: 0.5, height: 110, launchV: 24, descentV: 48 },
} as unknown as Shot;
const sel = buildReplayScene(driver, 'right');
const ironScene = buildReplayScene(iron, 'right');
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
  const { container } = render(<BallFlight3D selected={sel} club="Driver" sameClub={[wedgeScene, nullScene]} others={[wedgeScene, nullScene]} />);
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

test('Other shots: same club by default, All clubs adds the rest, None hides them (null flights never drawn)', () => {
  const { container } = render(<BallFlight3D selected={sel} club="Driver" sameClub={[wedgeScene, nullScene]} others={[wedgeScene, nullScene, ironScene]} />);
  const group = screen.getByRole('group', { name: 'Other shots' });
  const option = (name: string) => within(group).getByRole('button', { name });
  expect(option('Driver')).toHaveAttribute('aria-pressed', 'true');
  expect(all(container, 'other-flight')).toHaveLength(1);
  expect(Number(role(container, 'other-flight')!.getAttribute('opacity'))).toBeLessThanOrEqual(0.3);

  fireEvent.click(option('All clubs'));
  expect(option('All clubs')).toHaveAttribute('aria-pressed', 'true');
  expect(all(container, 'other-flight')).toHaveLength(2);

  fireEvent.click(option('None'));
  expect(all(container, 'other-flight')).toHaveLength(0);
  expect(all(container, 'landing')).toHaveLength(1); // only the selected shot's

  fireEvent.click(option('Driver'));
  expect(all(container, 'other-flight')).toHaveLength(1);
});

test('the Other shots choice stays when another shot is selected', () => {
  const { container, rerender } = render(<BallFlight3D selected={sel} club="Driver" sameClub={[wedgeScene]} others={[wedgeScene, ironScene]} />);
  fireEvent.click(screen.getByRole('button', { name: 'All clubs' }));
  rerender(<BallFlight3D selected={wedgeScene} club="Driver" sameClub={[sel]} others={[sel, ironScene]} />);
  expect(screen.getByRole('button', { name: 'All clubs' })).toHaveAttribute('aria-pressed', 'true');
  expect(all(container, 'other-flight')).toHaveLength(2);
});

test('the selected flight stands out: other shots are a neutral colour, the selected one is the ball colour over a dark halo', () => {
  const { container } = render(<BallFlight3D selected={sel} club="Driver" sameClub={[wedgeScene]} others={[wedgeScene]} />);
  const selected = role(container, 'ball-flight')!;
  const other = role(container, 'other-flight')!;
  expect(selected.getAttribute('stroke')).toBe(BALL);
  expect(other.getAttribute('stroke')).not.toBe(BALL);
  const halo = role(container, 'ball-flight-halo')!;
  expect(halo.getAttribute('d')).toBe(selected.getAttribute('d'));
  expect(Number(halo.getAttribute('stroke-width'))).toBeGreaterThan(Number(selected.getAttribute('stroke-width')));
  // Drawn after every other path, so nothing crosses over it.
  const order = [...container.querySelectorAll('path[data-role]')].map((p) => p.getAttribute('data-role'));
  expect(order.indexOf('ball-flight-halo')).toBeGreaterThan(order.lastIndexOf('other-flight'));
  expect(order.indexOf('ball-flight')).toBeGreaterThan(order.indexOf('ball-flight-halo'));
  // The selected landing ring matches its flight.
  const rings = all(container, 'landing');
  expect(rings[rings.length - 1]!.getAttribute('stroke')).toBe(BALL);
});

test("slider 0 → 'Launch', 50 → 'Ball flight', 100 → 'Landing' and ball sits at projected landing", () => {
  const { container } = render(<BallFlight3D selected={sel} club="Driver" sameClub={[wedgeScene]} others={[wedgeScene]} />);
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
  const { container } = render(<BallFlight3D selected={nullScene} club="Driver" sameClub={[wedgeScene]} others={[wedgeScene]} />);
  expect(container.textContent).toContain('Ball flight not measured for this shot');
  expect(role(container, 'ball-flight')).toBeNull();
  expect(all(container, 'other-flight')).toHaveLength(1);
});

test('no svg attribute contains NaN and no seconds text (normal and null-flight scenes)', () => {
  const cases: [typeof sel, typeof sel[]][] = [[sel, [wedgeScene, nullScene]], [nullScene, [wedgeScene]], [nullScene, []]];
  for (const [s, o] of cases) {
    const { container, unmount } = render(<BallFlight3D selected={s} club="Driver" sameClub={o} others={o} />);
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
  const { unmount } = render(<BallFlight3D selected={sel} club="Driver" sameClub={[]} others={[]} />);
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
