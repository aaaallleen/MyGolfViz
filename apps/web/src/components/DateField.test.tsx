import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DateField } from './DateField';

// A fixed today, so no day in these tests is labelled "(today)" by accident.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 5, 1, 12, 0) }));
afterEach(() => vi.useRealTimers());

function setup(props: { value: string | null; required?: boolean }) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(
    <>
      <label htmlFor="d">Date</label>
      <DateField id="d" value={props.value} required={props.required} onChange={onChange} />
    </>,
  );
  return { onChange, user };
}

describe('DateField', () => {
  test('the date can still be typed, and the calendar has its own button', () => {
    const { onChange } = setup({ value: '2026-11-07' });
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-07');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-08' } });
    expect(onChange).toHaveBeenCalledWith('2026-11-08');
    expect(screen.getByRole('button', { name: 'Choose date' })).toBeInTheDocument();
  });

  test('required: clearing the typed date is ignored', () => {
    const { onChange } = setup({ value: '2026-11-07', required: true });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test('the calendar opens on the chosen month with that day selected, and picking a day closes it', async () => {
    const { onChange, user } = setup({ value: '2026-11-07' });
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    const grid = await screen.findByRole('grid', { name: 'November 2026' });
    const day = within(grid).getByRole('button', { name: 'Saturday, 7 November 2026' });
    expect(day).toHaveClass('is-selected');
    expect(day.closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
    await user.click(within(grid).getByRole('button', { name: 'Friday, 13 November 2026' }));
    expect(onChange).toHaveBeenCalledWith('2026-11-13');
    expect(screen.queryByRole('grid')).toBeNull();
  });

  test('month buttons and the keyboard move through the calendar', async () => {
    const { onChange, user } = setup({ value: '2026-11-30' });
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    await screen.findByRole('grid', { name: 'November 2026' });
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('grid', { name: 'December 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    const start = screen.getByRole('button', { name: 'Monday, 30 November 2026' });
    start.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Tuesday, 1 December 2026' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('button', { name: 'Tuesday, 24 November 2026' })).toHaveFocus();
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('button', { name: 'Thursday, 24 December 2026' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('button', { name: 'Monday, 21 December 2026' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('2026-12-21');
  });

  test('Today picks today; Clear appears only when the date is optional', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 12, 21, 0) });
    const { onChange, user } = setup({ value: '2026-01-02' });
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith(null);
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    await user.click(await screen.findByRole('button', { name: 'Today' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-12');
  });

  test('required: no Clear in the calendar', async () => {
    const { user } = setup({ value: '2026-01-02', required: true });
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    await screen.findByRole('grid');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });
});
