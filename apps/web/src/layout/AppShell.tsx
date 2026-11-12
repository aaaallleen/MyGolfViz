import { Suspense, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { ViewErrorBoundary } from '../components/ViewErrorBoundary';
import { Nav } from './Nav';

// Sonner reads its toast colours from these variables; point them at the app's tokens.
const TOASTER_STYLE = {
  '--normal-bg': 'var(--surface-raised)',
  '--normal-bg-hover': 'var(--row-selected)',
  '--normal-border': 'var(--border-strong)',
  '--normal-border-hover': 'var(--border-strong)',
  '--normal-text': 'var(--text)',
  fontFamily: 'var(--font-body)',
} as CSSProperties;
// On phones the primary nav is fixed to the bottom; app.css raises this so toasts sit above it.
const BOTTOM = { bottom: 'var(--toast-offset-bottom)' };

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-brand fsa-touch">
          <img className="app-brand__logo" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={32} height={32} />
          MyGolfViz
        </Link>
        <Nav />
      </header>
      <main className="app-main">
        <ViewErrorBoundary key={pathname}>
          {/* Shown only if a page's code hasn't arrived yet; it fades in late so a quick load never flashes it. */}
          <Suspense fallback={<p className="page-loading" role="status">Loading page…</p>}>{children}</Suspense>
        </ViewErrorBoundary>
      </main>
      <Toaster theme="dark" style={TOASTER_STYLE} offset={BOTTOM} mobileOffset={BOTTOM} />
    </div>
  );
}
