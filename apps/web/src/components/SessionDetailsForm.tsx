import { useId } from 'react';
import type { SessionDetails } from '@fsa/domain';
import { SegmentedControl } from '@fsa/ui';

export interface SessionDetailsFormProps {
  value: SessionDetails;
  onChange(patch: Partial<SessionDetails>): void;
}

export function SessionDetailsForm({ value, onChange }: SessionDetailsFormProps) {
  const id = useId();
  return (
    <div className="details-form">
      <label className="field" htmlFor={`${id}-name`}>
        <span>Session name</span>
        <input id={`${id}-name`} type="text" className="field__input fsa-touch" placeholder="Untitled session" value={value.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <label className="field" htmlFor={`${id}-date`}>
        <span>Date</span>
        <input id={`${id}-date`} type="date" className="field__input fsa-touch" value={value.date ?? ''} onChange={(e) => onChange({ date: e.target.value || null })} />
      </label>
      <label className="field field--wide" htmlFor={`${id}-notes`}>
        <span>Notes</span>
        <textarea id={`${id}-notes`} className="field__input" rows={3} value={value.notes} onChange={(e) => onChange({ notes: e.target.value })} />
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
