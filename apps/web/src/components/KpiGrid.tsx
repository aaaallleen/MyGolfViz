import { HEADLINE_KEYS, headlineMetrics } from '@fsa/analytics';
import { fieldDef, measurementParts, type Shot } from '@fsa/domain';
import { KpiTile } from '@fsa/ui';

export function KpiGrid({ shots }: { shots: readonly Shot[] }) {
  const metrics = headlineMetrics(shots);
  return (
    <div className="kpi-grid">
      {HEADLINE_KEYS.map((key) => {
        const def = fieldDef(key);
        const s = metrics[key];
        const p = measurementParts(key, s.mean);
        const count = s.n === s.of ? `n ${s.n}` : `n ${s.n} of ${s.of}`;
        const sub = s.sd === null ? count : `± ${s.sd.toFixed(def.decimals)} · ${count}`;
        return (
          <KpiTile
            key={key}
            label={key === 'lateral' ? 'Mean lateral' : def.label}
            value={p ? p.number : null}
            decimals={p?.decimals}
            unit={p?.suffix.trim() || undefined}
            sub={sub}
            accent={def.group === 'club' ? 'club' : 'ball'}
          />
        );
      })}
    </div>
  );
}
