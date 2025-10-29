'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="navbar-light navbars navbar navbar-expand-lg">
      <div className="navbar-collapse" id="navbarNav" style={{display: 'block'}}>
        <ul className="navbar-nav">
          <li className={`nav-item ${pathname === '/stat' ? 'active' : ''}`}>
            <Link className="nav-link" href="/stat">STAT</Link>
          </li>
          <li className={`nav-item ${pathname === '/' || pathname === '/inv' ? 'active' : ''}`}>
            <Link className="nav-link" aria-current="page" href="/">INV</Link>
          </li>
          <li className={`nav-item ${pathname === '/data' ? 'active' : ''}`}>
            <Link className="nav-link" href="/data">DATA</Link>
          </li>
          <li className={`nav-item ${pathname === '/map' ? 'active' : ''}`}>
            <Link className="nav-link" href="/map">MAP</Link>
          </li>
          <li className={`nav-item ${pathname === '/radio' ? 'active' : ''}`}>
            <Link className="nav-link" href="/radio">RADIO</Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
