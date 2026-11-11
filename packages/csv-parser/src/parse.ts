import Papa from 'papaparse';
import {
  FIELD_DEFS, MEASUREMENT_KEYS, classifyHeader, toCanonical,
  type FieldDef, type MeasurementKey, type Measurements, type QualityFlag, type Shot, type TextKey,
} from '@fsa/domain';
import { normalizeText, parseCell } from './cells';

export const PARSER_VERSION = '1.0.0';

export type ParsedShot = Omit<Shot, 'id' | 'fileId'>;
export interface SummaryRow { club: string; kind: 'Avg' | 'Dev'; sourceRow: number; raw: Record<string, string> }
export interface ColumnReport {
  headers: string[];
  recognized: MeasurementKey[];
  text: TextKey[];
  missing: MeasurementKey[];
  unrecognized: string[];
}
export type WarningCode =
  | 'missing_column' | 'unrecognized_column' | 'unrecognized_unit' | 'duplicate_column'
  | 'invalid_value' | 'row_length_mismatch' | 'relationship_check' | 'no_measurements'
  | 'decoded_as_windows_1252';
export interface ParseWarning { code: WarningCode; message: string; row?: number; column?: string }
export type ParseErrorCode = 'empty_file' | 'not_flightscope_export' | 'no_shots';
export interface ParseResult {
  fileName: string;
  parserVersion: string;
  ok: boolean;
  error: { code: ParseErrorCode; message: string } | null;
  shots: ParsedShot[];
  summaryRows: SummaryRow[];
  columns: ColumnReport;
  warnings: ParseWarning[];
}

type Column =
  | { index: number; header: string; type: 'measurement'; def: FieldDef; sourceUnit: string | null }
  | { index: number; header: string; type: 'text'; key: TextKey };

const FTP_TOLERANCE = 0.15;
const SMASH_TOLERANCE = 0.01;

function emptyColumns(headers: string[] = []): ColumnReport {
  return { headers, recognized: [], text: [], missing: [], unrecognized: [] };
}

function fail(
  fileName: string, code: ParseErrorCode, message: string,
  columns = emptyColumns(), warnings: ParseWarning[] = [],
): ParseResult {
  return { fileName, parserVersion: PARSER_VERSION, ok: false, error: { code, message }, shots: [], summaryRows: [], columns, warnings };
}

const isBlank = (rec: string[]) => rec.every((c) => c.trim() === '');

function classifyColumns(header: string[], columns: ColumnReport, warnings: ParseWarning[]): Column[] {
  const cols: Column[] = [];
  const seenMeasure = new Set<MeasurementKey>();
  const seenText = new Set<TextKey>();
  header.forEach((h, index) => {
    const c = classifyHeader(h);
    if (c.type === 'unknown') {
      columns.unrecognized.push(h);
      warnings.push({ code: 'unrecognized_column', message: `Unrecognized column "${h}" was kept as raw text`, column: h });
    } else if (c.type === 'text') {
      if (seenText.has(c.key)) {
        warnings.push({ code: 'duplicate_column', message: `Duplicate column "${h}" ignored`, column: h });
        return;
      }
      seenText.add(c.key);
      columns.text.push(c.key);
      cols.push({ index, header: h, type: 'text', key: c.key });
    } else {
      if (seenMeasure.has(c.def.key)) {
        warnings.push({ code: 'duplicate_column', message: `Duplicate column "${h}" ignored`, column: h });
        return;
      }
      if (toCanonical(0, c.sourceUnit, c.def.unit) === null) {
        columns.unrecognized.push(h);
        warnings.push({ code: 'unrecognized_unit', message: `Column "${h}" has an unrecognized unit and was dropped`, column: h });
        return;
      }
      seenMeasure.add(c.def.key);
      columns.recognized.push(c.def.key);
      cols.push({ index, header: h, type: 'measurement', def: c.def, sourceUnit: c.sourceUnit });
    }
  });
  for (const def of FIELD_DEFS) {
    if (!seenMeasure.has(def.key)) {
      columns.missing.push(def.key);
      warnings.push({ code: 'missing_column', message: `Column for ${def.label} is not in the file`, column: def.key });
    }
  }
  return cols;
}

