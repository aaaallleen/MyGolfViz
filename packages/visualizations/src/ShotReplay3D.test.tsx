import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Shot } from '@fsa/domain';
import { buildReplayScene } from '@fsa/analytics';
import { ShotReplay3D } from './ShotReplay3D';
import { cameraFor, projectPoint } from './camera';

const shot = {
  id: 's', fileId: 'f', sourceRow: 1,
  m: { swingH: 7, swingV: 50.5, aoa: -1.3, ftt: 8.6, carry: 198.9, lateral: 10.4, launchH: 2.2, height: 149.7, launchV: 19.1, descentV: 54.6 },
} as unknown as Shot;
const emptyShot = { id: 'e', fileId: 'f', sourceRow: 1, m: {
  swingH: null, swingV: null, aoa: null, ftt: null, carry: null, lateral: null, launchH: null, height: null, launchV: null, descentV: null,
} } as unknown as Shot;
const scene = buildReplayScene(shot, 'right');
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

test('banner copy; no seconds text in the svg', () => {
  const { container } = render(<ShotReplay3D scene={scene} aoa={-1.3} vPlane={50.5} />);
  expect(container.textContent).toContain('Illustrative reconstruction');
  expect(container.textContent).toContain('The club trajectory is inferred from launch-monitor measurements at impact. It is not captured swing motion.');
  const svgText = container.querySelector('svg')!.textContent!;
  expect(svgText).not.toMatch(/\d+(\.\d+)?\s?s\b/);
  expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 800 480');
});

test("camera buttons: Perspective pressed by default; clicking Top shows 'Top camera'", () => {
  const { container } = render(<ShotReplay3D scene={scene} aoa={-1.3} vPlane={50.5} />);
  expect(screen.getByRole('button', { name: 'Perspective' })).toHaveAttribute('aria-pressed', 'true');
  expect(container.textContent).toContain('Perspective camera');
  fireEvent.click(screen.getByRole('button', { name: 'Top' }));
  expect(screen.getByRole('button', { name: 'Top' })).toHaveAttribute('aria-pressed', 'true');
  expect(container.textContent).toContain('Top camera');
});

test('Show toggles: V-plane off removes v-plane; Face direction off by default, on adds it', () => {
  const { container } = render(<ShotReplay3D scene={scene} aoa={-1.3} vPlane={50.5} />);
  expect(role(container, 'v-plane')).not.toBeNull();
  expect(role(container, 'face-direction')).toBeNull();
  fireEvent.click(screen.getByLabelText('V-plane'));
  expect(role(container, 'v-plane')).toBeNull();
  fireEvent.click(screen.getByLabelText('Face direction'));
  expect(role(container, 'face-direction')).not.toBeNull();
  fireEvent.click(screen.getByLabelText('Club arc'));
  expect(role(container, 'club-arc')).toBeNull();
  fireEvent.click(screen.getByLabelText('Angle of attack'));
  expect(role(container, 'aoa-label')).toBeNull();
  fireEvent.click(screen.getByLabelText('Ball flight'));
  expect(role(container, 'ball-flight')).toBeNull();
});

test('defaults: progress 30, speed 0.5×, loop on, nothing autoplays', () => {
  render(<ShotReplay3D scene={scene} aoa={-1.3} vPlane={50.5} />);
  expect(slider().value).toBe('30');
  expect(screen.getByLabelText('Speed')).toHaveValue('0.5');
  expect(screen.getByLabelText('Loop')).toBeChecked();
  expect(live()).toBe(0);
});

test('slider phases and ball at projected landing at 100', () => {
  const { container } = render(<ShotReplay3D scene={scene} aoa={-1.3} vPlane={50.5} />);
  const phase = () => container.querySelector('svg')!.textContent!;
  for (const [v, name] of [[0, 'Downswing'], [32, 'Impact'], [60, 'Ball flight'], [100, 'Landing']] as const) {
    fireEvent.change(slider(), { target: { value: String(v) } });
    expect(phase()).toContain(name);
  }
  const cam = cameraFor('perspective', scene, 800);
  const p = projectPoint(scene.landing!, cam, { width: 800, height: 480 })!;
  const ball = role(container, 'ball')!;
  expect(Number(ball.getAttribute('cx'))).toBeCloseTo(p.x, 1);
  expect(Number(ball.getAttribute('cy'))).toBeCloseTo(p.y, 1);
});

