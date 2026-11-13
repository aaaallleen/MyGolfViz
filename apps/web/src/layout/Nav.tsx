import { clsx } from 'clsx';
import { NavLink } from 'react-router';
import { LOCAL_NAV, PUBLIC_NAV } from '../mode';

export function Nav() {
  return (
    <nav className="app-nav" aria-label="Primary">
      {(import.meta.env.VITE_APP_MODE === 'local' ? LOCAL_NAV : PUBLIC_NAV).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className={({ isActive }) =>
            clsx('app-nav__link', 'fsa-touch', (item.to === '/' || item.to === '/import') && 'app-nav__link--primary fsa-btn fsa-btn--primary', isActive && 'is-active')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
