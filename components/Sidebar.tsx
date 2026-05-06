'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Rol } from '@/lib/types';

interface Props {
  nombre: string;
  rol: Rol;
}

export default function Sidebar({ nombre, rol }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

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
    { href: '/socios', label: 'Socios' },
    { href: '/cuotas', label: 'Cuotas' },
    { href: '/talonarios', label: 'Talonarios' },
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

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Cobranza Club</div>
      <nav className="sidebar-nav">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''}>
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
  );
}
