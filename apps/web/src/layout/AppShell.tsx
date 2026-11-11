import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Nav } from './Nav';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-brand fsa-touch">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22">
            <circle cx="11" cy="11" r="9" fill="none" stroke="#F5A742" strokeWidth="2" />
            <path d="M3 13 Q11 2 19 9" fill="none" stroke="#62B6F7" strokeWidth="2" />
          </svg>
          FlightScope Analytics
        </Link>
        <Nav />
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
