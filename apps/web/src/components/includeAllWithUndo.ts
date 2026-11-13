import { toast } from 'sonner';
import type { WorkingSetApi } from '../state/store';

/** Include every excluded shot in the scope and offer an Undo toast for it. */
export function includeAllWithUndo(includeAll: WorkingSetApi['includeAll'], scope: 'session' | 'filter'): void {
  const result = includeAll(scope);
  if (!result) return;
  const { count, undo } = result;
  toast(count === 1 ? '1 shot included' : `${count} shots included`, { duration: 6000, action: { label: 'Undo', onClick: undo } });
}
