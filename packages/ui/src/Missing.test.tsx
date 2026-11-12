import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { KpiTile } from './KpiTile';
import { Missing } from './Missing';

test('Missing shows a dash, hides it from screen readers, and says "Not measured" to them and on hover', () => {
  const { container } = render(<Missing />);
  const root = container.firstElementChild as HTMLElement;
  expect(root).toHaveAttribute('title', 'Not measured');
  expect(root.querySelector('[aria-hidden="true"]')).toHaveTextContent(/^–$/);
  expect(root).toHaveTextContent(/^–Not measured$/);
  // Positioned, so the hidden words never escape a scroll box and widen the page.
  expect(root.style.position).toBe('relative');
});

test('KpiTile with no value shows the dash', () => {
  const { container } = render(<KpiTile label="Carry" value={null} unit="yd" accent="ball" />);
  expect(container.querySelector('.fsa-kpi__value [aria-hidden="true"]')).toHaveTextContent('–');
});
