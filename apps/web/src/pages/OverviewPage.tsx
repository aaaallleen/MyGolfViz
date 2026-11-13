import { useMemo, useState } from 'react';
import { dispersionByClub } from '@fsa/analytics';
import { formatSessionDate, sessionTitle } from '@fsa/domain';
import { Button, EmptyState } from '@fsa/ui';
import { clubColors } from '@fsa/visualizations';
import { ClubTable } from '../components/ClubTable';
import { FilterBar } from '../components/FilterBar';
import { KpiGrid } from '../components/KpiGrid';
import { SelectedShotCard } from '../components/SelectedShotCard';
import { SessionDetailsForm } from '../components/SessionDetailsForm';
import { includeAllWithUndo } from '../components/includeAllWithUndo';
import { shotLabel } from '../components/shotLabel';
import { ShotTable } from '../components/ShotTable';
import { ShotPatternPanel } from '../components/ShotPatternPanel';
import { useWorkingSet } from '../state/store';

export function OverviewPage() {
  const ws = useWorkingSet();
  const [editing, setEditing] = useState(false);
  const { workingSet, details, filters, visibleShots: shots, tableShots, excludedIds, selectedId } = ws;
  const [announcement, setAnnouncement] = useState('');
  // Colours come from every club in the session, so filtering never repaints a club.
  const colors = useMemo(() => clubColors(workingSet?.shots.map((s) => s.club) ?? []), [workingSet]);

  // Club-level highlight. Picking a shot (plot, table, card, Next) highlights its club; tapping a club
  // in the Clubs table toggles it. The analysis opens with nothing highlighted.
  const [highlightClub, setHighlightClub] = useState<string | null>(null);
  const [seenSelection, setSeenSelection] = useState(selectedId);
  if (seenSelection !== selectedId) {
    setSeenSelection(selectedId);
    setHighlightClub(tableShots.find((s) => s.id === selectedId)?.club ?? null);
  }

  // Tapping a club highlights it and jumps to its first shot; tapping it again clears both.
  const highlight = (club: string | null) => {
    setHighlightClub(club);
    ws.select(club === null ? null : shots.find((s) => s.club === club)?.id ?? null);
  };

  if (!workingSet) return null;
  const selected = tableShots.find((s) => s.id === selectedId);
  const exclude = (id: string) => {
    const s = tableShots.find((x) => x.id === id);
    ws.excludeAndAdvance(id);
    if (s) setAnnouncement(`${shotLabel(s)} excluded · ${shots.length - (excludedIds.has(id) ? 0 : 1)} shots used`);
  };
  const include = (id: string) => {
    const s = tableShots.find((x) => x.id === id);
    ws.setExcluded(id, false);
    if (s) setAnnouncement(`${shotLabel(s)} included · ${shots.length + (excludedIds.has(id) ? 1 : 0)} shots used`);
  };
  const excludedCount = tableShots.length - shots.length;
  const card = (
    <SelectedShotCard shots={shots} selected={selected} excluded={selected !== undefined && excludedIds.has(selected.id)}
      files={workingSet.files} onSelect={ws.select} onStep={ws.step} onExclude={exclude} onInclude={include}
      color={colors.get(selected?.club ?? '')} />
  );
  const shotsPanel = (
    <section className="panel">
      <h2>Shots</h2>
      <p className="panel__note">Ordered by club within each file · the selected row, plot point and shot card stay in step</p>
      <ShotTable shots={tableShots} files={workingSet.files} selectedId={selectedId} onSelect={ws.select} grouped={filters.club === null} />
      <p className="panel__note">{`${shots.length} used · ${excludedCount} excluded · “–” means the CSV held no value; it is never treated as zero`}</p>
    </section>
  );
  const groups = dispersionByClub(shots, ws.landingMode).map((g) => ({ ...g, color: colors.get(g.club) ?? '#9BA9A1' }));

  const modes = [...new Set(workingSet.shots.map((s) => s.mode).filter((m): m is string => m !== null))];
  const fileOrdinal = workingSet.files.find((f) => f.id === filters.fileId)?.ordinal;
  const heading = `Averages · ${filters.club ?? 'All clubs'}${fileOrdinal !== undefined ? ` · File ${fileOrdinal}` : ''} · ${shots.length} shots`;

  return (
    <div className="overview">
      <section className="overview__head">
        <div className="overview__title">
          <h1>{sessionTitle(details)}</h1>
          <div className="overview__meta">
            <span>{formatSessionDate(details.date)}</span>
            <span>{`${workingSet.files.length} source files`}</span>
            <span>{`${workingSet.shots.length} shots`}</span>
            {modes.length > 0 && <span>{modes.join(', ')}</span>}
            <span className="overview__chip">In this browser only</span>
          </div>
          {details.notes.trim() !== '' && <p className="overview__notes">{details.notes}</p>}
        </div>
        <Button onClick={() => setEditing((e) => !e)} aria-expanded={editing}>{editing ? 'Done' : 'Edit details'}</Button>
      </section>
      {editing && <SessionDetailsForm value={details} onChange={ws.setDetails} />}

      <FilterBar />

      <p role="status" className="visually-hidden">{announcement}</p>

      {tableShots.length === 0 ? (
        <EmptyState
          title="No shots match these filters"
          body="Try a different club or source file."
          action={<Button variant="primary" onClick={() => ws.setClub(null)}>Show all clubs</Button>}
        />
      ) : shots.length === 0 ? (
        <>
          <EmptyState
            title={`All ${tableShots.length} shots here are excluded`}
            body="Include them again to see averages and plots."
            action={<Button variant="primary" onClick={() => includeAllWithUndo(ws.includeAll, 'filter')}>Include all</Button>}
          />
          {card}
          {shotsPanel}
        </>
      ) : (
        <>
          <section aria-label="Session averages" className="overview__averages">
            <h2>{heading}</h2>
            <KpiGrid shots={shots} />
          </section>
          <section className="overview__panels">
            <ShotPatternPanel shots={shots} groups={groups} mode={ws.landingMode} onMode={ws.setLandingMode}
              selectedId={selectedId} onSelect={ws.select} highlightClub={highlightClub} />
            <div className="overview__side">
              <ClubTable groups={groups} mode={ws.landingMode} highlightClub={highlightClub} onHighlight={highlight} />
              {card}
            </div>
          </section>
          {shotsPanel}
        </>
      )}
    </div>
  );
}
