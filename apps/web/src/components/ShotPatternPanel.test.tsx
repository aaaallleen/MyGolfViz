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

test('the distance axis reaches past an every-shot ellipse, not just the dots', () => {
  // Nine drives near 250 yd and one topped at 120 yd: the Every-shot ellipse runs past 300 yd.
  const carries = [245, 248, 250, 252, 255, 247, 251, 253, 249, 120];
  const drives = carries.map((c, i) => shot(i, (i % 5) - 2, c));
  const groups = dispersionByClub(drives, 'carry', 'all').map((g) => ({ ...g, color: '#123456' }));
  const e = groups[0]!.stats.ellipse!;
  expect(e.cy + e.halfY).toBeGreaterThan(300);
  const { container } = render(
    <ShotPatternPanel shots={drives} groups={groups} mode="carry" onMode={() => {}} ellipseKind="all" onEllipseKind={() => {}}
      selectedId={null} onSelect={() => {}} highlightClub={null} />,
  );
  const topView = container.querySelector('.fsa-dispersion')!;
  const ticks = Array.from(topView.querySelectorAll('text[text-anchor="middle"]')).map((t) => Number(t.textContent));
  expect(Math.max(...ticks)).toBeGreaterThanOrEqual(e.cy + e.halfY);
});
