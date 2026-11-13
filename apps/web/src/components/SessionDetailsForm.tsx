import { useId } from 'react';
import type { SessionDetails } from '@fsa/domain';
import { SegmentedControl } from '@fsa/ui';

export interface SessionDetailsFormProps {
  value: SessionDetails;
  onChange(patch: Partial<SessionDetails>): void;
  /** Local build: a saved session must keep a name and a date. */
  required?: boolean;
}

export function SessionDetailsForm({ value, onChange, required = false }: SessionDetailsFormProps) {
  const id = useId();
  return (
    <div className="details-form">
      <label className="field" htmlFor={`${id}-name`}>
        <span>Session name</span>
        <input id={`${id}-name`} type="text" autoComplete="off" className="field__input fsa-touch" placeholder="Untitled session" value={value.name} required={required} aria-invalid={required && value.name.trim() === '' ? true : undefined} onChange={(e) => onChange({ name: e.target.value })} />
        {required && value.name.trim() === '' && <span role="alert" className="field__error">Name is required</span>}
      </label>
      <label className="field" htmlFor={`${id}-date`}>
        <span>Date</span>
        <input id={`${id}-date`} type="date" autoComplete="off" className="field__input fsa-touch" value={value.date ?? ''} required={required} onChange={(e) => { if (required && !e.target.value) return; onChange({ date: e.target.value || null }); }} />
      </label>
      <label className="field field--wide" htmlFor={`${id}-notes`}>
        <span>Notes</span>
        <textarea id={`${id}-notes`} autoComplete="off" className="field__input" rows={3} value={value.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      </label>
      <SegmentedControl
        label="Golfer"
        value={value.handedness}
        onChange={(handedness) => onChange({ handedness })}
        options={[{ value: 'right', label: 'Right-handed' }, { value: 'left', label: 'Left-handed' }]}
      />
    </div>
  );
}
