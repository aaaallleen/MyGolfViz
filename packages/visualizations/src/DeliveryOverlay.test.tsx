import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { DeliveryOverlay, type DeliveryShot } from './DeliveryOverlay';

const A: DeliveryShot = { id: 'a', label: 'A', color: '#EAF0EC', clubPath: 2.1, ftt: 1.0 };
const B: DeliveryShot = { id: 'b', label: 'B', color: '#C08CFF', clubPath: -1.8, ftt: -0.5 };

test('draws a path and face per shot', () => {
  const { container } = render(<DeliveryOverlay shots={[A, B]} />);
  expect(container.querySelectorAll('[data-kind="path"]')).toHaveLength(2);
  expect(container.querySelectorAll('[data-kind="face"]')).toHaveLength(2);
  expect(container.textContent).toContain('A path 2.1° R');
  expect(container.textContent).toContain('B path 1.8° L');
  expect(container.querySelector('svg')).toHaveAttribute('role', 'img');
});

test('a positive path leans right', () => {
  const { container } = render(<DeliveryOverlay shots={[{ ...A, clubPath: 5 }]} />);
  const p = container.querySelector('[data-kind="path"]')!;
  expect(Number(p.getAttribute('x2'))).toBeGreaterThan(Number(p.getAttribute('x1')));
  expect(Number(p.getAttribute('y2'))).toBeLessThan(Number(p.getAttribute('y1')));
});

test('missing values are left out, not drawn at 0', () => {
  const { container } = render(<DeliveryOverlay shots={[A, { ...B, clubPath: null }]} />);
  expect(container.querySelectorAll('[data-kind="path"]')).toHaveLength(1);
  expect(container.textContent).toContain('B has no club path data');
  expect(container.textContent).not.toContain('A has no');
});

test('each shot gets a label line with path and face', () => {
  const { container } = render(<DeliveryOverlay shots={[A]} />);
  expect(container.querySelector('[data-kind="path-label"]')!.textContent).toBe('A path 2.1° R · face 1.0° R');
});

test('a face-only shot still gets a label line, and none when both are missing', () => {
  const { container } = render(<DeliveryOverlay shots={[{ ...A, clubPath: null, ftt: 8.6 }, { ...B, clubPath: null, ftt: null }]} />);
  const labels = [...container.querySelectorAll('[data-kind="path-label"]')].map((e) => e.textContent);
  expect(labels).toEqual(['A face 8.6° R']);
});

test('a missing face angle is reported, not drawn', () => {
  const { container } = render(<DeliveryOverlay shots={[{ ...A, ftt: null }]} />);
  expect(container.textContent).toContain('A has no face angle data');
  expect(container.querySelector('[data-kind="face"]')).toBeNull();
  expect(container.querySelector('[data-kind="path-label"]')!.textContent).toBe('A path 2.1° R');
});

test('the target line is drawn after the shots so it stays on top', () => {
  const { container } = render(<DeliveryOverlay shots={[A]} />);
  const svg = container.querySelector('svg')!;
  const kids = [...svg.children];
  expect(kids.indexOf(svg.querySelector('[data-testid="target-line"]')!)).toBeGreaterThan(kids.indexOf(svg.querySelector('g[data-shot-id]')!));
});

test('the readouts are a list under the drawing, so four shots never crowd the target caption', () => {
  const C: DeliveryShot = { id: 'c', label: 'C', color: '#F2C14E', clubPath: 4.2, ftt: 3.1 };
  const D: DeliveryShot = { id: 'd', label: 'D', color: '#4FD1C5', clubPath: -3.3, ftt: -2.2 };
  const { container } = render(<DeliveryOverlay shots={[A, B, C, D]} />);
  const labels = [...container.querySelectorAll('[data-kind="path-label"]')];
  expect(labels.map((e) => e.textContent)).toEqual([
    'A path 2.1° R · face 1.0° R', 'B path 1.8° L · face 0.5° L', 'C path 4.2° R · face 3.1° R', 'D path 3.3° L · face 2.2° L',
  ]);
  for (const l of labels) expect(l.closest('svg')).toBeNull();
  expect(container.querySelectorAll('[data-kind="path"]')).toHaveLength(4);
});
