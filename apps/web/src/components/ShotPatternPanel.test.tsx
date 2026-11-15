import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { dispersionByClub, type EllipseKind } from '@fsa/analytics';
import type { Shot } from '@fsa/domain';
import { ShotPatternPanel } from './ShotPatternPanel';

const shot = (i: number, lateral: number, carry: number) =>
  ({ id: `s${i}`, club: 'Driver', m: { lateral, carry, total: carry } }) as unknown as Shot;
const shots = [shot(1, 0, 200), shot(2, 5, 210), shot(3, -4, 190), shot(4, 8, 220), shot(5, -9, 180)];

function renderPanel(kind: EllipseKind, onEllipseKind = vi.fn()) {
  const groups = dispersionByClub(shots, 'carry', kind).map((g) => ({ ...g, color: '#123456' }));
  render(
    <ShotPatternPanel shots={shots} groups={groups} mode="carry" onMode={() => {}} ellipseKind={kind} onEllipseKind={onEllipseKind}
      selectedId={null} onSelect={() => {}} highlightClub={null} />,
  );
  return onEllipseKind;
}

describe('ShotPatternPanel ellipse choice', () => {
  test('an Ellipse radio group has 1 SD checked; choosing Every shot reports it', async () => {
    const on = renderPanel('sd1');
    const group = screen.getByRole('group', { name: 'Ellipse' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 SD' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Every shot' }));
    expect(on).toHaveBeenCalledWith('all');
    expect(screen.getByText(/^1σ covariance ellipse per club/)).toBeInTheDocument();
  });

  test('Every shot shows its own caption with all shots inside', () => {
    renderPanel('all');
    expect(screen.getByText(
      "Every-shot ellipse per club · the 1σ ellipse's shape, enlarged until every shot is inside · observed: 5 of 5 shots inside. Cross: each club's mean landing.",
    )).toBeInTheDocument();
  });
});
