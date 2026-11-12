import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';

export type SegmentedControlProps<T extends string> = {
  label: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange(v: T): void;
};

/** One-of-N buttons in a single tab stop; arrow keys move between options. */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      aria-label={label}
      className="fsa-seg"
      value={[value]}
      onValueChange={(next) => {
        // Pressing the option that is already on would leave nothing selected; a segmented control always has one.
        const v = next[0] as T | undefined;
        if (v !== undefined && v !== value) onChange(v);
      }}
    >
      {options.map((o) => (
        <Toggle key={o.value} value={o.value} disabled={o.disabled} className="fsa-seg__opt fsa-touch">
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
