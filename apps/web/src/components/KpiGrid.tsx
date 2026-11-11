import { HEADLINE_KEYS, headlineMetrics } from '@fsa/analytics';
import { fieldDef, formatMeasurement, type Shot } from '@fsa/domain';
import { KpiTile } from '@fsa/ui';

/** Split "247.6 yd" / "8.4° R" into the number and the unit-or-direction remainder. */
export function splitMeasurement(text: string): { value: string; unit: string } {
  const m = /^(-?[\d.,]+)\s*(.*)$/.exec(text);
  return m ? { value: m[1]!, unit: m[2]! } : { value: text, unit: '' };
}

export function KpiGrid({ shots }: { shots: readonly Shot[] }) {
  const metrics = headlineMetrics(shots);
  return (
    <div className="kpi-grid">
      {HEADLINE_KEYS.map((key) => {
        const def = fieldDef(key);
        const s = metrics[key];
        const split = s.mean === null ? null : splitMeasurement(formatMeasurement(key, s.mean));
        const count = s.n === s.of ? `n ${s.n}` : `n ${s.n} of ${s.of}`;
        const sub = s.sd === null ? count : `± ${s.sd.toFixed(def.decimals)} · ${count}`;
        return (
          <KpiTile
            key={key}
            label={def.label}
            value={split ? split.value : null}
            {...(split && split.unit ? { unit: split.unit } : {})}
            sub={sub}
            accent={def.group === 'club' ? 'club' : 'ball'}
          />
        );
      })}
    </div>
  );
}
