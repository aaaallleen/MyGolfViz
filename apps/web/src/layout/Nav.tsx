import { clsx } from 'clsx';
import { NavLink } from 'react-router';
import { PUBLIC_NAV } from '../mode';

export function Nav() {
  return (
    <nav className="app-nav" aria-label="Primary">
      {PUBLIC_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className={({ isActive }) =>
            clsx('app-nav__link', 'fsa-touch', item.to === '/' && 'app-nav__link--primary fsa-btn fsa-btn--primary', isActive && 'is-active')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
