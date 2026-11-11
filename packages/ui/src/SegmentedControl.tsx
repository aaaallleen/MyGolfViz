export type SegmentedControlProps<T extends string> = {
  label: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange(v: T): void;
};

export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className="fsa-seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="fsa-seg__opt fsa-touch"
          aria-pressed={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
