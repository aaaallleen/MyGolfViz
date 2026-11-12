import { NOT_MEASURED } from '@fsa/domain';

export type KpiTileProps = {
  label: string;
  value: string | null;
  unit?: string;
  sub?: string;
  accent: 'ball' | 'club' | 'neutral';
};

export function KpiTile({ label, value, unit, sub, accent }: KpiTileProps) {
  const missing = value === null;
  return (
    <div className={`fsa-kpi fsa-kpi--${accent}`}>
      <div className="fsa-kpi__label">{label}</div>
      <div className={missing ? 'fsa-kpi__value fsa-kpi__value--missing' : 'fsa-kpi__value'}>
        {missing ? NOT_MEASURED : value}
        {!missing && unit ? <span className="fsa-kpi__unit">{unit}</span> : null}
      </div>
      {sub ? <div className="fsa-kpi__sub">{sub}</div> : null}
    </div>
  );
}
