import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fsa/ui/src/fonts';
import '@fsa/ui/src/tokens.css';
import './styles/app.css';
import { App } from './App';
import { readAppMode } from './mode';
import { preloadPages } from './routes';

readAppMode(import.meta.env.VITE_APP_MODE);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Fetch the other pages' code right after the first paint, while the connection is known to be up,
// so the app keeps working offline. A failure is not fatal: opening the page retries.
const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1));
idle(() => {
  preloadPages().catch(() => {});
});
