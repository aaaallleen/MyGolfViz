import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { unitSuffix, type MeasurementKey } from '@fsa/domain';
import { Button } from '@fsa/ui';
import type { TargetRange } from '../api';

export interface TargetRangeFormProps {
  metric: MeasurementKey;
  /** Accuracy tiles: the range applies to |value|, so both bounds must be 0 or more. */
  abs: boolean;
  range: TargetRange | null;
  onSave: (low: number | null, high: number | null) => void;
  onClear: () => void;
  onCancel: () => void;
}

type Parsed = { ok: true; low: number | null; high: number | null } | { ok: false; error: string };

const parseBound = (text: string): number | null | undefined => {
  if (text.trim() === '') return null;
  const v = Number(text);
  return Number.isFinite(v) ? v : undefined;
};

/** At least one bound, low ≤ high, and on accuracy tiles both ≥ 0. */
export function validateRange(lowText: string, highText: string, abs: boolean): Parsed {
  const low = parseBound(lowText);
  const high = parseBound(highText);
  if (low === undefined || high === undefined) return { ok: false, error: 'Enter numbers only.' };
  if (low === null && high === null) return { ok: false, error: 'Enter a low value, a high value or both.' };
  if (low !== null && high !== null && low > high) return { ok: false, error: 'Low must not be above High.' };
  if (abs && ((low !== null && low < 0) || (high !== null && high < 0))) {
    return { ok: false, error: 'Use 0 or more: on this tile the range applies to the distance from the line.' };
  }
  return { ok: true, low, high };
}

const asText = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

/** Low and High in the metric's canonical unit. Nothing is sent while the input is invalid. */
export function TargetRangeForm({ metric, abs, range, onSave, onClear, onCancel }: TargetRangeFormProps) {
  const id = useId();
  const [low, setLow] = useState(asText(range?.low));
  const [high, setHigh] = useState(asText(range?.high));
  const [error, setError] = useState<string | null>(null);
  const lowInput = useRef<HTMLInputElement>(null);
  const highInput = useRef<HTMLInputElement>(null);
  const unit = unitSuffix(metric).trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // A number field reports '' for text it cannot read (`-`, `1e`); only its validity tells that from empty.
    if (lowInput.current?.validity.badInput || highInput.current?.validity.badInput) {
      setError('Enter numbers only.');
      return;
    }
    const parsed = validateRange(low, high, abs);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onSave(parsed.low, parsed.high);
  };

  const field = (label: string, value: string, set: (v: string) => void, ref: RefObject<HTMLInputElement | null>, autoFocus = false) => (
    <div className="prog-range__field">
      <label htmlFor={`${id}-${label}`}>{label}</label>
      <div className="prog-range__input">
        <input
          ref={ref}
          id={`${id}-${label}`}
          type="number"
          step="any"
          inputMode="decimal"
          value={value}
          autoFocus={autoFocus}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => { set(e.target.value); setError(null); }}
        />
        {unit && <span className="prog-range__unit">{unit}</span>}
      </div>
    </div>
  );

  return (
    <form className="prog-range" aria-label="Target range" onSubmit={submit} noValidate>
      <div className="prog-range__fields">
        {field('Low', low, setLow, lowInput, true)}
        {field('High', high, setHigh, highInput)}
      </div>
      {error && <p id={`${id}-error`} className="prog-range__error" role="alert">{error}</p>}
      <div className="prog-range__actions">
        <Button type="submit" variant="primary">Save</Button>
        {range && <Button onClick={onClear}>Clear</Button>}
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
