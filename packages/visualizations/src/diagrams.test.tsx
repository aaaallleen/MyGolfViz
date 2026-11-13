import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FaceImpactDiagram } from './FaceImpact';
import { SPIN_DISPLAY_SLOWDOWN, SpinBallDiagram } from './SpinBall';

const num = (el: Element, a: string) => Number(el.getAttribute(a));
const role = (c: HTMLElement, r: string) => c.querySelector(`[data-role="${r}"]`);
const roles = (c: HTMLElement, r: string) => Array.from(c.querySelectorAll(`[data-role="${r}"]`));
/** Drawn angle of a line above the horizontal, in degrees. */
const lineAngle = (el: Element) =>
  (Math.atan2(num(el, 'y1') - num(el, 'y2'), num(el, 'x2') - num(el, 'x1')) * 180) / Math.PI;


test('spin ball (3000, 10): readouts and Derived tags', () => {
  const { container } = render(<SpinBallDiagram spin={3000} spinAxis={10} />);
  const t = container.textContent!.replace(/\s+/g, ' ');
  for (const s of ['Total spin 3,000 rpm', 'Spin axis 10.0° R', 'Backspin ≈ 2,954 rpm', 'Sidespin ≈ 521 rpm R',
    'Viewed from behind the ball · axis tilted right = ball curves right', 'Illustrative'])
    expect(t).toContain(s);
  expect(roles(container, 'surface-mark')).toHaveLength(12);
  expect(role(container, 'ball')).not.toBeNull();
  const row = within(container).getByText('Backspin ≈').closest('li')!;
  expect(row.textContent).toContain('Derived');
});

const axisEnds = (c: HTMLElement) => {
  const l = role(c, 'spin-axis')!;
  const p = [{ x: num(l, 'x1'), y: num(l, 'y1') }, { x: num(l, 'x2'), y: num(l, 'y2') }];
  p.sort((a, b) => a.x - b.x);
  return { left: p[0]!, right: p[1]! };
};

test('spin axis +10 lowers the right end; −10 reverses; 0 is level', () => {
  const plus = axisEnds(render(<SpinBallDiagram spin={3000} spinAxis={10} />).container);
  expect(plus.right.y).toBeGreaterThan(plus.left.y);
  const minus = axisEnds(render(<SpinBallDiagram spin={3000} spinAxis={-10} />).container);
  expect(minus.right.y).toBeLessThan(minus.left.y);
  const zero = axisEnds(render(<SpinBallDiagram spin={3000} spinAxis={0} />).container);
  expect(Math.abs(zero.right.y - zero.left.y)).toBeLessThanOrEqual(0.5);
});

test('axis 0: the top spin-arrow points screen-right', () => {
  const { container } = render(<SpinBallDiagram spin={3000} spinAxis={0} />);
  const arrows = roles(container, 'spin-arrow').map((a) => {
    const pts = a.getAttribute('points')!.trim().split(/\s+/).map((s) => s.split(',').map(Number) as [number, number]);
    const [tip, b1, b2] = pts as [[number, number], [number, number], [number, number]];
    return { y: (b1[1] + b2[1] + tip[1]) / 3, dx: tip[0] - (b1[0] + b2[0]) / 2 };
  });
  expect(arrows.length).toBeGreaterThan(0);
  const topArrow = arrows.reduce((a, b) => (b.y < a.y ? b : a));
  expect(topArrow.dx).toBeGreaterThan(0);
});

let frame: { id: number; cb: FrameRequestCallback }[] = [];
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); frame = []; });

