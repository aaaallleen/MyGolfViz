import { fireEvent, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { DispersionStats } from '@fsa/analytics';
import { DispersionPlot, type DispersionPlotProps } from './DispersionPlot';

// x = lateral (right +), y = distance from the tee.
const iron: DispersionStats = {
  mode: 'carry',
  points: [
    { shotId: 'a', x: -20, y: 150 },
    { shotId: 'b', x: 0, y: 160 },
    { shotId: 'c', x: 10, y: 170 },
  ],
  excluded: 0,
  centroid: { x: -3, y: 160 },
  meanAbsLateral: 10,
  sdX: 12,
  sdY: 8,
  ellipse: { cx: -3, cy: 160, rx: 20, ry: 5, angleDeg: 45 },
  observedInside: 2,
  expectedCoverage: 0.39,
};
const wedge: DispersionStats = {
  ...iron,
  points: [{ shotId: 'w1', x: 2, y: 100 }, { shotId: 'w2', x: -2, y: 105 }],
  centroid: { x: 0, y: 102.5 },
  ellipse: null,
};
const groups: DispersionPlotProps['groups'] = [
  { club: '7 Iron', color: '#C98500', stats: iron },
  { club: 'Gap Wedge', color: '#E66767', stats: wedge },
];
const labelFor = (id: string) => `Shot ${id}`;
const renderPlot = (over: Partial<DispersionPlotProps> = {}) =>
  render(<DispersionPlot mode="carry" groups={groups} xMax={200} selectedId={null} highlightClub={null} onSelect={vi.fn()} labelFor={labelFor} {...over} />);
const circle = (c: HTMLElement, id: string) => c.querySelector(`circle[data-shot-id="${id}"]`)!;
const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

test('one circle per point across clubs; clicking a point calls onSelect with its id', () => {
  const onSelect = vi.fn();
  const { container } = renderPlot({ onSelect });
  expect(container.querySelectorAll('circle[data-shot-id]')).toHaveLength(5);
  fireEvent.click(circle(container, 'b'));
  expect(onSelect).toHaveBeenCalledWith('b');
});

test("each club's points are filled with that club's colour", () => {
  const { container } = renderPlot();
  expect(circle(container, 'a').parentElement).toHaveAttribute('fill', '#C98500');
  expect(circle(container, 'w1').parentElement).toHaveAttribute('fill', '#E66767');
});

test('distance runs left to right from the tee; left of target is drawn above the target line', () => {
  const { container } = renderPlot();
  expect(num(circle(container, 'c'), 'cx')).toBeGreaterThan(num(circle(container, 'a'), 'cx'));
  expect(num(circle(container, 'w1'), 'cx')).toBeLessThan(num(circle(container, 'a'), 'cx'));
  expect(num(circle(container, 'a'), 'cy')).toBeLessThan(num(circle(container, 'b'), 'cy')); // 20 L above the line
  expect(num(circle(container, 'c'), 'cy')).toBeGreaterThan(num(circle(container, 'b'), 'cy')); // 10 R below it
});

test('one yard is the same length on both axes, and distance arcs are centred on the tee', () => {
  const { container } = renderPlot();
  // b (0, 160) and c (10, 170): 10 yd further and 10 yd right.
  const dx = num(circle(container, 'c'), 'cx') - num(circle(container, 'b'), 'cx');
  const dy = num(circle(container, 'c'), 'cy') - num(circle(container, 'b'), 'cy');
  expect(dx).toBeCloseTo(dy, 0);
  const arcs = container.querySelectorAll('[data-testid="distance-arc"]');
  expect(arcs.length).toBeGreaterThan(2);
  expect(new Set(Array.from(arcs).map((a) => `${a.getAttribute('cx')},${a.getAttribute('cy')}`)).size).toBe(1);
});

test('xMax sets the distance axis: the same point sits further left on a longer axis', () => {
  const short = renderPlot({ xMax: 200 });
  const x200 = num(circle(short.container, 'b'), 'cx');
  short.unmount();
  const long = renderPlot({ xMax: 300 });
  expect(num(circle(long.container, 'b'), 'cx')).toBeLessThan(x200);
});

test("lateral labels use L/R and the centre reads 'Target'; distance ticks are plain yards", () => {
  const { container } = renderPlot();
  const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
  expect(texts).toContain('Target');
  expect(texts.some((t) => /^\d+ L$/.test(t ?? ''))).toBe(true);
  expect(texts.some((t) => /^\d+ R$/.test(t ?? ''))).toBe(true);
  expect(texts).toContain('100');
});

test('left/right yardage lines run across the plot every 10 yd at full width, labelled L above and R below', () => {
  const { container } = renderPlot({ xMax: 300 });
  const lines = Array.from(container.querySelectorAll('[data-testid="lateral-line"]'));
  const yds = lines.map((l) => Number(l.getAttribute('data-yd')));
  expect(yds).toContain(-10);
  expect(yds).toContain(10);
  expect(yds.slice(1).map((v, i) => v - yds[i]!).every((d) => d === 10 || d === 20)).toBe(true); // no line on the target
  const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
  expect(texts).toContain('10 L');
  expect(texts).toContain('10 R');
  const y = (yd: number) => Number(lines.find((l) => l.getAttribute('data-yd') === String(yd))!.getAttribute('y1'));
  expect(y(-10)).toBeLessThan(y(10));
});

test('on a narrow plot the yardage lines spread out so labels never crowd', () => {
  const { container } = renderPlot({ xMax: 300, width: 420 });
  const yds = Array.from(container.querySelectorAll('[data-testid="lateral-line"]')).map((l) => Number(l.getAttribute('data-yd')));
  expect(yds).not.toContain(10);
  expect(yds).toContain(20);
});

test('one ellipse per club with 3+ shots, in the club colour; one mean cross per club', () => {
  const { container } = renderPlot();
  const ellipses = container.querySelectorAll('[data-testid="ellipse"]');
  expect(ellipses).toHaveLength(1);
  expect(ellipses[0]).toHaveAttribute('data-club', '7 Iron');
  expect(ellipses[0]).toHaveAttribute('stroke', '#C98500');
  expect(container.querySelectorAll('[data-testid="centroid"]')).toHaveLength(2);
});

test('a cloud whose lateral and distance rise together tilts its ellipse down-right on screen', () => {
  const { container } = renderPlot();
  const m = container.querySelector('[data-testid="ellipse"]')!.getAttribute('transform')!;
  const [a = 0, b = 0] = m.match(/matrix\(([^)]+)\)/)![1]!.split(/[ ,]+/).map(Number);
  // Major axis: further (a > 0) and more right, which is lower on screen (b > 0).
  expect(a).toBeGreaterThan(0);
  expect(b).toBeGreaterThan(0);
});

