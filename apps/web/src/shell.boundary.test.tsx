import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { OverviewPage } from './pages/OverviewPage';
import { renderWithData } from './test/renderWithData';

function Boom(): never {
  throw new Error('render failure');
}

describe('view error boundary', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => spy.mockRestore());

  test('a throwing view shows the fallback, keeps the nav and the loaded analysis, and resets on navigation', async () => {
    const user = userEvent.setup();
    const view = renderWithData(['FlightScope Golf Session.csv'], {
      route: '/boom',
      shellRoutes: (
        <Routes>
          <Route path="/boom" element={<Boom />} />
          <Route path="/overview" element={<OverviewPage />} />
        </Routes>
      ),
    });
    expect(screen.getByText("This view couldn't be drawn")).toBeInTheDocument();
    expect(screen.getByText('Your analysis is still loaded in this tab. Choose another page or shot.')).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation')[0]!;
    expect(within(nav).getAllByRole('link').map((a) => a.textContent?.trim())).toEqual(
      ['Load Session CSV', 'Overview', 'Shot Inspector', 'Help / Get Local Version']);
    expect(view.store().workingSet).not.toBeNull();
    await user.click(within(nav).getByRole('link', { name: 'Overview' }));
    expect(screen.queryByText("This view couldn't be drawn")).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(view.store().workingSet).not.toBeNull();
  });
});
