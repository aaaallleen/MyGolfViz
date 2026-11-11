import type { Provenance } from '@fsa/domain';

const COPY: Record<Provenance, string> = {
  measured: 'Measured · from the CSV',
  derived: 'Derived · calculated from measured values',
  illustrative: 'Illustrative · drawn for orientation',
  unavailable: 'Unavailable · not in the CSV',
};
const ORDER: Provenance[] = ['measured', 'derived', 'illustrative', 'unavailable'];

export function ProvenanceTag({ kind }: { kind: Provenance }) {
  return (
    <span className={`fsa-prov fsa-prov--${kind}`}>
      <span className="fsa-prov__dot" aria-hidden="true" />
      {COPY[kind]}
    </span>
  );
}

export function ProvenanceLegend() {
  return (
    <ul className="fsa-prov-legend" aria-label="Value provenance">
      {ORDER.map((k) => (
        <li key={k}>
          <ProvenanceTag kind={k} />
        </li>
      ))}
    </ul>
  );
}
