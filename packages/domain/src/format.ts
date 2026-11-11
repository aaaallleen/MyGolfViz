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

export function formatMeasurement(key: MeasurementKey, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NOT_MEASURED;
  const def = fieldDef(key);
  const num = (def.direction ? Math.abs(value) : value).toLocaleString('en-US', {
    minimumFractionDigits: def.decimals,
    maximumFractionDigits: def.decimals,
  });
  const unit = def.unit === 'deg' ? '°' : def.unit === 'none' ? '' : ` ${def.unit}`;
  let dir = '';
  if (def.direction) {
    if (value === 0) dir = def.direction === 'toeheel' ? ' centered' : '';
    else dir = SUFFIX[def.direction][value > 0 ? 0 : 1];
  }
  return `${num}${unit}${dir}`;
}

export function formatImpact(lateral: number | null, vertical: number | null): string {
  if (lateral === null || vertical === null) return NOT_MEASURED;
  return `${formatMeasurement('impactLateral', lateral)} · ${formatMeasurement('impactVertical', vertical)}`;
}
