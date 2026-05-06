import { getUsuarioActual } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();

  return (
    <div className="layout">
      <Sidebar nombre={usuario.nombre} rol={usuario.rol} />
      <main className="main">{children}</main>
    </div>
  );
}
