import type { MeasurementKey } from '@fsa/domain';

export type Category = 'distance' | 'accuracy' | 'consistency' | 'delivery' | 'flight' | 'strike';

export const CATEGORIES: readonly { id: Category; title: string; question: string }[] = [
  { id: 'distance', title: 'Distance', question: 'Are distances improving and becoming more predictable?' },
  { id: 'accuracy', title: 'Accuracy', question: 'Are shots starting and finishing closer to the line?' },
  { id: 'consistency', title: 'Consistency', question: 'Is the swing becoming more repeatable?' },
  { id: 'delivery', title: 'Club delivery', question: 'Are swing mechanics and impact conditions improving?' },
  { id: 'flight', title: 'Ball flight', question: 'Is the flight more efficient and controlled?' },
  { id: 'strike', title: 'Strike quality', question: 'Is energy transfer better and contact more consistent?' },
];

export type TileKind = 'metric' | 'accuracy' | 'variation' | 'mishit' | 'speedSmash' | 'impact' | 'gapping';

export type TileId =
  | 'carry' | 'total' | 'roll' | 'gapping'
  | 'lateral' | 'launchH' | 'curve'
  | 'carry-sd' | 'lateral-sd' | 'mishit'
  | 'clubPath' | 'ftp' | 'ftt' | 'aoa' | 'lowPoint'
  | 'spin' | 'spinAxis' | 'launchV' | 'height' | 'descentV'
  | 'speed-smash' | 'smash' | 'ballSpeed' | 'spinLoft' | 'impact';

export interface TileDef {
  id: TileId;
  title: string;
  category: Category;
  kind: TileKind;
  metric?: MeasurementKey;
}

function t(id: TileId, title: string, category: Category, kind: TileKind, metric?: MeasurementKey): TileDef {
  return metric ? { id, title, category, kind, metric } : { id, title, category, kind };
}

export const TILES: readonly TileDef[] = [
  t('carry', 'Carry', 'distance', 'metric', 'carry'),
  t('total', 'Total', 'distance', 'metric', 'total'),
  t('roll', 'Roll', 'distance', 'metric', 'roll'),
  t('gapping', 'Club gapping', 'distance', 'gapping'),
  t('lateral', 'Lateral (landing)', 'accuracy', 'accuracy', 'lateral'),
  t('launchH', 'Launch direction (H)', 'accuracy', 'accuracy', 'launchH'),
  t('curve', 'Curve distance', 'accuracy', 'accuracy', 'curve'),
  t('carry-sd', 'Carry variation (SD)', 'consistency', 'variation', 'carry'),
  t('lateral-sd', 'Direction variation (lateral SD)', 'consistency', 'variation', 'lateral'),
  t('mishit', 'Mishit frequency', 'consistency', 'mishit'),
  t('clubPath', 'Club path', 'delivery', 'metric', 'clubPath'),
  t('ftp', 'Face to path', 'delivery', 'metric', 'ftp'),
  t('ftt', 'Face to target', 'delivery', 'metric', 'ftt'),
  t('aoa', 'Attack angle', 'delivery', 'metric', 'aoa'),
  t('lowPoint', 'Low point', 'delivery', 'metric', 'lowPoint'),
  t('spin', 'Spin', 'flight', 'metric', 'spin'),
  t('spinAxis', 'Spin axis', 'flight', 'metric', 'spinAxis'),
  t('launchV', 'Launch angle (V)', 'flight', 'metric', 'launchV'),
  t('height', 'Apex (height)', 'flight', 'metric', 'height'),
  t('descentV', 'Descent angle', 'flight', 'metric', 'descentV'),
  t('speed-smash', 'Speed & smash', 'strike', 'speedSmash'),
  t('smash', 'Smash', 'strike', 'metric', 'smash'),
  t('ballSpeed', 'Ball speed', 'strike', 'metric', 'ballSpeed'),
  t('spinLoft', 'Spin loft', 'strike', 'metric', 'spinLoft'),
  t('impact', 'Impact location', 'strike', 'impact'),
];

export const DEFAULT_LAYOUT: readonly TileId[] = [
  'carry', 'carry-sd', 'lateral', 'ftp', 'spin', 'speed-smash', 'impact', 'mishit',
];

export const LAYOUT_KEY = 'progression.layout';

const KNOWN = new Set<string>(TILES.map((x) => x.id));

/** Parse a stored `{ tiles: unknown[] }`: known ids only, first occurrence kept. */
export function parseLayout(value: unknown): TileId[] {
  const tiles = (value as { tiles?: unknown } | null | undefined)?.tiles;
  if (!Array.isArray(tiles)) return [...DEFAULT_LAYOUT];
  const out: TileId[] = [];
  for (const id of tiles) {
    if (typeof id === 'string' && KNOWN.has(id) && !out.includes(id as TileId)) out.push(id as TileId);
  }
  return out;
}

export function moveTile(layout: readonly TileId[], id: TileId, delta: -1 | 1): TileId[] {
  const next = [...layout];
  const i = next.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
