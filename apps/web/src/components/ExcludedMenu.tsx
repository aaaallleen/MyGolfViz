import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { displayOrder } from '@fsa/analytics';
import { formatMeasurement, MISSING_MARK } from '@fsa/domain';
import { useWorkingSet } from '../state/store';
import { FileBadge } from './FileBadge';
import { includeAllWithUndo } from './includeAllWithUndo';
import { shotLabel } from './shotLabel';

/** Lists every excluded shot in the session: pick one to find it, or include it again. */
export function ExcludedMenu() {
  const ws = useWorkingSet();
  const [open, setOpen] = useState(false);
  if (!ws.workingSet) return null;
  const { files, shots } = ws.workingSet;
  const excluded = displayOrder(shots.filter((s) => ws.excludedIds.has(s.id)));
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="fsa-chip fsa-touch">{`${excluded.length} excluded`}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="column-menu__positioner">
          <Popover.Popup className="column-menu excluded-menu" aria-label="Excluded shots">
            <ul className="excluded-menu__list">
              {excluded.map((s) => (
                <li key={s.id} className="excluded-menu__row">
                  <button
                    type="button"
                    className="excluded-menu__pick fsa-touch"
                    onClick={() => { ws.reveal(s.id); setOpen(false); }}
                  >
                    {s.club} · <FileBadge shot={s} files={files} /> {shotLabel(s)} · {s.m.carry === null ? MISSING_MARK : formatMeasurement('carry', s.m.carry)}
                  </button>
                  <button
                    type="button"
                    className="fsa-btn fsa-btn--secondary fsa-touch"
                    aria-label={`Include shot ${shotLabel(s)}, ${s.club}`}
                    onClick={() => ws.setExcluded(s.id, false)}
                  >
                    Include
                  </button>
                </li>
              ))}
            </ul>
            <div className="column-menu__actions">
              <button type="button" className="fsa-btn fsa-btn--secondary fsa-touch" onClick={() => includeAllWithUndo(ws.includeAll, 'session')}>Include all</button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
