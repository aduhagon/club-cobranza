import { createClient } from '@/lib/supabase/server';
import { fmtMoney, fmtDate, formatNumeroRecibo, thisMonth } from '@/lib/utils';

export default async function DashboardPage() {
  const supabase = createClient();
  const mes = thisMonth();

  const [{ count: sociosActivos }, { data: pagosMes }, { data: socios }, { data: sucursales }, { data: recientes }, { count: deudas }] =
    await Promise.all([
      supabase.from('socios').select('*', { count: 'exact', head: true }).is('fecha_baja', null),
      supabase.from('pagos').select('*').eq('anulado', false).gte('fecha_pago', mes + '-01'),
      supabase.from('socios').select('id, nombre'),
      supabase.from('sucursales').select('id, codigo'),
      supabase.from('pagos').select('*').order('fecha_emision', { ascending: false }).limit(8),
      supabase.from('devengamientos').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    ]);

  const totalMes = (pagosMes || []).reduce((s, p) => s + Number(p.importe), 0);
  const cantidadCobros = (pagosMes || []).length;
  const sociosMap = new Map((socios || []).map((s) => [s.id, s.nombre]));
  const sucursalesMap = new Map((sucursales || []).map((s) => [s.id, s.codigo]));

  return (
    <div>
      <div className="main-header"><h1>Inicio</h1></div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Socios activos</div>
          <div className="stat-value">{sociosActivos || 0}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Recaudado este mes</div>
          <div className="stat-value success">{fmtMoney(totalMes)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Cobros del mes</div>
          <div className="stat-value">{cantidadCobros}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Cuotas pendientes</div>
          <div className="stat-value danger">{deudas || 0}</div>
        </div>
      </div>

      <div className="card">
        <h3>Últimos cobros</h3>
        {!recientes || recientes.length === 0 ? (
          <div className="empty">Aún no hay cobros registrados</div>
        ) : (
          <>
            {/* Desktop: tabla */}
            <table className="desktop-only">
              <thead>
                <tr><th>Recibo</th><th>Fecha</th><th>Socio</th><th>Cobrador</th><th>Importe</th></tr>
              </thead>
              <tbody>
                {recientes.map((p) => {
                  const codigo = sucursalesMap.get(p.sucursal_id) || '?';
                  return (
                    <tr key={p.id} style={p.anulado ? { opacity: 0.5, textDecoration: 'line-through' } : {}}>
                      <td className="recibo-num">{formatNumeroRecibo(codigo, p.numero)}</td>
                      <td>{fmtDate(p.fecha_pago)}</td>
                      <td>{sociosMap.get(p.socio_id) || '-'}</td>
                      <td>{p.cobrador || '-'}</td>
                      <td>{fmtMoney(p.importe)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Mobile: cards */}
            <div className="mobile-only">
              {recientes.map((p) => {
                const codigo = sucursalesMap.get(p.sucursal_id) || '?';
                return (
                  <div key={p.id} className="pago-card" style={p.anulado ? { opacity: 0.5 } : {}}>
                    <div className="pago-card-head">
                      <span className="pago-card-num">{formatNumeroRecibo(codigo, p.numero)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtDate(p.fecha_pago)}</span>
                    </div>
                    <div className="pago-card-info">{sociosMap.get(p.socio_id) || '-'}</div>
                    <div className="pago-card-info">Cobrador: {p.cobrador || '-'}</div>
                    <div className="pago-card-importe">{fmtMoney(p.importe)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
