import { toCanonical, type FieldDef } from '@fsa/domain';

export type CellResult =
  | { ok: true; value: number | null }
  | { ok: false; reason: 'invalid_value' | 'unrecognized_unit' };

const NULL_TOKENS = new Set(['', '-', '—', 'n/a']);

function clean(raw: string): string {
  return raw.replace(/[  ]/g, ' ').trim();
}

export function normalizeText(raw: string): string | null {
  const t = clean(raw);
  return NULL_TOKENS.has(t.toLowerCase()) ? null : t;
}

const NUM = String.raw`\d+(?:\.\d+)?`;
const NUMBER_RE = new RegExp(String.raw`^([+-]?${NUM}|[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?:\s+(\S+))?$`);
const LR_RE = new RegExp(String.raw`^(${NUM})\s*([LR])$`, 'i');
const ZERO_RE = /^0(?:\.0+)?$/;
const INCH_MARK = String.raw`(?:″|"|”|'')`;
const FT_IN_RE = new RegExp(String.raw`^([+-])?(?:(${NUM})')?\s*(?:(${NUM})\s*${INCH_MARK}?)?$`);

const INVALID: CellResult = { ok: false, reason: 'invalid_value' };

function finish(value: number, def: FieldDef, sourceUnit: string | null): CellResult {
  const v = toCanonical(value, sourceUnit, def.unit);
  return v === null ? { ok: false, reason: 'unrecognized_unit' } : { ok: true, value: v };
}

export function parseCell(raw: string, def: FieldDef, sourceUnit: string | null): CellResult {
  const text = normalizeText(raw);
  if (text === null) return { ok: true, value: null };

  if (def.kind === 'signedLR') {
    if (ZERO_RE.test(text)) return finish(0, def, sourceUnit);
    const m = LR_RE.exec(text);
    if (!m) return INVALID;
    const n = Number(m[1]);
    return finish(m[2]!.toUpperCase() === 'L' ? -n : n, def, sourceUnit);
  }

  if (def.kind === 'feetInches') {
    const m = FT_IN_RE.exec(text);
    if (!m || (m[2] === undefined && m[3] === undefined)) return INVALID;
    const total = Number(m[2] ?? 0) * 12 + Number(m[3] ?? 0);
    return finish(m[1] === '-' ? -total : total, def, sourceUnit);
  }

  const m = NUMBER_RE.exec(text);
  if (!m) return INVALID;
  if (m[2] !== undefined && (sourceUnit === null || m[2].toLowerCase() !== sourceUnit.trim().toLowerCase())) {
    return INVALID;
  }
  return finish(Number(m[1]!.replace(/,/g, '')), def, sourceUnit);
}
