import { compareShots } from '@fsa/analytics';
import { fieldDef, formatMeasurement, type Shot } from '@fsa/domain';
import { Missing } from '@fsa/ui';
import { formatDelta } from '../progression/format';

/** Every measurement of two shots, B then A, with the change A − B; biggest change first, no good/bad colouring. */
export function WhatChanged({ a, b }: { a: Shot; b: Shot }) {
  const rows = compareShots(a.m, b.m);
  return (
    <section className="compare-changed">
      <table className="compare-table">
        <caption>What changed · B → A</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col" className="compare-table__slot-b">B</th>
            <th scope="col" className="compare-table__slot-a">A</th>
            <th scope="col" title="A − B">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{fieldDef(r.key).label}</th>
              <td>{r.b === null ? <Missing /> : formatMeasurement(r.key, r.b)}</td>
              <td>{r.a === null ? <Missing /> : formatMeasurement(r.key, r.a)}</td>
              <td>{r.delta === null ? 'n/a' : formatDelta(r.key, r.delta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="compare-note">Sorted by size of change · missing values are never shown as 0</p>
    </section>
  );
}
