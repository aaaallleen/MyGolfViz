import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import {
  Button,
  FilterChip,
  KpiTile,
  ProvenanceLegend,
  SegmentedControl,
  SelectField,
  Tabs,
} from './index';

test('SegmentedControl: role=group named by label; selected option aria-pressed=true; click calls onChange(value)', async () => {
  const onChange = vi.fn();
  render(
    <SegmentedControl
      label="Dispersion mode"
      options={[
        { value: 'carry', label: 'Carry' },
        { value: 'total', label: 'Total' },
      ]}
      value="carry"
      onChange={onChange}
    />,
  );
  const group = screen.getByRole('group', { name: 'Dispersion mode' });
  expect(within(group).getByRole('button', { name: 'Carry' })).toHaveAttribute('aria-pressed', 'true');
  const total = within(group).getByRole('button', { name: 'Total' });
  expect(total).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(total);
  expect(onChange).toHaveBeenCalledWith('total');
});

test("FilterChip renders 'Driver' and '34' with aria-pressed", async () => {
  const onClick = vi.fn();
  render(<FilterChip pressed label="Driver" count={34} onClick={onClick} />);
  const chip = screen.getByRole('button', { name: /Driver/ });
  expect(chip).toHaveAttribute('aria-pressed', 'true');
  expect(within(chip).getByText('Driver')).toBeInTheDocument();
  expect(within(chip).getByText('34')).toBeInTheDocument();
  await userEvent.click(chip);
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("KpiTile with value null shows 'Not measured' and no unit; shows sub '± 9.8 · n 34'", () => {
  const { container } = render(<KpiTile label="Carry" value={null} unit="yds" sub="± 9.8 · n 34" accent="ball" />);
  expect(screen.getByText('Not measured')).toBeInTheDocument();
  expect(screen.queryByText('yds')).not.toBeInTheDocument();
  expect(screen.getByText('± 9.8 · n 34')).toBeInTheDocument();
  expect(container.textContent).not.toContain('yds');
});

test('KpiTile with a value shows value and unit', () => {
  render(<KpiTile label="Carry" value="231.4" unit="yds" accent="club" />);
  expect(screen.getByText('231.4')).toBeInTheDocument();
  expect(screen.getByText('yds')).toBeInTheDocument();
});

test('ProvenanceLegend lists exactly the four legend strings from Global Constraints', () => {
  render(<ProvenanceLegend />);
  const items = screen.getAllByRole('listitem').map((li) => li.textContent);
  expect(items).toEqual([
    'Measured · from the CSV',
    'Derived · calculated from measured values',
    'Illustrative · drawn for orientation',
    'Unavailable · not in the CSV',
  ]);
});

function TabsHarness() {
  const [active, setActive] = useState('a');
  return (
    <Tabs
      label="Inspector"
      tabs={[
        { id: 'a', label: 'Face impact' },
        { id: 'b', label: '3D reconstruction' },
        { id: 'c', label: '2D reconstruction' },
      ]}
      active={active}
      onChange={setActive}
    />
  );
}

test('Tabs: role=tablist, active tab aria-selected; ArrowRight activates next, ArrowLeft from first wraps to last', async () => {
  render(<TabsHarness />);
  expect(screen.getByRole('tablist', { name: 'Inspector' })).toBeInTheDocument();
  const first = screen.getByRole('tab', { name: 'Face impact' });
  expect(first).toHaveAttribute('aria-selected', 'true');
  expect(first).toHaveAttribute('tabindex', '0');
  expect(screen.getByRole('tab', { name: '3D reconstruction' })).toHaveAttribute('tabindex', '-1');
  first.focus();
  await userEvent.keyboard('{ArrowRight}');
  const second = screen.getByRole('tab', { name: '3D reconstruction' });
  expect(second).toHaveAttribute('aria-selected', 'true');
  expect(second).toHaveFocus();
  await userEvent.keyboard('{ArrowLeft}');
  expect(first).toHaveAttribute('aria-selected', 'true');
  await userEvent.keyboard('{ArrowLeft}');
  const last = screen.getByRole('tab', { name: '2D reconstruction' });
  expect(last).toHaveAttribute('aria-selected', 'true');
  expect(last).toHaveFocus();
});

test('SelectField input is reachable via getByLabelText(label)', async () => {
  const onChange = vi.fn();
  render(
    <SelectField
      label="Club"
      value="d"
      options={[
        { value: 'd', label: 'Driver' },
        { value: 'i', label: 'Iron' },
      ]}
      onChange={onChange}
    />,
  );
  const select = screen.getByLabelText('Club');
  expect(select).toHaveValue('d');
  await userEvent.selectOptions(select, 'i');
  expect(onChange).toHaveBeenCalledWith('i');
});

test('Button, SegmentedControl options, FilterChip, SelectField and tabs carry class fsa-touch', () => {
  render(
    <div>
      <Button>Go</Button>
      <SegmentedControl label="Seg" options={[{ value: 'x', label: 'X' }]} value="x" onChange={() => {}} />
      <FilterChip pressed={false} label="Iron" count={3} onClick={() => {}} />
      <SelectField label="Sel" value="a" options={[{ value: 'a', label: 'A' }]} onChange={() => {}} />
      <Tabs label="T" tabs={[{ id: 't', label: 'Tab' }]} active="t" onChange={() => {}} />
    </div>,
  );
  expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('fsa-touch');
  expect(screen.getByRole('button', { name: 'X' })).toHaveClass('fsa-touch');
  expect(screen.getByRole('button', { name: /Iron/ })).toHaveClass('fsa-touch');
  expect(screen.getByLabelText('Sel')).toHaveClass('fsa-touch');
  expect(screen.getByRole('tab', { name: 'Tab' })).toHaveClass('fsa-touch');
});