test('with nothing highlighted every club is translucent; highlighting one makes it solid and fades the rest', () => {
  const { container, rerender } = render(
    <DispersionPlot mode="carry" groups={groups} xMax={200} selectedId={null} highlightClub={null} onSelect={vi.fn()} labelFor={labelFor} />,
  );
  const opacity = (id: string) => Number(circle(container, id).parentElement!.getAttribute('fill-opacity'));
  expect(opacity('a')).toBeLessThan(0.6);
  expect(opacity('a')).toBe(opacity('w1'));
  rerender(<DispersionPlot mode="carry" groups={groups} xMax={200} selectedId={null} highlightClub="7 Iron" onSelect={vi.fn()} labelFor={labelFor} />);
  expect(opacity('a')).toBeGreaterThan(0.9);
  expect(opacity('w1')).toBeLessThan(0.2);
  // The highlighted club is drawn last, on top.
  const order = Array.from(container.querySelectorAll('circle[data-shot-id]')).map((c) => c.getAttribute('data-shot-id'));
  expect(order.indexOf('a')).toBeGreaterThan(order.indexOf('w1'));
});

test('the selected shot is white, drawn on top, labelled, with a path from the tee; aria-label names it', () => {
  const { container } = renderPlot({ selectedId: 'c', highlightClub: '7 Iron', selectedLaunchH: 2 });
  const all = Array.from(container.querySelectorAll('circle[data-shot-id]'));
  const sel = circle(container, 'c');
  expect(all[all.length - 1]).toBe(sel);
  expect(sel).toHaveAttribute('aria-current', 'true');
  expect(sel).toHaveAttribute('fill', '#EAF0EC');
  expect(container.querySelectorAll('[aria-current]')).toHaveLength(1);
  expect(container.textContent).toContain('Shot c');
  expect(container.querySelector('[data-testid="selected-path"]')!.getAttribute('d')).toMatch(/^M\S+ \S+ Q/);
  const label = container.querySelector('svg')!.getAttribute('aria-label')!;
  expect(label).toContain('7 Iron highlighted.');
  expect(label).toContain('Shot c lands at 170 yards, 10 yards right');
});

test('carry mode labels', () => {
  const { container } = renderPlot();
  expect(container.textContent).toContain('Carry distance (yd)');
  expect(container.textContent).toContain('Lateral landing (yd)');
  expect(container.textContent).toContain('Actual reported landing position');
  expect(container.textContent).not.toContain('Total Dispersion');
});

test('total mode labels', () => {
  const { container } = renderPlot({ mode: 'total' });
  expect(container.textContent).toContain('Total distance (yd)');
  expect(container.textContent).toContain('Hybrid plot, not actual resting position');
  expect(container.textContent).not.toContain('Total Dispersion');
});

test('no points in any club: the empty message, no circles', () => {
  const empty = { ...iron, points: [], centroid: null, ellipse: null };
  const { container } = renderPlot({ groups: [{ club: '7 Iron', color: '#C98500', stats: empty }] });
  expect(container.textContent).toContain('No shots with both lateral and carry values');
  expect(container.querySelectorAll('circle')).toHaveLength(0);
});

test('allOn draws every dot at full strength', () => {
  const one = (id: string, x: number, y: number): DispersionStats => ({ ...wedge, points: [{ shotId: id, x, y }], ellipse: null });
  const two: DispersionPlotProps['groups'] = [
    { club: 'Shot A', color: '#EAF0EC', stats: one('p', 1, 150) },
    { club: 'Shot B', color: '#C08CFF', stats: one('q', -2, 140) },
  ];
  const { container, rerender } = renderPlot({ groups: two });
  expect(circle(container, 'p').parentElement).toHaveAttribute('fill-opacity', '0.45');
  rerender(<DispersionPlot mode="carry" groups={two} xMax={200} selectedId={null} highlightClub={null} onSelect={vi.fn()} labelFor={labelFor} allOn />);
  expect(circle(container, 'p').parentElement).toHaveAttribute('fill-opacity', '0.95');
  expect(circle(container, 'q').parentElement).toHaveAttribute('fill-opacity', '0.95');
});

test('without onSelect the dots are plain marks: no pointer cursor, no button role, clicks do nothing', () => {
  const { container } = renderPlot({ onSelect: undefined, selectedId: 'b' });
  for (const id of ['a', 'b', 'c']) {
    const c = circle(container, id);
    expect((c as SVGElement).style.cursor).toBe('');
    expect(c).not.toHaveAttribute('role');
  }
  expect(() => fireEvent.click(circle(container, 'a'))).not.toThrow();
});
