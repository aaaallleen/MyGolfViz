export type MeasurementKey =
  | 'ballSpeed' | 'clubSpeed' | 'smash' | 'carry' | 'total' | 'roll' | 'swingH' | 'spin' | 'height'
  | 'flightTime' | 'aoa' | 'spinLoft' | 'swingV' | 'spinAxis' | 'lateral' | 'ftp' | 'ftt' | 'dynamicLoft'
  | 'clubPath' | 'launchH' | 'launchV' | 'lowPoint' | 'descentV' | 'curve' | 'impactLateral'
  | 'impactVertical' | 'altitude';
export type Unit = 'mph' | 'yd' | 'rpm' | 'ft' | 'in' | 'deg' | 's' | 'none';
export type ValueKind = 'number' | 'signedLR' | 'feetInches';
export type Direction = 'LR' | 'updown' | 'toeheel' | 'highlow' | 'aheadbehind' | null;
export type FieldGroup = 'ball' | 'club' | 'impact' | 'environment';
export interface FieldDef {
  key: MeasurementKey;
  names: readonly string[];
  unit: Unit;
  kind: ValueKind;
  label: string;
  group: FieldGroup;
  decimals: number;
  direction: Direction;
}
export type TextKey = 'club' | 'shotLabel' | 'shotType' | 'mode' | 'location';
export type HeaderClass =
  | { type: 'measurement'; def: FieldDef; sourceUnit: string | null }
  | { type: 'text'; key: TextKey }
  | { type: 'unknown' };

export type Measurements = Record<MeasurementKey, number | null>;
export type Provenance = 'measured' | 'derived' | 'illustrative' | 'unavailable';
export type QualityFlag = 'no_measurements' | 'check_face_to_path' | 'check_smash';
export interface SourceFile {
  id: string;
  name: string;
  ordinal: number;
  sha256: string;
  byteLength: number;
  parserVersion: string;
}
export interface Shot {
  id: string;
  fileId: string;
  sourceRow: number;
  shotLabel: string | null;
  club: string;
  shotType: string | null;
  mode: string | null;
  location: string | null;
  m: Measurements;
  raw: Record<string, string>;
  flags: QualityFlag[];
}
export interface WorkingSet {
  files: SourceFile[];
  shots: Shot[];
}
/** Yards or unit vectors: x lateral (right +), y downrange (target +), z up. */
export type Vec3 = [number, number, number];
