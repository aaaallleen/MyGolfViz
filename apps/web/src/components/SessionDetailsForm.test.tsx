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

  it('required says Name is required inside the empty name box, in red, with no line below it', () => {
    render(<SessionDetailsForm value={{ ...value, name: '' }} onChange={vi.fn()} required />);
    const name = screen.getByLabelText('Session name');
    expect(name).toHaveAttribute('placeholder', 'Name is required');
    expect(name).toHaveClass('field__input--missing');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Name is required');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a typed name keeps the normal prompt and styling', () => {
    render(<SessionDetailsForm value={value} onChange={vi.fn()} required />);
    const name = screen.getByLabelText('Session name');
    expect(name).toHaveAttribute('placeholder', 'Untitled session');
    expect(name).not.toHaveClass('field__input--missing');
    expect(name).not.toHaveAttribute('aria-invalid');
  });

  it('shows no name error when not required', () => {
    render(<SessionDetailsForm value={{ ...value, name: '' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Session name')).toHaveAttribute('placeholder', 'Untitled session');
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
  });
});
