import { compareShots } from '@fsa/analytics';
import { fieldDef, formatMeasurement, type Shot } from '@fsa/domain';
import { Missing } from '@fsa/ui';
import { formatDelta } from '../progression/format';
import type { Slot } from './compareState';

export const CHANGED_CAPTION = 'What changed from A';

/**
 * Every measurement, the baseline A first; each other shot shows its value and, under it, its change from A
 * (that shot − A). Biggest change first, no good/bad colouring.
 */
export function WhatChanged({ base, others }: { base: Shot; others: { slot: Exclude<Slot, 'A'>; shot: Shot }[] }) {
  const rows = compareShots(base.m, others.map((o) => o.shot.m));
  return (
    <section className="compare-changed">
      <table className="compare-table">
        <caption>{CHANGED_CAPTION}</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col" className="compare-table__slot compare-table__slot--a">
              A <span className="compare-baseline">Baseline</span>
            </th>
            {others.map((o) => (
              <th key={o.slot} scope="col" className={`compare-table__slot compare-table__slot--${o.slot.toLowerCase()}`}>{o.slot}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{fieldDef(r.key).label}</th>
              <td className="compare-table__base">{r.base === null ? <Missing /> : formatMeasurement(r.key, r.base)}</td>
              {others.map((o, i) => {
                const v = r.values[i] ?? null;
                const d = r.deltas[i] ?? null;
                return (
                  <td key={o.slot}>
                    <span className="compare-table__value">{v === null ? <Missing /> : formatMeasurement(r.key, v)}</span>
                    <span className="compare-table__delta" title={`${o.slot} − A`}>{d === null ? 'n/a' : formatDelta(r.key, d)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="compare-note">Each shot&apos;s change is that shot − A · sorted by biggest change · missing values are never shown as 0</p>
    </section>
  );
}