test('Play rotation moves surface marks (rAF), Pause stops, label shown', () => {
  let id = 0;
  const cancelled = new Set<number>();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const f = { id: ++id, cb }; frame.push(f); return f.id;
  });
  vi.stubGlobal('cancelAnimationFrame', (i: number) => { cancelled.add(i); });
  const tick = (ts: number) => act(() => {
    const run = frame.filter((f) => !cancelled.has(f.id)); frame = [];
    run.forEach((f) => f.cb(ts));
  });
  const { container } = render(<SpinBallDiagram spin={3000} spinAxis={10} />);
  expect(SPIN_DISPLAY_SLOWDOWN).toBe(50);
  const pos = () => roles(container, 'surface-mark').map((m) => `${m.getAttribute('cx')},${m.getAttribute('cy')}`).join('|');
  const before = pos();
  expect(frame).toHaveLength(0); // paused initially
  fireEvent.click(screen.getByRole('button', { name: 'Play rotation' }));
  expect(screen.getByRole('button', { name: 'Pause rotation' })).toBeInTheDocument();
  expect(container.textContent).toContain('Rotation shown 50× slower than measured');
  tick(0); tick(100); tick(200);
  const moved = pos();
  expect(moved).not.toBe(before);
  fireEvent.click(screen.getByRole('button', { name: 'Pause rotation' }));
  expect(cancelled.size).toBeGreaterThan(0);
  tick(300); tick(400);
  expect(pos()).toBe(moved);
});

test('axis null: no axis or ring, not measured, no derived rows; both null → message', () => {
  const { container } = render(<SpinBallDiagram spin={3000} spinAxis={null} />);
  expect(role(container, 'spin-axis')).toBeNull();
  expect(role(container, 'spin-ring')).toBeNull();
  expect(role(container, 'spin-arrow')).toBeNull();
  const t = container.textContent!;
  expect(t).toContain('Spin axis · –Not measured');
  expect(t).not.toContain('Backspin');
  expect(t).not.toContain('Sidespin');
  const s = render(<SpinBallDiagram spin={null} spinAxis={10} />);
  expect(s.container.textContent).toContain('Total spin · –Not measured');
  expect(within(s.container).getByRole('button', { name: 'Play rotation' })).toBeDisabled();
  const both = render(<SpinBallDiagram spin={null} spinAxis={null} />);
  expect(both.container.textContent).toContain('Ball spin not measured for this shot');
});

const face = (o: Partial<Parameters<typeof FaceImpactDiagram>[0]> = {}) =>
  ({ category: 'driver' as const, handedness: 'right' as const, selected: { x: 0.62, y: 0.3 }, others: [{ x: -0.2, y: 0.1 }, { x: 0.4, y: -0.5 }], showOthers: true, ...o });

test('face impact: selected marker present/absent; others iff showOthers', () => {
  const a = render(<FaceImpactDiagram {...face()} />);
  expect(roles(a.container, 'selected-impact')).toHaveLength(1);
  expect(roles(a.container, 'other-impact')).toHaveLength(2);
  const b = render(<FaceImpactDiagram {...face({ selected: null, showOthers: false })} />);
  expect(roles(b.container, 'selected-impact')).toHaveLength(0);
  expect(roles(b.container, 'other-impact')).toHaveLength(0);
  expect(a.container.textContent).toContain('Grid 0.5 in');
});

test('face impact orientation: right-handed toe left, positive lateral left of centre; left-handed mirrors', () => {
  const rh = render(<FaceImpactDiagram {...face()} />).container;
  const cx = num(role(rh, 'face-center')!, 'x1');
  expect(num(role(rh, 'toe-label')!, 'x')).toBeLessThan(num(role(rh, 'heel-label')!, 'x'));
  expect(num(role(rh, 'selected-impact')!, 'cx')).toBeCloseTo(cx - 0.62 * 40, 5);
  const lh = render(<FaceImpactDiagram {...face({ handedness: 'left' })} />).container;
  expect(num(role(lh, 'toe-label')!, 'x')).toBeGreaterThan(num(role(lh, 'heel-label')!, 'x'));
  expect(num(role(lh, 'selected-impact')!, 'cx')).toBeCloseTo(num(role(lh, 'face-center')!, 'x1') + 0.62 * 40, 5);
});

test('face impact: positive y above centre; data-category; no provisional note', () => {
  const { container } = render(<FaceImpactDiagram {...face({ category: 'iron' })} />);
  const cy = num(role(container, 'face-center-h')!, 'y1');
  expect(num(role(container, 'selected-impact')!, 'cy')).toBeCloseTo(cy - 0.3 * 40, 5);
  expect(container.querySelector('svg')).toHaveAttribute('data-category', 'iron');
  expect(container.textContent!.toLowerCase()).not.toContain('provisional');
});
