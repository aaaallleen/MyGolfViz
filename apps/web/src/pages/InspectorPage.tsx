import { useEffect, useMemo } from 'react';
import { buildReplayScene } from '@fsa/analytics';
import { Button, EmptyState, ProvenanceLegend, TabList, TabPanel, Tabs } from '@fsa/ui';
import { AllMeasurements } from '../components/AllMeasurements';
import { BallDataPanel } from '../components/BallDataPanel';
import { Club2DTab } from '../components/Club2DTab';
import { Club3DTab } from '../components/Club3DTab';
import { HeadTiles } from '../components/HeadTiles';
import { ImpactTab } from '../components/ImpactTab';
import { ShotHeader } from '../components/ShotHeader';
import { usePhone } from '../components/usePhone';
import { useWorkingSet, type InspectorTab } from '../state/store';

const TABS: { id: InspectorTab; label: string; short: string }[] = [
  { id: 'impact', label: 'Face impact', short: 'Impact' },
  { id: '3d', label: '3D reconstruction', short: '3D' },
  { id: '2d', label: '2D reconstruction', short: '2D' },
];

export function InspectorPage() {
  const ws = useWorkingSet();
  const phone = usePhone();
  const { workingSet, details, visibleShots, selectedId, inspectorTab } = ws;
  const handedness = details.handedness;

  // Rebuilt only when the visible shots (by identity of ids) or handedness change, not on unrelated UI state.
  const idKey = visibleShots.map((s) => s.id).join('|');
  const scenes = useMemo(
    () => new Map(visibleShots.map((s) => [s.id, buildReplayScene(s, handedness)] as const)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workingSet, idKey, handedness],
  );
  // The inspector always shows a shot: with none selected it opens the first visible one and selects it.
  const selected = visibleShots.find((s) => s.id === selectedId);
  const shot = selected ?? visibleShots[0];
  const others = useMemo(
    () => visibleShots.filter((s) => s.id !== shot?.id).map((s) => scenes.get(s.id)!),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenes, shot?.id],
  );
  // The 3D club views' "All shots" overlay compares against the same club only.
  const sameClub = useMemo(
    () => visibleShots.filter((s) => s.id !== shot?.id && s.club === shot?.club).map((s) => scenes.get(s.id)!),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenes, shot?.id, shot?.club],
  );

  const { select } = ws;
  useEffect(() => {
    if (!selected && shot) select(shot.id);
  }, [selected, shot, select]);
  if (!workingSet) return null;
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

  return (
    <div className="inspector">
      <ShotHeader shot={shot} shots={visibleShots} files={workingSet.files} details={details}
        onSelect={ws.select} onStep={ws.step} onHandedness={(h) => ws.setDetails({ handedness: h })} />
      <HeadTiles shot={shot} />
      <BallDataPanel shot={shot} scene={scene} others={others} />
      <Tabs<InspectorTab> value={inspectorTab} onChange={ws.setInspectorTab}
        render={<section />} className="club-data" aria-labelledby="club-data-label">
        <div className="club-data__bar">
          <div className="section-label section-label--club" id="club-data-label"><span className="section-label__dot" />Club data</div>
          <TabList label="Club data view" tabs={TABS.map((t) => ({ id: t.id, label: phone ? t.short : t.label }))} />
        </div>
        <TabPanel value="impact"><ImpactTab shot={shot} visibleShots={visibleShots} handedness={handedness} /></TabPanel>
        <TabPanel value="3d"><Club3DTab shot={shot} scene={scene} others={sameClub} /></TabPanel>
        <TabPanel value="2d"><Club2DTab shot={shot} visibleShots={visibleShots} /></TabPanel>
      </Tabs>
      <ProvenanceLegend />
      <AllMeasurements shot={shot} />
    </div>
  );
}
