import { filterShots, clubCounts } from '@fsa/analytics';
import { FilterChip, SelectField } from '@fsa/ui';
import { useWorkingSet } from '../state/store';
import { ExcludedMenu } from './ExcludedMenu';

export function FilterBar() {
  const { workingSet, filters, setClub, setFile, excludedIds } = useWorkingSet();
  if (!workingSet) return null;
  const inFile = filterShots(workingSet, { club: null, fileId: filters.fileId });
  const fileCount = (id: string) => workingSet.shots.filter((s) => s.fileId === id).length;
  return (
    <section className="filter-bar" aria-label="Filters">
      <div className="filter-bar__group">
        <div className="filter-bar__label" id="club-filter-label">Club</div>
        <div className="filter-bar__chips" role="group" aria-labelledby="club-filter-label">
          <FilterChip pressed={filters.club === null} label="All" count={inFile.filter((s) => !excludedIds.has(s.id)).length} onClick={() => setClub(null)} />
          {clubCounts(inFile, excludedIds).map(({ club, count }) => (
            <FilterChip key={club} pressed={filters.club === club} label={club} count={count} onClick={() => setClub(club)} />
          ))}
        </div>
      </div>
      {excludedIds.size > 0 && <ExcludedMenu />}
      <SelectField
        label="Source file"
        value={filters.fileId ?? ''}
        onChange={(v) => setFile(v === '' ? null : v)}
        options={[
          { value: '', label: `All files · ${workingSet.shots.length} shots` },
          ...workingSet.files.map((f) => ({ value: f.id, label: `File ${f.ordinal} · ${f.name} · ${fileCount(f.id)}` })),
        ]}
      />
    </section>
  );
}
