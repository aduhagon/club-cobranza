'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { fmtMoney, fmtMesLargo, thisMonth } from '@/lib/utils';
import { exportarExcel, exportarPDF } from '@/lib/reportes';
import type { Usuario, Club, Devengamiento, TipoCuota, Socio } from '@/lib/types';

interface ReporteData {
  devs: Devengamiento[];
  socios: Socio[];
  tipos: TipoCuota[];
  totalDevengado: number;
  totalCobrado: number;
  totalPendiente: number;
  cantidadTotal: number;
  cantidadCobrada: number;
  cantidadPendiente: number;
  tasa: number;
  porTipo: Array<{ tipo: string; cantidad: number; devengado: number; cobrado: number; pendiente: number }>;
  pendientes: Array<{ dev: Devengamiento; socio: Socio | undefined }>;
}

export default function ReporteDevengamientos({ yo, club }: { yo: Usuario; club: Club | null }) {
  const supabase = createClient();
  const toast = useToast();
  const [periodo, setPeriodo] = useState(thisMonth());
  const [data, setData] = useState<ReporteData | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => { cargar(); }, [periodo]);

  async function cargar() {
    setCargando(true);

    let sociosQuery = supabase.from('socios').select('*');
    if (yo.rol === 'cobrador') {
      sociosQuery = sociosQuery.eq('cobrador_id', yo.id);
    }
    const { data: sociosData } = await sociosQuery;
    const socios = (sociosData || []) as Socio[];
    const socioIds = socios.map((s) => s.id);

    let devsQuery = supabase.from('devengamientos').select('*').eq('periodo', periodo);
    if (yo.rol === 'cobrador') {
      if (socioIds.length === 0) {
        setData({
          devs: [], socios: [], tipos: [],
          totalDevengado: 0, totalCobrado: 0, totalPendiente: 0,
          cantidadTotal: 0, cantidadCobrada: 0, cantidadPendiente: 0,
          tasa: 0, porTipo: [], pendientes: [],
        });
        setCargando(false);
        return;
      }
      devsQuery = devsQuery.in('socio_id', socioIds);
    }

    const [devsRes, tiposRes] = await Promise.all([
      devsQuery,
      supabase.from('tipos_cuota').select('*'),
    ]);

    const devs = (devsRes.data || []) as Devengamiento[];
    const tipos = (tiposRes.data || []) as TipoCuota[];
    const sociosMap = new Map(socios.map((s) => [s.id, s]));
    const tiposMap = new Map(tipos.map((t) => [t.id, t]));

    const totalDevengado = devs.reduce((s, d) => s + Number(d.importe), 0);
    const cobrados = devs.filter((d) => d.estado === 'pagado');
    const pendientes = devs.filter((d) => d.estado === 'pendiente');
    const totalCobrado = cobrados.reduce((s, d) => s + Number(d.importe), 0);
    const totalPendiente = pendientes.reduce((s, d) => s + Number(d.importe), 0);

    // Por tipo
    const porTipoMap = new Map<string, { cantidad: number; devengado: number; cobrado: number; pendiente: number }>();
    devs.forEach((d) => {
      const tipoNombre = tiposMap.get(d.tipo_id)?.nombre || '?';
      const m = porTipoMap.get(tipoNombre) || { cantidad: 0, devengado: 0, cobrado: 0, pendiente: 0 };
      m.cantidad++;
      m.devengado += Number(d.importe);
      if (d.estado === 'pagado') m.cobrado += Number(d.importe);
      else m.pendiente += Number(d.importe);
      porTipoMap.set(tipoNombre, m);
    });
    const porTipo = Array.from(porTipoMap.entries())
      .map(([tipo, v]) => ({ tipo, ...v }))
      .sort((a, b) => b.devengado - a.devengado);

    // Pendientes con socio
    const listaPendientes = pendientes.map((dev) => ({ dev, socio: sociosMap.get(dev.socio_id) }))
      .filter((x) => x.socio)
      .sort((a, b) => (a.socio?.nombre || '').localeCompare(b.socio?.nombre || ''));

    setData({
      devs, socios, tipos,
      totalDevengado, totalCobrado, totalPendiente,
      cantidadTotal: devs.length,
      cantidadCobrada: cobrados.length,
      cantidadPendiente: pendientes.length,
      tasa: totalDevengado > 0 ? (totalCobrado / totalDevengado) * 100 : 0,
      porTipo,
      pendientes: listaPendientes,
    });
    setCargando(false);
  }

  function exportarExcelHandler() {
    if (!data) return;
    exportarExcel({
      filename: `devengamientos-${periodo}.xlsx`,
      hojas: [
        {
          nombre: 'Resumen',
          encabezados: ['Concepto', 'Valor'],
          filas: [
            ['Período', fmtMesLargo(periodo)],
            ['Total devengado', data.totalDevengado],
            ['Total cobrado', data.totalCobrado],
            ['Total pendiente', data.totalPendiente],
            ['Tasa de cobranza', `${data.tasa.toFixed(1)}%`],
            ['Cantidad de devengamientos', data.cantidadTotal],
            ['Cobrados', data.cantidadCobrada],
            ['Pendientes', data.cantidadPendiente],
          ],
          anchos: [30, 20],
        },
        {
          nombre: 'Por tipo',
          encabezados: ['Tipo', 'Cantidad', 'Devengado', 'Cobrado', 'Pendiente', '% cobrado'],
          filas: data.porTipo.map((t) => [
            t.tipo, t.cantidad, t.devengado, t.cobrado, t.pendiente,
            t.devengado > 0 ? `${((t.cobrado / t.devengado) * 100).toFixed(1)}%` : '0%',
          ]),
          anchos: [25, 12, 16, 16, 16, 12],
        },
        {
          nombre: 'Pendientes',
          encabezados: ['N°', 'Socio', 'Importe'],
          filas: data.pendientes.map(({ dev, socio }) => [
            socio?.numero || '?',
            socio?.nombre || '?',
            Number(dev.importe),
          ]),
          anchos: [8, 35, 16],
        },
      ],
    });
    toast.success('Excel descargado');
  }

  async function exportarPDFHandler() {
    if (!data) return;
    await exportarPDF({
      filename: `devengamientos-${periodo}.pdf`,
      titulo: 'Reporte de devengamientos',
      subtitulo: fmtMesLargo(periodo),
      club,
      secciones: [
        {
          titulo: 'Resumen',
          encabezados: ['Concepto', 'Valor'],
          filas: [
            ['Total devengado', fmtMoney(data.totalDevengado)],
            ['Total cobrado', fmtMoney(data.totalCobrado)],
            ['Total pendiente', fmtMoney(data.totalPendiente)],
            ['Tasa de cobranza', `${data.tasa.toFixed(1)}%`],
            ['Cantidad', String(data.cantidadTotal)],
            ['Cobrados', String(data.cantidadCobrada)],
            ['Pendientes', String(data.cantidadPendiente)],
          ],
        },
        {
          titulo: 'Por tipo de cuota',
          encabezados: ['Tipo', 'Cant.', 'Devengado', 'Cobrado'],
          filas: data.porTipo.map((t) => [
            t.tipo, String(t.cantidad), fmtMoney(t.devengado), fmtMoney(t.cobrado),
          ]),
        },
        {
          titulo: `Pendientes (${data.pendientes.length})`,
          encabezados: ['N°', 'Socio', 'Importe'],
          filas: data.pendientes.slice(0, 100).map(({ dev, socio }) => [
            String(socio?.numero || '?'),
            socio?.nombre || '?',
            fmtMoney(dev.importe),
          ]),
          totales: [{ label: 'Total pendiente', value: fmtMoney(data.totalPendiente) }],
        },
      ],
    });
    toast.success('PDF descargado');
  }

  if (cargando || !data) return <div className="empty">Cargando...</div>;

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
              <button onClick={exportarExcelHandler}>📊 Excel</button>
              <button onClick={exportarPDFHandler}>📄 PDF</button>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Devengado</div>
          <div className="stat-value">{fmtMoney(data.totalDevengado)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{data.cantidadTotal} cuotas</div>
        </div>
        <div className="stat">
          <div className="stat-label">Cobrado</div>
          <div className="stat-value success">{fmtMoney(data.totalCobrado)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{data.cantidadCobrada} cuotas</div>
        </div>
        <div className="stat">
          <div className="stat-label">Pendiente</div>
          <div className="stat-value danger">{fmtMoney(data.totalPendiente)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{data.cantidadPendiente} cuotas</div>
        </div>
        <div className="stat">
          <div className="stat-label">Tasa de cobranza</div>
          <div className="stat-value" style={{ color: data.tasa >= 80 ? 'var(--success)' : data.tasa >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
            {data.tasa.toFixed(1)}%
          </div>
        </div>
      </div>

      {data.cantidadTotal === 0 ? (
        <div className="card empty">No hay devengamientos en {fmtMesLargo(periodo)}</div>
      ) : (
        <>
          <div className="card">
            <h3>Por tipo de cuota</h3>
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th style={{ width: 70 }}>Cant.</th>
                  <th style={{ width: 130 }}>Devengado</th>
                  <th style={{ width: 130 }}>Cobrado</th>
                  <th style={{ width: 130 }}>Pendiente</th>
                  <th style={{ width: 70 }}>% cobr.</th>
                </tr>
              </thead>
              <tbody>
                {data.porTipo.map((t) => (
                  <tr key={t.tipo}>
                    <td>{t.tipo}</td>
                    <td>{t.cantidad}</td>
                    <td>{fmtMoney(t.devengado)}</td>
                    <td style={{ color: 'var(--success)' }}>{fmtMoney(t.cobrado)}</td>
                    <td style={{ color: 'var(--danger)' }}>{fmtMoney(t.pendiente)}</td>
                    <td>{t.devengado > 0 ? ((t.cobrado / t.devengado) * 100).toFixed(0) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.pendientes.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <h3 style={{ padding: '1rem 1.25rem 0' }}>Cuotas pendientes ({data.pendientes.length})</h3>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>N°</th>
                    <th>Socio</th>
                    <th style={{ width: 130 }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pendientes.slice(0, 200).map(({ dev, socio }) => (
                    <tr key={dev.id}>
                      <td>{socio?.numero || '?'}</td>
                      <td>{socio?.nombre || '?'}</td>
                      <td><strong>{fmtMoney(dev.importe)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.pendientes.length > 200 && (
                <div style={{ padding: 12, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                  Mostrando 200 de {data.pendientes.length}. Exportá a Excel para ver todos.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
