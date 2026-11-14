import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpPage } from './HelpPage';

describe('HelpPage heading', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is just "Help" in local mode', () => {
    vi.stubEnv('VITE_APP_MODE', 'local');
    render(<HelpPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Help$/);
    expect(screen.queryByRole('heading', { name: 'Get the local version' })).toBeNull();
  });

  it('keeps "Help / Get Local Version" in public mode', () => {
    vi.stubEnv('VITE_APP_MODE', 'public');
    render(<HelpPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Help / Get Local Version');
  });
});
