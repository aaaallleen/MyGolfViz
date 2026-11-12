import { toCanonical } from './units';
import type { Direction, FieldDef, FieldGroup, HeaderClass, MeasurementKey, TextKey, Unit, ValueKind } from './types';

const d = (
  key: MeasurementKey, names: string[], unit: Unit, kind: ValueKind, label: string,
  group: FieldGroup, decimals: number, direction: Direction = null,
): FieldDef => ({ key, names, unit, kind, label, group, decimals, direction });

export const FIELD_DEFS: readonly FieldDef[] = [
  d('ballSpeed', ['ball', 'ball speed'], 'mph', 'number', 'Ball speed', 'ball', 1),
  d('clubSpeed', ['club', 'club speed'], 'mph', 'number', 'Club speed', 'club', 1),
  d('smash', ['smash', 'smash factor'], 'none', 'number', 'Smash factor', 'club', 2),
  d('carry', ['carry', 'carry distance'], 'yd', 'number', 'Carry', 'ball', 1),
  d('total', ['total', 'total distance'], 'yd', 'number', 'Total', 'ball', 1),
  d('roll', ['roll'], 'yd', 'number', 'Roll', 'ball', 1),
  d('swingH', ['swing h', 'swing plane h', 'h-plane'], 'deg', 'signedLR', 'H-plane', 'club', 1, 'LR'),
  d('spin', ['spin', 'total spin', 'spin rate'], 'rpm', 'number', 'Spin', 'ball', 0),
  d('height', ['height', 'apex', 'max height'], 'ft', 'number', 'Apex height', 'ball', 1),
  d('flightTime', ['time', 'flight time'], 's', 'number', 'Flight time', 'ball', 1),
  d('aoa', ['aoa', 'angle of attack', 'attack angle'], 'deg', 'number', 'Attack angle', 'club', 1, 'updown'),
  d('spinLoft', ['spin loft'], 'deg', 'number', 'Spin loft', 'club', 1),
  d('swingV', ['swing v', 'swing plane v', 'v-plane'], 'deg', 'number', 'V-plane', 'club', 1),
  d('spinAxis', ['spin axis'], 'deg', 'signedLR', 'Spin axis', 'ball', 1, 'LR'),
  d('lateral', ['lateral', 'lateral landing'], 'yd', 'signedLR', 'Lateral', 'ball', 1, 'LR'),
  d('ftp', ['ftp', 'face to path'], 'deg', 'signedLR', 'Face to path', 'club', 1, 'LR'),
  d('ftt', ['ftt', 'face to target'], 'deg', 'signedLR', 'Face to target', 'club', 1, 'LR'),
  d('dynamicLoft', ['dynamic loft'], 'deg', 'number', 'Dynamic loft', 'club', 1),
  d('clubPath', ['club path'], 'deg', 'signedLR', 'Club path', 'club', 1, 'LR'),
  d('launchH', ['launch h', 'horizontal launch', 'launch direction'], 'deg', 'signedLR', 'Launch H', 'ball', 1, 'LR'),
  d('launchV', ['launch v', 'vertical launch', 'launch angle'], 'deg', 'number', 'Launch V', 'ball', 1),
  d('lowPoint', ['low point'], 'in', 'feetInches', 'Low point', 'club', 1, 'aheadbehind'),
  d('descentV', ['descentv', 'descent v', 'descent angle'], 'deg', 'number', 'Descent angle', 'ball', 1),
  d('curve', ['curve dist', 'curve'], 'yd', 'number', 'Curve', 'ball', 1, 'LR'),
  d('impactLateral', ['lateral impact', 'impact lateral'], 'in', 'number', 'Lateral impact', 'impact', 2, 'toeheel'),
  d('impactVertical', ['vertical impact', 'impact vertical'], 'in', 'number', 'Vertical impact', 'impact', 2, 'highlow'),
  d('altitude', ['altitude'], 'ft', 'number', 'Altitude', 'environment', 1),
];

export const MEASUREMENT_KEYS: readonly MeasurementKey[] = FIELD_DEFS.map((f) => f.key);

const BY_KEY = new Map<MeasurementKey, FieldDef>(FIELD_DEFS.map((f) => [f.key, f]));

export function fieldDef(key: MeasurementKey): FieldDef {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unknown measurement key: ${key}`);
  return def;
}

const TEXT_NAMES: ReadonlyArray<readonly [TextKey, readonly string[]]> = [
  ['club', ['club']],
  ['shotLabel', ['shot', 'shot #', 'shot number']],
  ['shotType', ['shot type']],
  ['mode', ['mode']],
  ['location', ['location']],
];

export function splitHeader(header: string): { name: string; unit: string | null } {
  const clean = header.trim().replace(/\s+/g, ' ');
  const m = /^(.*?)\s*\(([^)]*)\)$/.exec(clean);
  if (!m) return { name: clean, unit: null };
  return { name: m[1]!.trim(), unit: m[2]!.trim() };
}

export function classifyHeader(header: string): HeaderClass {
  const { name, unit } = splitHeader(header);
  const lower = name.toLowerCase();
  if (unit === null) {
    for (const [key, names] of TEXT_NAMES) {
      if (names.includes(lower)) return { type: 'text', key };
    }
  }
  const def = FIELD_DEFS.find((f) => f.names.includes(lower));
  if (def) return { type: 'measurement', def, sourceUnit: unit };
  return { type: 'unknown' };
}

/**
 * CSV headers that did not become a parsed value, in first-seen order: unrecognized names,
 * measurements whose unit can't be converted, and repeats of a column already read. The parser keeps
 * these cells in each shot's `raw`, so a viewer can still show them as text.
 */
export function unparsedHeaders(headers: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const used = new Set<string>();
  for (const h of headers) {
    if (seen.has(h)) continue;
    seen.add(h);
    const c = classifyHeader(h);
    const key = c.type === 'text' ? `text:${c.key}` : c.type === 'measurement' ? `m:${c.def.key}` : null;
    const readable = c.type !== 'measurement' || toCanonical(0, c.sourceUnit, c.def.unit) !== null;
    if (key === null || !readable || used.has(key)) out.push(h);
    else used.add(key);
  }
  return out;
}