test('step buttons move by 0.02', () => {
  render(<ShotReplay3D scene={scene} aoa={-1.3} vPlane={50.5} />);
  fireEvent.click(screen.getByRole('button', { name: 'Step forward one frame' }));
  expect(slider().value).toBe('32');
  fireEvent.click(screen.getByRole('button', { name: 'Step back one frame' }));
  fireEvent.click(screen.getByRole('button', { name: 'Step back one frame' }));
  expect(slider().value).toBe('28');
});

test('Play toggles label, advances via rAF, Pause cancels; unmount cancels', () => {
  const { unmount } = render(<ShotReplay3D scene={scene} aoa={-1.3} vPlane={50.5} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
  expect(screen.getByRole('button', { name: 'Pause replay' })).toBeInTheDocument();
  tick(0); tick(400); // 0.5× → 8 s per pass → +0.05
  expect(Number(slider().value)).toBe(35);
  fireEvent.click(screen.getByRole('button', { name: 'Pause replay' }));
  expect(live()).toBe(0);
  expect(screen.getByRole('button', { name: 'Play replay' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
  expect(live()).toBe(1);
  unmount();
  expect(live()).toBe(0);
});

test('without loop playback stops at the end; with loop it wraps', () => {
  render(<ShotReplay3D scene={scene} aoa={-1.3} vPlane={50.5} />);
  fireEvent.change(slider(), { target: { value: '99' } });
  fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
  tick(0); tick(1000);
  expect(Number(slider().value)).toBeLessThan(20); // wrapped
  fireEvent.click(screen.getByLabelText('Loop'));
  fireEvent.change(slider(), { target: { value: '99' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pause replay' }));
  fireEvent.click(screen.getByRole('button', { name: 'Play replay' }));
  tick(2000); tick(3000);
  expect(slider().value).toBe('100');
  expect(screen.getByRole('button', { name: 'Play replay' })).toBeInTheDocument();
  expect(live()).toBe(0);
});

test("plane null → no v-plane or club-arc, note shown", () => {
  const s = buildReplayScene({ ...shot, m: { ...shot.m, swingH: null, swingV: null } } as unknown as Shot, 'right');
  expect(s.plane).toBeNull();
  const { container } = render(<ShotReplay3D scene={s} aoa={-1.3} vPlane={null} />);
  expect(role(container, 'v-plane')).toBeNull();
  expect(role(container, 'club-arc')).toBeNull();
  expect(container.textContent).toContain('Club delivery not measured for this shot — showing ball flight only');
});

test('ballFlight null → no flight and note', () => {
  const s = buildReplayScene(emptyShot, 'right');
  const { container } = render(<ShotReplay3D scene={s} aoa={null} vPlane={null} />);
  expect(role(container, 'ball-flight')).toBeNull();
  expect(container.textContent).toContain('Ball flight not measured for this shot');
});

test("labels: 'V-plane 50.5°' and 'Attack angle 1.3° down'", () => {
  const { container } = render(<ShotReplay3D scene={scene} aoa={-1.3} vPlane={50.5} />);
  const t = container.querySelector('svg')!.textContent!;
  expect(t).toContain('V-plane 50.5°');
  expect(t).toContain('Attack angle 1.3° down');
  expect(t).toContain('Target line');
});

test('every drawn coordinate is finite (all cameras, null plane, normal scene)', () => {
  const nullPlane = buildReplayScene({ ...shot, m: { ...shot.m, swingH: null, swingV: null } } as unknown as Shot, 'left');
  for (const sc of [scene, nullPlane, buildReplayScene(emptyShot, 'right')]) {
    const { container, unmount } = render(<ShotReplay3D scene={sc} aoa={-1.3} vPlane={50.5} />);
    for (const cam of ['DTL', 'Perspective', 'Side', 'Top']) {
      fireEvent.click(screen.getByRole('button', { name: cam }));
      for (const v of ['0', '20', '33', '60', '100']) {
        fireEvent.change(slider(), { target: { value: v } });
        for (const el of Array.from(container.querySelectorAll('svg *'))) {
          for (const a of Array.from(el.attributes)) expect(a.value, `${el.tagName} ${a.name}`).not.toMatch(/NaN|Infinity|undefined/);
        }
      }
    }
    unmount();
  }
});
