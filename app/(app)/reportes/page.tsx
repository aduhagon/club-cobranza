'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { fmtMoney, fmtMesLargo, thisMonth } from '@/lib/utils';
import { exportarExcel, exportarPDF } from '@/lib/reportes';
import type { Usuario, Club } from '@/lib/types';
import ReporteCobranzas from './_cobranzas';
import ReporteDevengamientos from './_devengamientos';
import ReporteMorosidad from './_morosidad';

type Tab = 'cobranzas' | 'devengamientos' | 'morosidad';

export default function ReportesPage() {
  const supabase = createClient();
  const [yo, setYo] = useState<Usuario | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [tab, setTab] = useState<Tab>('cobranzas');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [yoData, clubData] = await Promise.all([
        supabase.from('usuarios').select('*').eq('auth_id', user.id).single(),
        supabase.from('clubes').select('*').limit(1).maybeSingle(),
      ]);
      setYo(yoData.data as Usuario);
      setClub(clubData.data as Club | null);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="empty">Cargando...</div>;
  if (!yo) return null;

  return (
    <div>
      <div className="main-header">
        <h1>Reportes</h1>
      </div>

      <div className="tabs">
        <button className={tab === 'cobranzas' ? 'tab-active' : ''} onClick={() => setTab('cobranzas')}>
          Cobranzas
        </button>
        <button className={tab === 'devengamientos' ? 'tab-active' : ''} onClick={() => setTab('devengamientos')}>
          Devengamientos
        </button>
        <button className={tab === 'morosidad' ? 'tab-active' : ''} onClick={() => setTab('morosidad')}>
          Morosidad
        </button>
      </div>

      {tab === 'cobranzas' && <ReporteCobranzas yo={yo} club={club} />}
      {tab === 'devengamientos' && <ReporteDevengamientos yo={yo} club={club} />}
      {tab === 'morosidad' && <ReporteMorosidad yo={yo} club={club} />}
    </div>
  );
}
