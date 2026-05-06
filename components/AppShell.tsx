'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Rol, Club } from '@/lib/types';

interface Props {
  nombre: string;
  rol: Rol;
  club: Club | null;
}

export default function AppShell({ nombre, rol, club }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function logout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const navAdmin = [
    { href: '/', label: 'Inicio' },
    { href: '/cobranza', label: 'Cobrar' },
    { href: '/recibos', label: 'Recibos' },
    { href: '/rendiciones', label: 'Rendiciones' },
    { href: '/procesos', label: 'Procesos masivos' },
    { href: '/socios', label: 'Socios' },
    { href: '/cuotas', label: 'Cuotas' },
    { href: '/talonarios', label: 'Talonarios' },
    { href: '/configuracion', label: 'Configuración' },
  ];
  const navCobrador = [
    { href: '/cobranza', label: 'Cobrar' },
    { href: '/recibos', label: 'Mis recibos' },
    { href: '/rendiciones', label: 'Mis rendiciones' },
  ];
  const navConsulta = [
    { href: '/', label: 'Inicio' },
    { href: '/recibos', label: 'Recibos' },
  ];

  const nav = rol === 'admin' ? navAdmin : rol === 'cobrador' ? navCobrador : navConsulta;
  const rolLabel = rol === 'admin' ? 'Administrador' : rol === 'cobrador' ? 'Cobrador' : 'Consulta';

  function close() { setOpen(false); }

  const clubNombre = club?.nombre || 'Cobranza Club';

  return (
    <>
      <div className="topbar-mobile">
        <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Menú">☰</button>
        {club?.logo_url && <img src={club.logo_url} alt="Logo" />}
        <span className="brand">{clubNombre}</span>
      </div>

      <div className={`mobile-overlay ${open ? 'show' : ''}`} onClick={close} />

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          {club?.logo_url && <img src={club.logo_url} alt="Logo del club" />}
          <span className="brand-name">{clubNombre}</span>
        </div>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''} onClick={close}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-user">
          <div style={{ fontWeight: 500, color: 'var(--text)' }}>{nombre}</div>
          <div>{rolLabel}</div>
          <button onClick={logout} style={{ marginTop: 8, width: '100%', padding: '6px 10px' }}>
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
