import { fieldDef } from './fields';
import { NOT_MEASURED } from './session';
import type { Direction, MeasurementKey } from './types';

const SUFFIX: Record<Exclude<Direction, null>, readonly [string, string]> = {
  LR: [' R', ' L'],
  updown: [' up', ' down'],
  toeheel: [' toe', ' heel'],
  highlow: [' high', ' low'],
  aheadbehind: [' ahead', ' behind'],
};

/** Locale and digit options for a displayed measurement number. */
export const NUMBER_LOCALE = 'en-US';
export const numberFormat = (decimals: number) => ({
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
});

export interface MeasurementParts {
  /** The number as displayed: unsigned when a direction word (L/R, up/down, …) carries the sign. */
  number: number;
  decimals: number;
  /** Unit and direction text that follows the number, e.g. " yd", "° R", " in toe". */
  suffix: string;
}

/** The unit text that follows a number, without a direction word: " yd", "°", "" for none. */
export function unitSuffix(key: MeasurementKey): string {
  const unit = fieldDef(key).unit;
  return unit === 'deg' ? '°' : unit === 'none' ? '' : ` ${unit}`;
}

/** The pieces formatMeasurement joins, for callers that render the number separately. Null when not measured. */
export function measurementParts(key: MeasurementKey, value: number | null): MeasurementParts | null {
  if (value === null || !Number.isFinite(value)) return null;
  const def = fieldDef(key);
  const unit = unitSuffix(key);
  let dir = '';
  if (def.direction) {
    if (value === 0) dir = def.direction === 'toeheel' ? ' centered' : '';
    else dir = SUFFIX[def.direction][value > 0 ? 0 : 1];
  }
  return { number: def.direction ? Math.abs(value) : value, decimals: def.decimals, suffix: `${unit}${dir}` };
}

export function formatMeasurement(key: MeasurementKey, value: number | null): string {
  const p = measurementParts(key, value);
  if (!p) return NOT_MEASURED;
  return `${p.number.toLocaleString(NUMBER_LOCALE, numberFormat(p.decimals))}${p.suffix}`;
}

export function formatImpact(lateral: number | null, vertical: number | null): string {
  if (lateral === null || vertical === null) return NOT_MEASURED;
  return `${formatMeasurement('impactLateral', lateral)} · ${formatMeasurement('impactVertical', vertical)}`;
}
