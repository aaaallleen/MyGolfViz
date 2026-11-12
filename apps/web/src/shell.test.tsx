import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test } from 'vitest';
import { PUBLIC_NAV, REPO_URL } from './mode';
import { AppRoutes } from './routes';
import { WorkingSetProvider } from './state/store';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkingSetProvider>
        <AppRoutes />
      </WorkingSetProvider>
    </MemoryRouter>,
  );
}

describe('app shell', () => {
  test('nav renders exactly the four PUBLIC_NAV labels in order; no save/library/history/calendar text', () => {
    renderAt('/');
    const nav = screen.getAllByRole('navigation')[0]!;
    const labels = within(nav).getAllByRole('link').map((a) => a.textContent?.trim());
    expect(labels).toEqual(['Load Session CSV', 'Overview', 'Shot Inspector', 'Help / Get Local Version']);
    expect(labels).toEqual(PUBLIC_NAV.map((n) => n.label));
    expect(nav.textContent).not.toMatch(/save|session library|history|calendar/i);
  });

  test("unknown route redirects to Load page; '/overview' with no data shows empty state", () => {
    const { unmount } = renderAt('/nope/x');
    expect(screen.getByRole('heading', { name: 'Load Session CSV' })).toBeInTheDocument();
    unmount();
    renderAt('/overview');
    expect(screen.getByText('No analysis yet')).toBeInTheDocument();
    expect(screen.getByText('Load one or more FlightScope CSV exports to see this view.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Session CSV' })).toBeInTheDocument();
  });

  test('Help shows the stateless copy and the local-app link', () => {
    renderAt('/help');
    expect(screen.getByText(/Browser-only analysis\. Your CSV files are read and analyzed in this tab\. Nothing is uploaded, saved or sent anywhere\. Refreshing or closing the page ends the analysis\./)).toBeInTheDocument();
    expect(screen.getByText("This viewer is stateless: it keeps no copy of your files once the page is refreshed or closed. While the page is open, the data lives only in this tab's memory.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Want saved history? Run Local App' })).toHaveAttribute('href', `${REPO_URL}#local-app`);
  });
});
