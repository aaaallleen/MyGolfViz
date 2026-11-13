import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAppPaths } from '../paths';
import { buildReplayScene } from '@fsa/analytics';
import { Button, EmptyState, ProvenanceLegend, TabList, TabPanel, Tabs } from '@fsa/ui';
import { AllMeasurements } from '../components/AllMeasurements';
import { BallDataPanel } from '../components/BallDataPanel';
import { Club2DTab } from '../components/Club2DTab';
import { Club3DTab } from '../components/Club3DTab';
import { HeadTiles } from '../components/HeadTiles';
import { ImpactTab } from '../components/ImpactTab';
import { includeAllWithUndo } from '../components/bulkWithUndo';
import { shotLabel } from '../components/shotLabel';
import { ShotHeader } from '../components/ShotHeader';
import { usePhone } from '../components/usePhone';
import { useWorkingSet, type InspectorTab } from '../state/store';

const TABS: { id: InspectorTab; label: string; short: string }[] = [
  { id: 'impact', label: 'Face impact', short: 'Impact' },
  { id: '3d', label: '3D', short: '3D' },
  { id: '2d', label: '2D reconstruction', short: '2D' },
];

export function InspectorPage() {
  const ws = useWorkingSet();
  const paths = useAppPaths();
  const phone = usePhone();
  const { workingSet, details, visibleShots, tableShots, excludedIds, selectedId, inspectorTab } = ws;
  const handedness = details.handedness;
  const [announcement, setAnnouncement] = useState('');

  // The inspector shows an included shot, or an excluded one the user opened on purpose. With nothing
  // selected (or a selection outside the filter) it opens the first included shot and selects it.
  const inTable = tableShots.find((s) => s.id === selectedId);
  const selected = visibleShots.find((s) => s.id === selectedId) ?? (inTable && excludedIds.has(inTable.id) ? inTable : undefined);
  const shot = selected ?? visibleShots[0];
  const excluded = shot !== undefined && excludedIds.has(shot.id);

  // Rebuilt only when the shots drawn (by identity of ids) or handedness change, not on unrelated UI state.
  // An excluded current shot needs a scene too, though it never joins the comparison lists.
  const sceneShots = excluded ? [...visibleShots, shot] : visibleShots;
  const idKey = sceneShots.map((s) => s.id).join('|');
  const scenes = useMemo(
    () => new Map(sceneShots.map((s) => [s.id, buildReplayScene(s, handedness)] as const)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workingSet, idKey, handedness],
  );
  const others = useMemo(
    () => visibleShots.filter((s) => s.id !== shot?.id).map((s) => scenes.get(s.id)!),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenes, shot?.id],
  );
  // Same-club shots: the 3D club views' "All shots" overlay, and Ball flight's default comparison.
  const sameClub = useMemo(
    () => visibleShots.filter((s) => s.id !== shot?.id && s.club === shot?.club).map((s) => scenes.get(s.id)!),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenes, shot?.id, shot?.club],
  );

  const { select } = ws;
  useEffect(() => {
    if (!inTable && shot) select(shot.id);
  }, [inTable, shot, select]);
  if (!workingSet) return null;
  if (!shot && tableShots.length > 0) {
    return (
      <EmptyState
        title={`All ${tableShots.length} shots here are excluded`}
        body="Include them again to open a shot."
        action={(
          <>
            <Button variant="primary" onClick={() => includeAllWithUndo(ws.includeAll, 'filter')}>Include all</Button>
            <Link className="fsa-btn fsa-touch link-button" to={paths.overview}>Back to overview</Link>
          </>
        )}
      />
    );
  }
  if (!shot) {
    return (
      <EmptyState
        title="No shots match these filters"
        body="Try a different club or source file."
        action={<Button variant="primary" onClick={() => ws.setClub(null)}>Show all clubs</Button>}
      />
    );
  }
  const scene = scenes.get(shot.id)!;
  // Same as the Overview card: excluding moves on to the next included shot; including stays on this one.
  const exclude = () => {
    ws.excludeAndAdvance(shot.id);
    setAnnouncement(`${shotLabel(shot)} excluded · ${visibleShots.length - 1} shots used`);
  };
  const include = () => {
    ws.setExcluded(shot.id, false);
    setAnnouncement(`${shotLabel(shot)} included · ${visibleShots.length + 1} shots used`);
  };

  return (
    <div className="inspector">
      <p role="status" className="visually-hidden">{announcement}</p>
      <ShotHeader shot={shot} shots={visibleShots} ordered={tableShots} excludedIds={excludedIds} excluded={excluded} files={workingSet.files} details={details}
        onSelect={ws.select} onStep={ws.step} onHandedness={(h) => ws.setDetails({ handedness: h })}
        onExclude={exclude} />
      {excluded && (
        <div className="excluded-banner" role="status">
          <p>This shot is excluded. It isn't in your averages or comparisons.</p>
          <Button onClick={include}>Include it again</Button>
        </div>
      )}
      <HeadTiles shot={shot} />
      <BallDataPanel shot={shot} scene={scene} sameClub={sameClub} others={others} />
      <Tabs<InspectorTab> value={inspectorTab} onChange={ws.setInspectorTab}
        render={<section />} className="club-data" aria-labelledby="club-data-label">
        <div className="club-data__bar">
          <div className="section-label section-label--club" id="club-data-label"><span className="section-label__dot" />Club data</div>
          <TabList label="Club data view" tabs={TABS.map((t) => ({ id: t.id, label: phone ? t.short : t.label }))} />
        </div>
        <TabPanel value="impact"><ImpactTab shot={shot} visibleShots={visibleShots} handedness={handedness} /></TabPanel>
        <TabPanel value="3d"><Club3DTab shot={shot} scene={scene} others={sameClub} /></TabPanel>
        <TabPanel value="2d"><Club2DTab shot={shot} scene={scene} visibleShots={visibleShots} handedness={handedness} /></TabPanel>
      </Tabs>
      <ProvenanceLegend />
      <AllMeasurements shot={shot} />
    </div>
  );
}
