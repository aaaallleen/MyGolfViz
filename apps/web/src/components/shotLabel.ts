import type { Shot } from '@fsa/domain';

export function shotLabel(s: Shot): string {
  return `Shot ${s.shotLabel ?? s.sourceRow}`;
}
