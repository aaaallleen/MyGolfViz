import NumberFlow from '@number-flow/react';
import { clsx } from 'clsx';
import { NUMBER_LOCALE, numberFormat } from '@fsa/domain';
import { Missing } from './Missing';

export type KpiTileProps = {
  label: string;
  /** A number rolls to its new digits when it changes; a string is shown as is; null shows a dash (read as "Not measured"). */
  value: number | string | null;
  /** Fraction digits for a numeric value. */
  decimals?: number;
  unit?: string;
  sub?: string;
  accent: 'ball' | 'club' | 'neutral';
};

export function KpiTile({ label, value, decimals = 0, unit, sub, accent }: KpiTileProps) {
  const missing = value === null;
  return (
    <div className={clsx('fsa-kpi', `fsa-kpi--${accent}`)}>
      <div className="fsa-kpi__label">{label}</div>
      <div className={clsx('fsa-kpi__value', missing && 'fsa-kpi__value--missing')}>
        {missing ? <Missing /> : typeof value === 'number' ? (
          // NumberFlow honours prefers-reduced-motion by default and labels itself with the formatted value.
          <NumberFlow value={value} locales={NUMBER_LOCALE} format={numberFormat(decimals)} />
        ) : (
          value
        )}
        {!missing && unit ? <span className="fsa-kpi__unit">{unit}</span> : null}
      </div>
      {sub ? <div className="fsa-kpi__sub">{sub}</div> : null}
    </div>
  );
}
