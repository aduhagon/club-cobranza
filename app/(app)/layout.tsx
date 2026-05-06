import { getUsuarioActual } from '@/lib/auth';
import AppShell from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();

  return (
    <div className="layout">
      <AppShell nombre={usuario.nombre} rol={usuario.rol} />
      <main className="main">{children}</main>
    </div>
  );
}
