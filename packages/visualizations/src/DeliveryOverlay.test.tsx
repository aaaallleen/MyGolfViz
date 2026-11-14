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
