import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ClubViews2D } from './ClubViews2D';
import { REF_M, sceneOf } from './testFixtures';
import type { View2D } from './types';

const setup = (large: View2D = 'ftt') => {
  const onSelect = vi.fn<(v: View2D) => void>();
  render(<ClubViews2D scene={sceneOf(REF_M)} m={REF_M} club="7 Iron" handedness="right" large={large} onSelect={onSelect} />);
  const gallery = screen.getByRole('region', { name: '2D club views' });
  return { onSelect, gallery, large: gallery.querySelector('.view-gallery__large') as HTMLElement };
};
const badgeRows = (el: HTMLElement) => Array.from(el.querySelectorAll('.view-badges__item')).map((li) => li.textContent!.replace(/\s+/g, ' ').trim());

describe('ClubViews2D', () => {
  test('opens on Face to target with badges Face to target 11.8° R, Launch direction 5.7° R, Club path 8.3° R', () => {
    const { large } = setup();
    expect(within(large).getByText('Face to target', { selector: 'h4' })).toBeInTheDocument();
    expect(badgeRows(large)).toEqual(['Face to target 11.8° R', 'Launch direction 5.7° R', 'Club path 8.3° R']);
  });

  test('Dynamic loft badges end with Spin loft (as reported)', () => {
    const { large } = setup('loft');
    expect(badgeRows(large)).toEqual(['Dynamic loft 40.9°', 'Launch angle 26.0°', 'Attack angle 4.0° down', 'Spin loft 44.9° (as reported)']);
  });

  test('Spin axis badges: Spin 3,253 rpm and Spin axis 2.6° R', () => {
    const { large } = setup('spinAxis');
    expect(badgeRows(large)).toEqual(['Spin 3,253 rpm', 'Spin axis 2.6° R']);
  });

  test('thumbnails ask for their view; there is no Play or orbit reset in 2D', async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Show Dynamic loft view' }));
    expect(onSelect).toHaveBeenCalledWith('loft');
    expect(screen.queryByRole('button', { name: 'Play replay' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset view' })).toBeNull();
  });

  test('shows the generic-head provenance note', () => {
    setup();
    expect(screen.getByText('Club head is a generic shape for its club type')).toBeInTheDocument();
  });
});
