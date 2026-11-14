import { useId } from 'react';
import type { SessionDetails } from '@fsa/domain';
import { SegmentedControl } from '@fsa/ui';
import { DateField } from './DateField';

export interface SessionDetailsFormProps {
  value: SessionDetails;
  onChange(patch: Partial<SessionDetails>): void;
  /** Local build: a saved session must keep a name and a date. */
  required?: boolean;
}

export function SessionDetailsForm({ value, onChange, required = false }: SessionDetailsFormProps) {
  const id = useId();
  const missingName = required && value.name.trim() === '';
  return (
    <div className="details-form">
      <div className="field">
        <label htmlFor={`${id}-name`}>Session name</label>
        <input
          id={`${id}-name`}
          type="text"
          autoComplete="off"
          className={missingName ? 'field__input field__input--missing fsa-touch' : 'field__input fsa-touch'}
          // A missing name is said inside the box, in red, so the row of fields keeps one height.
          placeholder={missingName ? 'Name is required' : 'Untitled session'}
          value={value.name}
          required={required}
          aria-invalid={missingName ? true : undefined}
          aria-describedby={missingName ? `${id}-name-error` : undefined}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {missingName && <span id={`${id}-name-error`} className="visually-hidden">Name is required</span>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-date`}>Date</label>
        <DateField id={`${id}-date`} value={value.date} required={required} onChange={(date) => onChange({ date })} />
      </div>
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
