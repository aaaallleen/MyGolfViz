export const IMPACT_CONVENTION = { lateralPositive: 'toe', verticalPositive: 'high', verified: true } as const;
export const NOT_MEASURED = 'Not measured';

export type Handedness = 'right' | 'left';
export interface SessionDetails {
  name: string;
  /** 'YYYY-MM-DD', user-entered */
  date: string | null;
  notes: string;
  handedness: Handedness;
}
export const DEFAULT_SESSION_DETAILS: SessionDetails = { name: '', date: null, notes: '', handedness: 'right' };

export function sessionTitle(d: SessionDetails): string {
  return d.name.trim() || 'Untitled session';
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function formatSessionDate(date: string | null): string {
  if (date === null) return 'No date set';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return 'No date set';
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${DATE_FORMAT.format(new Date(ms))} (set by you)`;
}

export function handednessLabel(h: Handedness): string {
  return h === 'left' ? 'Left-handed' : 'Right-handed';
}
