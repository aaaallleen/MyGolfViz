import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fsa/ui/src/fonts';
import '@fsa/ui';
import './styles/app.css';
import { App } from './App';
import { readAppMode } from './mode';

readAppMode(import.meta.env.VITE_APP_MODE);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
