'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Rol, Club } from '@/lib/types';
import {
  Home,
  Wallet,
  Receipt,
  ClipboardList,
  BarChart3,
  FileText,
  Layers,
  Upload,
  Users,
  Tag,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

interface Props {
  nombre: string;
  rol: Rol;
  club: Club | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
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

  const sectionsAdmin: NavSection[] = [
    {
      label: 'Operativo',
      items: [
        { href: '/', label: 'Inicio', icon: Home },
        { href: '/cobranza', label: 'Cobrar', icon: Wallet },
        { href: '/recibos', label: 'Recibos', icon: Receipt },
        { href: '/rendiciones', label: 'Rendiciones', icon: ClipboardList },
      ],
    },
    {
      label: 'Análisis',
      items: [
        { href: '/reportes', label: 'Reportes', icon: BarChart3 },
        { href: '/estado-cuenta', label: 'Estado de cuenta', icon: FileText },
      ],
    },
    {
      label: 'Procesos',
      items: [
        { href: '/procesos', label: 'Procesos masivos', icon: Layers },
        { href: '/importar', label: 'Importar', icon: Upload },
      ],
    },
    {
      label: 'Configuración',
      items: [
        { href: '/socios', label: 'Socios', icon: Users },
        { href: '/cuotas', label: 'Cuotas', icon: Tag },
        { href: '/talonarios', label: 'Talonarios', icon: BookOpen },
        { href: '/configuracion', label: 'Configuración', icon: Settings },
      ],
    },
  ];

  const sectionsCobrador: NavSection[] = [
    {
      label: 'Operativo',
      items: [
        { href: '/cobranza', label: 'Cobrar', icon: Wallet },
        { href: '/recibos', label: 'Mis recibos', icon: Receipt },
        { href: '/rendiciones', label: 'Mis rendiciones', icon: ClipboardList },
      ],
    },
    {
      label: 'Análisis',
      items: [
        { href: '/reportes', label: 'Mis reportes', icon: BarChart3 },
        { href: '/estado-cuenta', label: 'Estado de cuenta', icon: FileText },
      ],
    },
  ];

  const sectionsConsulta: NavSection[] = [
    {
      label: 'Operativo',
      items: [
        { href: '/', label: 'Inicio', icon: Home },
        { href: '/recibos', label: 'Recibos', icon: Receipt },
      ],
    },
  ];

  const sections = rol === 'admin' ? sectionsAdmin : rol === 'cobrador' ? sectionsCobrador : sectionsConsulta;
  const rolLabel = rol === 'admin' ? 'Administrador' : rol === 'cobrador' ? 'Cobrador' : 'Consulta';

  function close() { setOpen(false); }

  const clubNombre = club?.nombre || 'Cobranza Club';

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          {club?.logo_url && <img src={club.logo_url} alt="Logo del club" />}
          <span className="brand-name">{clubNombre}</span>
        </div>
        <nav className="sidebar-nav">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={pathname === item.href ? 'active' : ''}
                    onClick={close}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-user">
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{nombre}</div>
          <div>{rolLabel}</div>
          <button onClick={logout} style={{ marginTop: 'var(--space-2)', width: '100%' }}>
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
