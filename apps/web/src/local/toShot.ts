import type { Measurements, QualityFlag, Shot } from '@fsa/domain';
import type { ShotOut } from './api';

/** One API shot row as the in-memory `Shot` the store and charts use. */
export function toShot(s: ShotOut): Shot {
  return {
    id: s.id,
    fileId: s.importId,
    sourceRow: s.sourceRow,
    shotLabel: s.shotLabel,
    club: s.club ?? 'Unknown club',
    shotType: s.shotType,
    mode: s.mode,
    location: s.location,
    // The API types these loosely; the server stores what the parser produced, so cast at this one boundary.
    m: s.m as unknown as Measurements,
    raw: s.raw as Record<string, string>,
    flags: s.flags as QualityFlag[],
  };
}
