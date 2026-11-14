import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  test('brand reads MyGolfViz with the site icon as its logo; the page title matches; the old product name is gone', () => {
    renderAt('/');
    const brand = screen.getByRole('link', { name: 'MyGolfViz' });
    const logo = brand.querySelector('img');
    expect(logo, 'logo image').not.toBeNull();
    expect(logo!.getAttribute('src')).toMatch(/\/icon\.svg$/);
    expect(logo).toHaveAttribute('alt', '');
    expect(brand.querySelector('svg')).toBeNull();
    expect(document.body.textContent).not.toContain('FlightScope Analytics');
    const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
    expect(html).toContain('<title>MyGolfViz</title>');
  });

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

  test('Help shows the stateless copy and how to get the local version', () => {
    renderAt('/help');
    expect(screen.getByText(/Browser-only analysis\. Your CSV files are read and analyzed in this tab\. Nothing is uploaded, saved or sent anywhere\. Refreshing or closing the page ends the analysis\./)).toBeInTheDocument();
    expect(screen.getByText("This viewer is stateless: it keeps no copy of your files once the page is refreshed or closed. While the page is open, the data lives only in this tab's memory.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Get the local version' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Mac app' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How to build the Mac app' })).toHaveAttribute('href', `${REPO_URL}#mac-app`);
    expect(screen.getByRole('link', { name: 'How to run it in your browser' })).toHaveAttribute('href', `${REPO_URL}#local-app`);
  });
});
