import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Usuario } from '@/lib/types';

export async function getUsuarioActual(): Promise<Usuario> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (!usuario) redirect('/login');
  return usuario as Usuario;
}
