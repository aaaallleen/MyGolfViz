import { clsx } from 'clsx';
import { NavLink } from 'react-router';
import { LOCAL_NAV, PUBLIC_NAV } from '../mode';

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none" />
  </svg>
);

export function Nav() {
  const items: readonly { to: string; label: string; icon?: 'add' }[] =
    import.meta.env.VITE_APP_MODE === 'local' ? LOCAL_NAV : PUBLIC_NAV;
  return (
    <nav className="app-nav" aria-label="Primary">
      {items.map((item) =>
        item.icon === 'add' ? (
          <NavLink
            key={item.to}
            to={item.to}
            end
            aria-label={item.label}
            title={item.label}
            className={({ isActive }) => clsx('app-nav__link', 'app-nav__add', isActive && 'is-active')}
          >
            <PlusIcon />
          </NavLink>
        ) : (
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
        ),
      )}
    </nav>
  );
}
