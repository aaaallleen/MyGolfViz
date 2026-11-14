import { fieldDef, NOT_MEASURED, NUMBER_LOCALE, numberFormat, unitSuffix, type MeasurementKey } from '@fsa/domain';

const MINUS = '−';

/** Neutral change wording: arrow, signed value (U+2212 for minus) and the unit, e.g. `↑ +4.2 yd`. */
export function formatChange(key: MeasurementKey, delta: number): string {
  const { decimals } = fieldDef(key);
  const text = Math.abs(delta).toLocaleString(NUMBER_LOCALE, numberFormat(decimals));
  const zero = (0).toLocaleString(NUMBER_LOCALE, numberFormat(decimals));
  const unit = unitSuffix(key);
  if (text === zero) return `→ ${zero}${unit}`;
  return delta > 0 ? `↑ +${text}${unit}` : `↓ ${MINUS}${text}${unit}`;
}

/**
 * A value with its unit and no direction word: for distances from the line (|value|) and SDs,
 * where L/R or up/down would be wrong. Null shows `Not measured`.
 */
export function formatPlain(key: MeasurementKey, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NOT_MEASURED;
  const { decimals } = fieldDef(key);
  const sign = value < 0 ? MINUS : '';
  return `${sign}${Math.abs(value).toLocaleString(NUMBER_LOCALE, numberFormat(decimals))}${unitSuffix(key)}`;
}

/** Axis ticks and point tooltips: signed, up to the field's decimals, with the unit. */
export function tickFormatter(key: MeasurementKey): (v: number) => string {
  const { decimals } = fieldDef(key);
  const unit = unitSuffix(key);
  return (v) => {
    const text = Math.abs(v).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: decimals });
    return `${v < 0 && text !== '0' ? MINUS : ''}${text}${unit}`;
  };
}
