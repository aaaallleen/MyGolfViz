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

export const LOCAL_NAV: readonly { to: string; label: string }[] = [
  { to: '/sessions', label: 'Sessions' },
  { to: '/import', label: 'Load Session CSV' },
  { to: '/help', label: 'Help' },
];

export const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? 'https://github.com/';
