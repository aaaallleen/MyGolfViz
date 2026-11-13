import { formatMeasurement, measurementParts, type MeasurementKey, type Shot } from '@fsa/domain';
import { KpiTile } from '@fsa/ui';

const TILES: { key: MeasurementKey; label: string; accent: 'ball' | 'club' }[] = [
  { key: 'carry', label: 'Carry', accent: 'ball' },
  { key: 'spin', label: 'Spin', accent: 'ball' },
  { key: 'clubPath', label: 'Club path', accent: 'club' },
  { key: 'ftp', label: 'Face to path', accent: 'club' },
  { key: 'aoa', label: 'Attack angle', accent: 'club' },
];

export function HeadTiles({ shot }: { shot: Shot }) {
  // Impact has two parts: toe/heel as the big number, high/low on the line below, so it fits the tile like the others.
  const { impactLateral: lat, impactVertical: vert } = shot.m;
  const toe = lat === null || vert === null ? null : measurementParts('impactLateral', lat);
  return (
    <section aria-label="Headline metrics" className="head-tiles">
      {TILES.map(({ key, label, accent }) => {
        const p = measurementParts(key, shot.m[key]);
        return <KpiTile key={key} label={label} value={p ? p.number : null} decimals={p?.decimals} unit={p?.suffix.trim() || undefined} accent={accent} />;
      })}
      <KpiTile label="Impact" value={toe ? toe.number : null} decimals={toe?.decimals} unit={toe?.suffix.trim() || undefined}
        sub={toe && vert !== null ? formatMeasurement('impactVertical', vert) : undefined} accent="neutral" />
    </section>
  );
}
