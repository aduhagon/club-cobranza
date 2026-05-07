'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { fmtMoney, fmtDate, fmtMesLargo, thisMonth, formatNumeroRecibo } from '@/lib/utils';
import { exportarExcel, exportarPDF } from '@/lib/reportes';
import type { Usuario, Club, Pago, Sucursal, Socio } from '@/lib/types';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { SkeletonStats, SkeletonTable } from '@/components/Skeleton';

interface ReporteData {
  pagos: Pago[];
  sucursales: Sucursal[];
  socios: Socio[];
  cobradores: Map<string, string>;
  total: number;
  cantidad: number;
  ticketPromedio: number;
  totalAnterior: number;
  porMedio: Array<{ medio: string; cantidad: number; total: number }>;
  porCobrador: Array<{ cobrador: string; cantidad: number; total: number }>;
  porSucursal: Array<{ sucursal: string; cantidad: number; total: number }>;
}

function siguienteMes(p: string): string {
  const [y, m] = p.split('-').map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function mesAnterior(p: string): string {
  const [y, m] = p.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export default function ReporteCobranzas({ yo, club }: { yo: Usuario; club: Club | null }) {
  const supabase = createClient();
  const toast = useToast();
  const [periodo, setPeriodo] = useState(thisMonth());
  const [data, setData] = useState<ReporteData | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => { cargar(); }, [periodo]);

  async function cargar() {
    setCargando(true);
    const desde = periodo + '-01';
    const hasta = siguienteMes(periodo) + '-01';

    let pagosQuery = supabase
      .from('pagos').select('*')
      .eq('anulado', false)
      .gte('fecha_pago', desde).lt('fecha_pago', hasta)
      .order('fecha_pago', { ascending: false });

    if (yo.rol === 'cobrador') {
      pagosQuery = pagosQuery.eq('cobrador_id', yo.id);
    }

    // Mes anterior para comparar
    const pAnt = mesAnterior(periodo);
    const desdeAnt = pAnt + '-01';
    const hastaAnt = siguienteMes(pAnt) + '-01';
    let pagosAntQuery = supabase
      .from('pagos').select('importe').eq('anulado', false)
      .gte('fecha_pago', desdeAnt).lt('fecha_pago', hastaAnt);
    if (yo.rol === 'cobrador') pagosAntQuery = pagosAntQuery.eq('cobrador_id', yo.id);

    const [pagosRes, sucRes, socRes, cobRes, pagosAntRes] = await Promise.all([
      pagosQuery,
      supabase.from('sucursales').select('*'),
      supabase.from('socios').select('id, nombre, numero'),
      supabase.from('usuarios').select('id, nombre').eq('rol', 'cobrador'),
      pagosAntQuery,
    ]);

    const pagos = (pagosRes.data || []) as Pago[];
    const sucursales = (sucRes.data || []) as Sucursal[];
    const socios = (socRes.data || []) as Socio[];
    const cobradoresMap = new Map<string, string>(
      ((cobRes.data || []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre])
    );

    const total = pagos.reduce((s, p) => s + Number(p.importe), 0);
    const cantidad = pagos.length;
    const totalAnterior = (pagosAntRes.data || []).reduce((s: number, p: any) => s + Number(p.importe), 0);

    // Desglose por medio
    const porMedioMap = new Map<string, { cantidad: number; total: number }>();
    pagos.forEach((p) => {
      const m = porMedioMap.get(p.medio) || { cantidad: 0, total: 0 };
      m.cantidad++;
      m.total += Number(p.importe);
      porMedioMap.set(p.medio, m);
    });
    const porMedio = Array.from(porMedioMap.entries())
      .map(([medio, v]) => ({ medio, ...v }))
      .sort((a, b) => b.total - a.total);

    // Por cobrador
    const porCobMap = new Map<string, { cantidad: number; total: number }>();
    pagos.forEach((p) => {
      const nombre = p.cobrador || '—';
      const m = porCobMap.get(nombre) || { cantidad: 0, total: 0 };
      m.cantidad++;
      m.total += Number(p.importe);
      porCobMap.set(nombre, m);
    });
    const porCobrador = Array.from(porCobMap.entries())
      .map(([cobrador, v]) => ({ cobrador, ...v }))
      .sort((a, b) => b.total - a.total);

    // Por sucursal
    const sucMap = new Map(sucursales.map((s) => [s.id, s]));
    const porSucMap = new Map<string, { cantidad: number; total: number }>();
    pagos.forEach((p) => {
      const suc = sucMap.get(p.sucursal_id);
      const label = suc ? `${suc.codigo} - ${suc.nombre}` : '?';
      const m = porSucMap.get(label) || { cantidad: 0, total: 0 };
      m.cantidad++;
      m.total += Number(p.importe);
      porSucMap.set(label, m);
    });
    const porSucursal = Array.from(porSucMap.entries())
      .map(([sucursal, v]) => ({ sucursal, ...v }))
      .sort((a, b) => b.total - a.total);

    setData({
      pagos, sucursales, socios, cobradores: cobradoresMap,
      total, cantidad,
      ticketPromedio: cantidad > 0 ? total / cantidad : 0,
      totalAnterior, porMedio, porCobrador, porSucursal,
    });
    setCargando(false);
  }

  function exportarExcelHandler() {
    if (!data) return;
    const sucMap = new Map(data.sucursales.map((s) => [s.id, s]));
    const socMap = new Map(data.socios.map((s) => [s.id, s]));

    const filasDetalle = data.pagos.map((p) => {
      const suc = sucMap.get(p.sucursal_id);
      const soc = socMap.get(p.socio_id);
      return [
        suc ? formatNumeroRecibo(suc.codigo, p.numero) : '?',
        p.fecha_pago,
        soc ? `#${soc.numero} ${soc.nombre}` : '?',
        p.cobrador || '—',
        p.medio,
        Number(p.importe),
      ];
    });

    exportarExcel({
      filename: `cobranzas-${periodo}.xlsx`,
      hojas: [
        {
          nombre: 'Resumen',
          encabezados: ['Concepto', 'Valor'],
          filas: [
            ['Período', fmtMesLargo(periodo)],
            ['Total recaudado', fmtMoney(data.total)],
            ['Cantidad de cobros', data.cantidad],
            ['Ticket promedio', fmtMoney(data.ticketPromedio)],
            ['Mes anterior', fmtMoney(data.totalAnterior)],
          ],
          anchos: [25, 25],
        },
        {
          nombre: 'Por medio de pago',
          encabezados: ['Medio', 'Cantidad', 'Total'],
          filas: data.porMedio.map((x) => [x.medio, x.cantidad, x.total]),
          anchos: [25, 12, 18],
        },
        {
          nombre: 'Por cobrador',
          encabezados: ['Cobrador', 'Cantidad', 'Total'],
          filas: data.porCobrador.map((x) => [x.cobrador, x.cantidad, x.total]),
          anchos: [30, 12, 18],
        },
        {
          nombre: 'Por sucursal',
          encabezados: ['Sucursal', 'Cantidad', 'Total'],
          filas: data.porSucursal.map((x) => [x.sucursal, x.cantidad, x.total]),
          anchos: [30, 12, 18],
        },
        {
          nombre: 'Detalle',
          encabezados: ['Recibo', 'Fecha', 'Socio', 'Cobrador', 'Medio', 'Importe'],
          filas: filasDetalle,
          anchos: [16, 12, 35, 25, 18, 14],
        },
      ],
    });
    toast.success('Excel descargado');
  }

  async function exportarPDFHandler() {
    if (!data) return;
    const sucMap = new Map(data.sucursales.map((s) => [s.id, s]));
    const socMap = new Map(data.socios.map((s) => [s.id, s]));

    await exportarPDF({
      filename: `cobranzas-${periodo}.pdf`,
      titulo: 'Reporte de cobranzas',
      subtitulo: fmtMesLargo(periodo),
      club,
      secciones: [
        {
          titulo: 'Resumen',
          encabezados: ['Concepto', 'Valor'],
          filas: [
            ['Total recaudado', fmtMoney(data.total)],
            ['Cantidad de cobros', String(data.cantidad)],
            ['Ticket promedio', fmtMoney(data.ticketPromedio)],
            ['Mes anterior', fmtMoney(data.totalAnterior)],
          ],
        },
        {
          titulo: 'Por medio de pago',
          encabezados: ['Medio', 'Cant.', 'Total'],
          filas: data.porMedio.map((x) => [x.medio, String(x.cantidad), fmtMoney(x.total)]),
        },
        {
          titulo: 'Por cobrador',
          encabezados: ['Cobrador', 'Cant.', 'Total'],
          filas: data.porCobrador.map((x) => [x.cobrador, String(x.cantidad), fmtMoney(x.total)]),
        },
        {
          titulo: 'Por sucursal',
          encabezados: ['Sucursal', 'Cant.', 'Total'],
          filas: data.porSucursal.map((x) => [x.sucursal, String(x.cantidad), fmtMoney(x.total)]),
        },
        {
          titulo: 'Detalle de recibos',
          encabezados: ['Recibo', 'Fecha', 'Socio', 'Importe'],
          filas: data.pagos.slice(0, 100).map((p) => {
            const suc = sucMap.get(p.sucursal_id);
            const soc = socMap.get(p.socio_id);
            return [
              suc ? formatNumeroRecibo(suc.codigo, p.numero) : '?',
              fmtDate(p.fecha_pago),
              soc ? `${soc.nombre}` : '?',
              fmtMoney(p.importe),
            ];
          }),
          totales: [
            { label: 'Total', value: fmtMoney(data.total) },
          ],
        },
      ],
    });
    toast.success('PDF descargado');
  }

  if (cargando || !data) return (
    <div>
      <SkeletonStats count={4} />
      <SkeletonTable rows={6} />
    </div>
  );

  const variacion = data.totalAnterior > 0
    ? ((data.total - data.totalAnterior) / data.totalAnterior) * 100
    : null;

  const sucMap = new Map(data.sucursales.map((s) => [s.id, s]));
  const socMap = new Map(data.socios.map((s) => [s.id, s]));

  return (
    <div>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field">
            <label>Mes</label>
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <label>&nbsp;</label>
            <div className="actions">
              <button onClick={exportarExcelHandler}><FileSpreadsheet size={16} />Excel</button>
              <button onClick={exportarPDFHandler}><FileText size={16} />PDF</button>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Total recaudado</div>
          <div className="stat-value success">{fmtMoney(data.total)}</div>
          {variacion !== null && (
            <div style={{ fontSize: 11, color: variacion >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: 4 }}>
              {variacion >= 0 ? '↑' : '↓'} {Math.abs(variacion).toFixed(1)}% vs mes anterior
            </div>
          )}
        </div>
        <div className="stat">
          <div className="stat-label">Cantidad de cobros</div>
          <div className="stat-value">{data.cantidad}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ticket promedio</div>
          <div className="stat-value">{fmtMoney(data.ticketPromedio)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Mes anterior</div>
          <div className="stat-value">{fmtMoney(data.totalAnterior)}</div>
        </div>
      </div>

      {data.cantidad === 0 ? (
        <div className="card empty">No hay cobros en {fmtMesLargo(periodo)}</div>
      ) : (
        <>
          <div className="card">
            <h3>Por medio de pago</h3>
            <table>
              <thead>
                <tr><th>Medio</th><th style={{ width: 90 }}>Cantidad</th><th style={{ width: 130 }}>Total</th><th style={{ width: 70 }}>%</th></tr>
              </thead>
              <tbody>
                {data.porMedio.map((m) => (
                  <tr key={m.medio}>
                    <td>{m.medio}</td>
                    <td>{m.cantidad}</td>
                    <td><strong>{fmtMoney(m.total)}</strong></td>
                    <td>{((m.total / data.total) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {yo.rol === 'admin' && (
            <div className="card">
              <h3>Por cobrador</h3>
              <table>
                <thead>
                  <tr><th>Cobrador</th><th style={{ width: 90 }}>Cantidad</th><th style={{ width: 130 }}>Total</th></tr>
                </thead>
                <tbody>
                  {data.porCobrador.map((c) => (
                    <tr key={c.cobrador}>
                      <td>{c.cobrador}</td>
                      <td>{c.cantidad}</td>
                      <td><strong>{fmtMoney(c.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h3>Por sucursal</h3>
            <table>
              <thead>
                <tr><th>Sucursal</th><th style={{ width: 90 }}>Cantidad</th><th style={{ width: 130 }}>Total</th></tr>
              </thead>
              <tbody>
                {data.porSucursal.map((s) => (
                  <tr key={s.sucursal}>
                    <td>{s.sucursal}</td>
                    <td>{s.cantidad}</td>
                    <td><strong>{fmtMoney(s.total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <h3 style={{ padding: '1rem 1.25rem 0' }}>Detalle de recibos ({data.pagos.length})</h3>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 130 }}>Recibo</th>
                  <th style={{ width: 100 }}>Fecha</th>
                  <th>Socio</th>
                  <th>Cobrador</th>
                  <th style={{ width: 110 }}>Medio</th>
                  <th style={{ width: 110 }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {data.pagos.slice(0, 200).map((p) => {
                  const suc = sucMap.get(p.sucursal_id);
                  const soc = socMap.get(p.socio_id);
                  return (
                    <tr key={p.id}>
                      <td className="recibo-num">{suc ? formatNumeroRecibo(suc.codigo, p.numero) : '?'}</td>
                      <td>{fmtDate(p.fecha_pago)}</td>
                      <td>{soc ? `#${soc.numero} ${soc.nombre}` : '?'}</td>
                      <td>{p.cobrador || '—'}</td>
                      <td>{p.medio}</td>
                      <td><strong>{fmtMoney(p.importe)}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.pagos.length > 200 && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                Mostrando 200 de {data.pagos.length}. Exportá a Excel para ver todos.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
