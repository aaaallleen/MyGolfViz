export type AppMode = 'public' | 'local';

export function readAppMode(value: string | undefined): AppMode {
  if (value === 'public' || value === 'local') return value;
  throw new Error(`Unsupported VITE_APP_MODE: ${value}. This build supports: public, local`);
}

export const PUBLIC_NAV: readonly { to: string; label: string }[] = [
  { to: '/', label: 'Load Session CSV' },
  { to: '/overview', label: 'Overview' },
  { to: '/inspect', label: 'Shot Inspector' },
  { to: '/help', label: 'Help / Get Local Version' },
];

/** `icon: 'add'` shows the item as a small + button; its label stays its accessible name and tooltip. */
export const LOCAL_NAV: readonly { to: string; label: string; icon?: 'add' }[] = [
  { to: '/sessions', label: 'Sessions' },
  { to: '/progression', label: 'Progression' },
  { to: '/compare', label: 'Compare' },
  { to: '/import', label: 'Load Session CSV', icon: 'add' },
  { to: '/help', label: 'Help' },
];

export const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? 'https://github.com/';
