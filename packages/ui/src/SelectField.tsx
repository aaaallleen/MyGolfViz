import { useId } from 'react';

export type SelectFieldProps = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange(v: string): void;
};

export function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  const id = useId();
  return (
    <div className="fsa-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="fsa-select fsa-touch" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
