import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionDetails } from '@fsa/domain';
import { SessionDetailsForm } from './SessionDetailsForm';

const value: SessionDetails = { name: 'Range', date: '2026-01-02', notes: '', handedness: 'right' };

describe('SessionDetailsForm', () => {
  it('emits date null when the date is cleared by default', () => {
    const onChange = vi.fn();
    render(<SessionDetailsForm value={value} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ date: null });
  });

  it('required blocks clearing the date and marks the inputs required', () => {
    const onChange = vi.fn();
    render(<SessionDetailsForm value={value} onChange={onChange} required />);
    const date = screen.getByLabelText('Date');
    expect(date).toBeRequired();
    expect(screen.getByLabelText('Session name')).toBeRequired();
    fireEvent.change(date, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('required shows Name is required for an empty name', () => {
    render(<SessionDetailsForm value={{ ...value, name: '' }} onChange={vi.fn()} required />);
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('shows no name error when not required', () => {
    render(<SessionDetailsForm value={{ ...value, name: '' }} onChange={vi.fn()} />);
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
  });
});
