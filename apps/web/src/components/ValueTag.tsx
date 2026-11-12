import type { Provenance } from '@fsa/domain';

const WORD: Record<Provenance, string> = { measured: 'measured', derived: 'derived', illustrative: 'illustrative', unavailable: 'unavailable' };

/** Compact provenance pill for dense readouts; the full legend is shown once on the page. */
export function ValueTag({ kind }: { kind: Provenance }) {
  return <span className={`value-tag value-tag--${kind}`}>{WORD[kind]}</span>;
}
