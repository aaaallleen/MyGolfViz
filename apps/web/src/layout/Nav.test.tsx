import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Nav } from './Nav';

const renderNav = (path = '/sessions') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Nav />
    </MemoryRouter>,
  );

afterEach(() => vi.unstubAllEnvs());

describe('Nav (local build)', () => {
  test('Load Session CSV is a small + button that keeps its name for screen readers and as a tooltip', () => {
    vi.stubEnv('VITE_APP_MODE', 'local');
    renderNav();
    const add = screen.getByRole('link', { name: 'Load Session CSV' });
    expect(add).toHaveAttribute('href', '/import');
    expect(add).toHaveAttribute('title', 'Load Session CSV');
    expect(add.textContent).toBe('');
    expect(add.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(add).toHaveClass('app-nav__add');
    expect(add).not.toHaveClass('fsa-btn--primary');
  });

  test('keeps the order Sessions, +, Help', () => {
    vi.stubEnv('VITE_APP_MODE', 'local');
    renderNav();
    const names = within(screen.getByRole('navigation')).getAllByRole('link').map((a) => a.getAttribute('aria-label') ?? a.textContent);
    expect(names).toEqual(['Sessions', 'Load Session CSV', 'Help']);
  });

  test('is marked current on the import page', () => {
    vi.stubEnv('VITE_APP_MODE', 'local');
    renderNav('/import');
    expect(screen.getByRole('link', { name: 'Load Session CSV' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Nav (public build)', () => {
  test('Load Session CSV stays the labelled primary button', () => {
    vi.stubEnv('VITE_APP_MODE', 'public');
    renderNav('/');
    const load = screen.getByRole('link', { name: 'Load Session CSV' });
    expect(load.textContent).toBe('Load Session CSV');
    expect(load).toHaveClass('fsa-btn--primary');
    expect(load.querySelector('svg')).toBeNull();
  });
});
