import { getUsuarioActual } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import AppShell from '@/components/AppShell';
import ClubThemeProvider from '@/components/ClubThemeProvider';
import type { Club } from '@/lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();
  const supabase = createClient();
  const { data: clubData } = await supabase.from('clubes').select('*').limit(1).maybeSingle();
  const club = clubData as Club | null;

  return (
    <ClubThemeProvider color={club?.color_primario || null}>
      <div className="layout">
        <AppShell nombre={usuario.nombre} rol={usuario.rol} club={club} />
        <main className="main">{children}</main>
      </div>
    </ClubThemeProvider>
  );
}
