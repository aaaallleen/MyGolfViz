import { HashRouter } from 'react-router';
import { AppRoutes } from './routes';
import { WorkingSetProvider } from './state/store';

export function App() {
  return (
    <HashRouter>
      <WorkingSetProvider>
        <AppRoutes />
      </WorkingSetProvider>
    </HashRouter>
  );
}