function softChecks(m: Measurements): QualityFlag[] {
  const flags: QualityFlag[] = [];
  if (m.ftp !== null && m.ftt !== null && m.clubPath !== null && Math.abs(m.ftp - (m.ftt - m.clubPath)) > FTP_TOLERANCE) {
    flags.push('check_face_to_path');
  }
  if (m.smash !== null && m.ballSpeed !== null && m.clubSpeed !== null && m.clubSpeed > 0
    && Math.abs(m.smash - m.ballSpeed / m.clubSpeed) > SMASH_TOLERANCE) {
    flags.push('check_smash');
  }
  return flags;
}

export function parseFlightScopeCsv(text: string, fileName: string): ParseResult {
  if (text.trim() === '') return fail(fileName, 'empty_file', 'The file is empty');
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = Papa.parse<string[]>(body, { header: false, delimiter: ',', skipEmptyLines: false }).data;

  const headerIdx = records.findIndex((r) => !isBlank(r));
  if (headerIdx < 0) return fail(fileName, 'empty_file', 'The file is empty');
  const header = records[headerIdx]!.map((h) => h.trim());
  const columns = emptyColumns(header);
  const warnings: ParseWarning[] = [];
  const cols = classifyColumns(header, columns, warnings);

  if (!columns.text.includes('club') || columns.recognized.length === 0) {
    return fail(fileName, 'not_flightscope_export', 'This does not look like a FlightScope export', columns, warnings);
  }

  const shots: ParsedShot[] = [];
  const summaryRows: SummaryRow[] = [];
  for (let i = headerIdx + 1; i < records.length; i++) {
    const rec = records[i]!;
    const sourceRow = i + 1;
    if (isBlank(rec)) continue;
    if (rec.length !== header.length) {
      warnings.push({ code: 'row_length_mismatch', message: `Row ${sourceRow} has ${rec.length} cells, expected ${header.length}; skipped`, row: sourceRow });
      continue;
    }
    const raw: Record<string, string> = {};
    header.forEach((h, j) => { if (!(h in raw)) raw[h] = rec[j]!; });

    const texts: Partial<Record<TextKey, string | null>> = {};
    const m = Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, null])) as Measurements;
    for (const c of cols) {
      const cell = rec[c.index]!;
      if (c.type === 'text') {
        texts[c.key] = normalizeText(cell);
        continue;
      }
      const r = parseCell(cell, c.def, c.sourceUnit);
      if (r.ok) m[c.def.key] = r.value;
      else warnings.push({ code: r.reason, message: `Row ${sourceRow}, column "${c.header}": cannot read "${cell}"`, row: sourceRow, column: c.header });
    }

    const club = texts.club ?? null;
    const kindText = [club, texts.shotLabel ?? null].map((t) => t?.toLowerCase()).find((t) => t === 'avg' || t === 'dev');
    if (kindText) {
      summaryRows.push({ club: club ?? 'Unknown club', kind: kindText === 'avg' ? 'Avg' : 'Dev', sourceRow, raw });
      continue;
    }

    const flags: QualityFlag[] = [];
    if (FIELD_DEFS.filter((d) => d.group !== 'environment').every((d) => m[d.key] === null)) {
      flags.push('no_measurements');
      warnings.push({ code: 'no_measurements', message: `Row ${sourceRow} has no measurements`, row: sourceRow });
    }
    for (const f of softChecks(m)) {
      flags.push(f);
      warnings.push({
        code: 'relationship_check', row: sourceRow,
        message: f === 'check_smash'
          ? `Row ${sourceRow}: smash factor does not match ball speed / club speed`
          : `Row ${sourceRow}: face to path does not match face to target minus club path`,
      });
    }
    shots.push({
      sourceRow,
      shotLabel: texts.shotLabel ?? null,
      club: club ?? 'Unknown club',
      shotType: texts.shotType ?? null,
      mode: texts.mode ?? null,
      location: texts.location ?? null,
      m, raw, flags,
    });
  }

  if (shots.length === 0) {
    return fail(fileName, 'no_shots', 'The file has no shot rows', columns, warnings);
  }
  return { fileName, parserVersion: PARSER_VERSION, ok: true, error: null, shots, summaryRows, columns, warnings };
}
