import { toast } from 'sonner';
import type { WorkingSetApi } from '../state/store';

const plural = (n: number, verb: string) => (n === 1 ? `1 shot ${verb}` : `${n} shots ${verb}`);

/** Include every excluded shot in the scope and offer an Undo toast for it. */
export function includeAllWithUndo(includeAll: WorkingSetApi['includeAll'], scope: 'session' | 'filter'): void {
  const result = includeAll(scope);
  if (!result) return;
  toast(plural(result.count, 'included'), { duration: 6000, action: { label: 'Undo', onClick: result.undo } });
}

/** Exclude every included shot in the filter and offer an Undo toast for it. */
export function excludeAllWithUndo(excludeAll: WorkingSetApi['excludeAll']): void {
  const result = excludeAll();
  if (!result) return;
  toast(plural(result.count, 'excluded'), { duration: 6000, action: { label: 'Undo', onClick: result.undo } });
}
