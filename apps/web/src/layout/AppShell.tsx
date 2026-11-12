import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { ViewErrorBoundary } from '../components/ViewErrorBoundary';
import { Nav } from './Nav';

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
      <main className="app-main"><ViewErrorBoundary key={pathname}>{children}</ViewErrorBoundary></main>
    </div>
  );
}
