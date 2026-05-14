'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Socio, TipoCuota } from '@/lib/types';

type Estado = 'buen_pagador' | 'con_deuda' | 'baja';

interface DatosSocio {
  socio: Socio;
  tipoCuota: string;
  estado: Estado;
  mesesDeuda: number;
}

export default function VerificarSocioPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [datos, setDatos] = useState<DatosSocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hora, setHora] = useState(new Date());

  // Reloj en tiempo real
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    async function verificar() {
      // Verificar que el usuario logueado sea portero o admin
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Necesitás iniciar sesión como portero para usar esta función.');
        setLoading(false);
        return;
      }

      const { data: usuarioActual } = await supabase
        .from('usuarios')
        .select('rol')
        .eq('auth_id', user.id)
        .single();

      if (!usuarioActual || !['portero', 'admin'].includes(usuarioActual.rol)) {
        setError('No tenés permiso para acceder a esta página.');
        setLoading(false);
        return;
      }

      // Cargar datos del socio
      const { data: socio, error: errSocio } = await supabase
        .from('socios')
        .select('*')
        .eq('id', id)
        .single();

      if (errSocio || !socio) {
        setError('Socio no encontrado.');
        setLoading(false);
        return;
      }

      // Tipo de cuota
      let tipoCuota = 'Sin asignar';
      if (socio.tipo_cuota_id) {
        const { data: tipo } = await supabase
          .from('tipos_cuota')
          .select('nombre')
          .eq('id', socio.tipo_cuota_id)
          .single();
        if (tipo) tipoCuota = tipo.nombre;
      }

      // Si está de baja
      if (socio.fecha_baja) {
        setDatos({ socio, tipoCuota, estado: 'baja', mesesDeuda: 0 });
        setLoading(false);
        return;
      }

      // Calcular deuda: devengamientos no pagados con más de 1 mes de antigüedad
      const haceUnMes = new Date();
      haceUnMes.setMonth(haceUnMes.getMonth() - 1);
      const periodoLimite = `${haceUnMes.getFullYear()}-${String(haceUnMes.getMonth() + 1).padStart(2, '0')}`;

      const { data: deudas } = await supabase
        .from('devengamientos')
        .select('periodo')
        .eq('socio_id', id)
        .neq('estado', 'pagado')
        .lt('periodo', periodoLimite);

      const mesesDeuda = deudas?.length || 0;
      const estado: Estado = mesesDeuda > 0 ? 'con_deuda' : 'buen_pagador';

      setDatos({ socio, tipoCuota, estado, mesesDeuda });
      setLoading(false);
    }

    verificar();
  }, [id]);

  const fmtHora = (d: Date) =>
    d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmtFecha = (d: Date) =>
    d.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <div style={styles.fullPage}>
        <div style={styles.spinner}>Verificando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.fullPage}>
        <div style={{ ...styles.card, borderTop: '6px solid #ef4444' }}>
          <div style={styles.iconGrande}>⚠️</div>
          <p style={{ color: '#ef4444', fontWeight: 600, fontSize: 18, textAlign: 'center' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!datos) return null;

  const { socio, tipoCuota, estado, mesesDeuda } = datos;

  const config = {
    buen_pagador: {
      color: '#16a34a',
      fondo: '#f0fdf4',
      borde: '#16a34a',
      icon: '✅',
      titulo: 'BUEN PAGADOR',
      subtitulo: 'Al día con sus cuotas',
    },
    con_deuda: {
      color: '#d97706',
      fondo: '#fffbeb',
      borde: '#d97706',
      icon: '⚠️',
      titulo: 'CON DEUDA',
      subtitulo: `${mesesDeuda} ${mesesDeuda === 1 ? 'cuota pendiente' : 'cuotas pendientes'}`,
    },
    baja: {
      color: '#dc2626',
      fondo: '#fef2f2',
      borde: '#dc2626',
      icon: '❌',
      titulo: 'SOCIO DE BAJA',
      subtitulo: `Baja: ${socio.fecha_baja}`,
    },
  }[estado];

  return (
    <div style={{ ...styles.fullPage, background: config.fondo }}>
      {/* Reloj */}
      <div style={styles.reloj}>
        <div style={styles.hora}>{fmtHora(hora)}</div>
        <div style={styles.fecha}>{fmtFecha(hora)}</div>
      </div>

      {/* Card principal */}
      <div style={{ ...styles.card, borderTop: `8px solid ${config.borde}` }}>
        <div style={styles.iconGrande}>{config.icon}</div>

        <div style={{ ...styles.estadoBadge, background: config.color }}>
          {config.titulo}
        </div>
        <div style={{ ...styles.estadoSub, color: config.color }}>
          {config.subtitulo}
        </div>

        <div style={styles.divider} />

        <div style={styles.nombreSocio}>
          {socio.nombre}
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>N° Socio</span>
          <span style={styles.infoVal}>#{socio.numero}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Categoría</span>
          <span style={styles.infoVal}>{tipoCuota}</span>
        </div>
        {socio.dni && (
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>DNI</span>
            <span style={styles.infoVal}>{socio.dni}</span>
          </div>
        )}
      </div>

      <div style={styles.footer}>
        Sistema de gestión del club
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  fullPage: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
    fontFamily: 'system-ui, sans-serif',
  },
  reloj: {
    textAlign: 'center',
  },
  hora: {
    fontSize: 42,
    fontWeight: 700,
    color: '#1e293b',
    letterSpacing: 2,
    fontVariantNumeric: 'tabular-nums',
  },
  fecha: {
    fontSize: 14,
    color: '#64748b',
    textTransform: 'capitalize',
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '32px 28px',
    width: '100%',
    maxWidth: 380,
    boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  iconGrande: {
    fontSize: 64,
    lineHeight: 1,
  },
  estadoBadge: {
    color: 'white',
    fontWeight: 800,
    fontSize: 22,
    letterSpacing: 1,
    padding: '6px 24px',
    borderRadius: 999,
    marginTop: 4,
  },
  estadoSub: {
    fontWeight: 600,
    fontSize: 15,
  },
  divider: {
    width: '100%',
    height: 1,
    background: '#e2e8f0',
    margin: '8px 0',
  },
  nombreSocio: {
    fontSize: 24,
    fontWeight: 700,
    color: '#0f172a',
    textAlign: 'center',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    padding: '4px 0',
    borderBottom: '1px solid #f1f5f9',
  },
  infoLabel: {
    color: '#94a3b8',
    fontSize: 14,
  },
  infoVal: {
    fontWeight: 600,
    color: '#334155',
    fontSize: 14,
  },
  spinner: {
    color: '#64748b',
    fontSize: 18,
  },
  footer: {
    fontSize: 12,
    color: '#94a3b8',
  },
};
