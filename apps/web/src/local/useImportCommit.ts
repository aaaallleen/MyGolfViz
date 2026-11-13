import { useCallback, useState } from 'react';
import type { PreviewFile } from '../state/staging';
import { useWorkingSet } from '../state/store';
import * as api from './api';
import type { ImportResponse } from './api';
import { toFileManifest, type ImportTarget } from './importPayload';

/** Sends the included files. Never retries: a repeated new-session request would create a second session. */
export function useImportCommit() {
  const { filesByKey } = useWorkingSet();
  const [busy, setBusy] = useState(false);
  const commit = useCallback(
    async (dest: ImportTarget, staged: readonly PreviewFile[], accept: Record<string, boolean>): Promise<ImportResponse> => {
      const chosen = staged.filter((f) => f.include && f.parse.ok);
      const files = chosen.map((f, i) => {
        const file = filesByKey.get(f.key);
        if (!file) throw new Error(`The original file for ${f.name} is no longer available. Add it again.`);
        return { field: `file${i}`, file, name: f.name };
      });
      const manifest = {
        destination: dest,
        files: chosen.map((f, i) => toFileManifest(`file${i}`, f.parse, accept[f.sha256] === true)),
      };
      setBusy(true);
      try {
        return await api.commitImport(manifest, files);
      } finally {
        setBusy(false);
      }
    },
    [filesByKey],
  );
  return { commit, busy };
}
