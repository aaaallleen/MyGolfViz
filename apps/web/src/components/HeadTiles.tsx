import { formatImpact, measurementParts, type MeasurementKey, type Shot } from '@fsa/domain';
import { KpiTile } from '@fsa/ui';

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
        const p = measurementParts(key, shot.m[key]);
        return <KpiTile key={key} label={label} value={p ? p.number : null} decimals={p?.decimals} unit={p?.suffix.trim() || undefined} accent={accent} />;
      })}
      <KpiTile label="Impact" value={impact} accent="neutral" />
    </section>
  );
}
