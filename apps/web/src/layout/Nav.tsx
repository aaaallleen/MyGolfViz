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
            ['app-nav__link', 'fsa-touch', item.to === '/' ? 'app-nav__link--primary fsa-btn fsa-btn--primary' : '', isActive ? 'is-active' : ''].filter(Boolean).join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
