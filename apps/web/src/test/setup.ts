import { beforeAll } from 'vitest';
import { preloadPages } from '../routes';

// The app preloads its split pages at startup; do the same so tests render them synchronously.
beforeAll(() => preloadPages());
