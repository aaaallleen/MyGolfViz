import type { ParsedShot, ParseResult, ParseWarning } from '@fsa/csv-parser';
import type { Handedness } from '@fsa/domain';

export interface ImportFileManifest {
  field: string;
  name: string;
  parserVersion: string;
  summaryRowCount: number;
  warnings: ParseWarning[];
  shots: ParsedShot[];
  acceptCrossSessionDuplicate: boolean;
}

export type ImportTarget =
  | { sessionId: string }
  | { newSession: { name: string; date: string; notes: string; handedness: Handedness } };

export interface ImportManifest {
  destination: ImportTarget;
  files: ImportFileManifest[];
}

export function toFileManifest(
  field: string,
  parse: ParseResult,
  acceptCrossSessionDuplicate: boolean,
): ImportFileManifest {
  return {
    field,
    name: parse.fileName,
    parserVersion: parse.parserVersion,
    summaryRowCount: parse.summaryRows.length,
    warnings: parse.warnings,
    shots: parse.shots,
    acceptCrossSessionDuplicate,
  };
}
