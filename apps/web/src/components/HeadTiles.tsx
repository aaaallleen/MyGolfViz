import { formatImpact, formatMeasurement, type MeasurementKey, type Shot } from '@fsa/domain';
import { KpiTile } from '@fsa/ui';
import { splitMeasurement } from './KpiGrid';

const TILES: { key: MeasurementKey; label: string; accent: 'ball' | 'club' }[] = [
  { key: 'carry', label: 'Carry', accent: 'ball' },
  { key: 'spin', label: 'Spin', accent: 'ball' },
  { key: 'clubPath', label: 'Club path', accent: 'club' },
  { key: 'ftp', label: 'Face to path', accent: 'club' },
  { key: 'aoa', label: 'Attack angle', accent: 'club' },
];

export function HeadTiles({ shot }: { shot: Shot }) {
  const impact = shot.m.impactLateral === null || shot.m.impactVertical === null ? null : formatImpact(shot.m.impactLateral, shot.m.impactVertical);
  return (
    <section aria-label="Headline metrics" className="head-tiles">
      {TILES.map(({ key, label, accent }) => {
        const v = shot.m[key];
        const s = v === null ? null : splitMeasurement(formatMeasurement(key, v));
        return <KpiTile key={key} label={label} value={s?.value ?? null} unit={s?.unit} accent={accent} />;
      })}
      <KpiTile label="Impact" value={impact} accent="neutral" />
    </section>
  );
}
