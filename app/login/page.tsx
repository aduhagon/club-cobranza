'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { darkenHex, hexToBg } from '@/lib/utils';
import type { Club } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [club, setClub] = useState<Club | null>(null);

  useEffect(() => {
    async function loadClub() {
      const { data } = await supabase.from('clubes').select('*').limit(1).maybeSingle();
      if (data) {
        setClub(data as Club);
        if ((data as Club).color_primario) {
          const root = document.documentElement;
          root.style.setProperty('--primary', (data as Club).color_primario!);
          root.style.setProperty('--primary-dark', darkenHex((data as Club).color_primario!, 18));
          root.style.setProperty('--primary-bg', hexToBg((data as Club).color_primario!, 0.10));
        }
      }
    }
    loadClub();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error('Email o contraseña incorrectos');
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleSubmit}>
        {club?.logo_url && (
          <div className="login-logo">
            <img src={club.logo_url} alt="Logo" />
          </div>
        )}
        <h1>{club?.nombre || 'Cobranza Club'}</h1>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
