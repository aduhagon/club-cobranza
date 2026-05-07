'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { fmtMoney, fmtMesLargo } from '@/lib/utils';
import { exportarExcel, exportarPDF } from '@/lib/reportes';
import type { Usuario, Club, Devengamiento, TipoCuota, Socio } from '@/lib/types';

interface SocioMoroso {
  socio: Socio;
  cantidad: number;
  total: number;
  masAntiguo: string;
  cobradorNombre: string;
  meses: string[];
}

interface ReporteData {
  morosos: SocioMoroso[];
  totalAdeudado: number;
  promedioMeses: number;
  porCobrador: Array<{ cobrador: string; cantidad: number; total: number }>;
  porAntiguedad: Array<{ rango: string; cantidad: number; total: number }>;
}

export default function ReporteMorosidad({ yo, club }: { yo: Usuario; club: Club | null }) {
  const supabase = createClient();
  const toast = useToast();
  const [data, setData] = useState<ReporteData | null>(null);
  const [cargando, setCargando] = useState(false);
  const [minMeses, setMinMeses] = useState<number>(1);
  const [filtroCobrador, setFiltroCobrador] = useState<string>('');
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [tipos, setTipos] = useState<TipoCuota[]>([]);
  const [cobradores, setCobradores] = useState<Usuario[]>([]);

  useEffect(() => { cargar(); }, []);
  useEffect(() => { recalcular(); }, [minMeses, filtroCobrador, filtroTipo]);

  const [todosMorosos, setTodosMorosos] = useState<SocioMoroso[]>([]);

  async function cargar() {
    setCargando(true);
    const [sociosRes, devsRes, tiposRes, cobsRes] = await Promise.all([
      supabase.from('socios').select('*').is('fecha_baja', null),
      supabase.from('devengamientos').select('*').eq('estado', 'pendiente'),
      supabase.from('tipos_cuota').select('*'),
      supabase.from('usuarios').select('*').eq('rol', 'cobrador'),
    ]);

    const socios = (sociosRes.data || []) as Socio[];
    const devs = (devsRes.data || []) as Devengamiento[];
    const tiposLocal = (tiposRes.data || []) as TipoCuota[];
    const cobsLocal = (cobsRes.data || []) as Usuario[];

    setTipos(tiposLocal);
    setCobradores(cobsLocal);

    const cobradoresMap = new Map(cobsLocal.map((c) => [c.id, c.nombre]));

    // Filtrar por cobrador si soy cobrador
    let sociosFiltro = socios;
    if (yo.rol === 'cobrador') {
      sociosFiltro = sociosFiltro.filter((s) => s.cobrador_id === yo.id);
    }

    // Agrupar devengamientos por socio
    const devsBySocio = new Map<string, Devengamiento[]>();
    for (const d of devs) {
      if (!devsBySocio.has(d.socio_id)) devsBySocio.set(d.socio_id, []);
      devsBySocio.get(d.socio_id)!.push(d);
    }

    const morosos: SocioMoroso[] = [];
    for (const socio of sociosFiltro) {
      const ds = devsBySocio.get(socio.id) || [];
      if (ds.length === 0) continue;
      const meses = ds.map((d) => d.periodo).sort();
      const total = ds.reduce((s, d) => s + Number(d.importe), 0);
      morosos.push({
        socio,
        cantidad: ds.length,
        total,
        masAntiguo: meses[0],
        cobradorNombre: socio.cobrador_id ? (cobradoresMap.get(socio.cobrador_id) || '?') : 'libre',
        meses,
      });
    }

    morosos.sort((a, b) => b.cantidad - a.cantidad || b.total - a.total);
    setTodosMorosos(morosos);
    setCargando(false);
  }

  function recalcular() {
    if (!todosMorosos.length && !cargando) {
      setData({ morosos: [], totalAdeudado: 0, promedioMeses: 0, porCobrador: [], porAntiguedad: [] });
      return;
    }

    let filtrados = todosMorosos.filter((m) => m.cantidad >= minMeses);

    if (filtroCobrador === '__sin__') {
      filtrados = filtrados.filter((m) => !m.socio.cobrador_id);
    } else if (filtroCobrador) {
      filtrados = filtrados.filter((m) => m.socio.cobrador_id === filtroCobrador);
    }

    if (filtroTipo) {
      filtrados = filtrados.filter((m) => m.socio.tipo_cuota_id === filtroTipo);
    }

    const totalAdeudado = filtrados.reduce((s, m) => s + m.total, 0);
    const promedioMeses = filtrados.length > 0
      ? filtrados.reduce((s, m) => s + m.cantidad, 0) / filtrados.length
      : 0;

    // Por cobrador
    const porCobMap = new Map<string, { cantidad: number; total: number }>();
    filtrados.forEach((m) => {
      const c = porCobMap.get(m.cobradorNombre) || { cantidad: 0, total: 0 };
      c.cantidad++;
      c.total += m.total;
      porCobMap.set(m.cobradorNombre, c);
    });
    const porCobrador = Array.from(porCobMap.entries())
      .map(([cobrador, v]) => ({ cobrador, ...v }))
      .sort((a, b) => b.total - a.total);

    // Por antigüedad
    const porAntMap = new Map<string, { cantidad: number; total: number }>();
    const rango = (n: number): string => {
      if (n === 1) return '1 mes';
      if (n <= 3) return '2 a 3 meses';
      if (n <= 6) return '4 a 6 meses';
      if (n <= 12) return '7 a 12 meses';
      return 'Más de 12 meses';
    };
    filtrados.forEach((m) => {
      const r = rango(m.cantidad);
      const x = porAntMap.get(r) || { cantidad: 0, total: 0 };
      x.cantidad++;
      x.total += m.total;
      porAntMap.set(r, x);
    });
    const orden = ['1 mes', '2 a 3 meses', '4 a 6 meses', '7 a 12 meses', 'Más de 12 meses'];
    const porAntiguedad = orden
      .map((r) => ({ rango: r, ...(porAntMap.get(r) || { cantidad: 0, total: 0 }) }))
      .filter((x) => x.cantidad > 0);

    setData({ morosos: filtrados, totalAdeudado, promedioMeses, porCobrador, porAntiguedad });
  }

  function enviarRecordatorio(m: SocioMoroso) {
    const nombreClub = club?.nombre || 'Club';
    const meses = m.meses.map(fmtMesLargo).join(', ');
    const texto =
      `Hola ${m.socio.nombre.split(' ')[0]}, te escribo desde *${nombreClub}*.\n\n` +
      `Tenés *${m.cantidad} cuota${m.cantidad > 1 ? 's' : ''}* pendiente${m.cantidad > 1 ? 's' : ''} (${meses}) ` +
      `por un total de *${fmtMoney(m.total)}*.\n\n` +
      `Te pido por favor que regularices tu situación cuando puedas. ¡Gracias!`;

    const tel = (m.socio.telefono || '').replace(/[^0-9]/g, '');
    if (!tel) {
      toast.warning(`${m.socio.nombre} no tiene teléfono cargado`);
      return;
    }
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
  }

  function exportarExcelHandler() {
    if (!data) return;
    exportarExcel({
      filename: `morosidad-${new Date().toISOString().slice(0, 10)}.xlsx`,
      hojas: [
        {
          nombre: 'Resumen',
          encabezados: ['Concepto', 'Valor'],
          filas: [
            ['Socios morosos', data.morosos.length],
            ['Total adeudado', data.totalAdeudado],
            ['Promedio meses adeudados', data.promedioMeses.toFixed(1)],
          ],
          anchos: [30, 20],
        },
        {
          nombre: 'Por antigüedad',
          encabezados: ['Rango', 'Cantidad', 'Total'],
          filas: data.porAntiguedad.map((a) => [a.rango, a.cantidad, a.total]),
          anchos: [25, 12, 16],
        },
        {
          nombre: 'Por cobrador',
          encabezados: ['Cobrador', 'Cantidad socios', 'Total'],
          filas: data.porCobrador.map((c) => [c.cobrador, c.cantidad, c.total]),
          anchos: [25, 18, 16],
        },
        {
          nombre: 'Detalle',
          encabezados: ['N°', 'Nombre', 'DNI', 'Teléfono', 'Cobrador', 'Meses', 'Más antiguo', 'Total'],
          filas: data.morosos.map((m) => [
            m.socio.numero,
            m.socio.nombre,
            m.socio.dni || '',
            m.socio.telefono || '',
            m.cobradorNombre,
            m.cantidad,
            fmtMesLargo(m.masAntiguo),
            m.total,
          ]),
          anchos: [8, 30, 12, 16, 20, 8, 16, 14],
        },
      ],
    });
    toast.success('Excel descargado');
  }

  async function exportarPDFHandler() {
    if (!data) return;
    await exportarPDF({
      filename: `morosidad-${new Date().toISOString().slice(0, 10)}.pdf`,
      titulo: 'Reporte de morosidad',
      subtitulo: `Al ${new Date().toLocaleDateString('es-AR')}`,
      club,
      secciones: [
        {
          titulo: 'Resumen',
          encabezados: ['Concepto', 'Valor'],
          filas: [
            ['Socios morosos', String(data.morosos.length)],
            ['Total adeudado', fmtMoney(data.totalAdeudado)],
            ['Promedio meses', data.promedioMeses.toFixed(1)],
          ],
        },
        {
          titulo: 'Por antigüedad',
          encabezados: ['Rango', 'Cantidad', 'Total'],
          filas: data.porAntiguedad.map((a) => [a.rango, String(a.cantidad), fmtMoney(a.total)]),
        },
        {
          titulo: 'Por cobrador',
          encabezados: ['Cobrador', 'Socios', 'Total'],
          filas: data.porCobrador.map((c) => [c.cobrador, String(c.cantidad), fmtMoney(c.total)]),
        },
        {
          titulo: `Detalle (${data.morosos.length})`,
          encabezados: ['N°', 'Nombre', 'Cobrador', 'Meses', 'Total'],
          filas: data.morosos.slice(0, 200).map((m) => [
            String(m.socio.numero),
            m.socio.nombre,
            m.cobradorNombre,
            String(m.cantidad),
            fmtMoney(m.total),
          ]),
          totales: [{ label: 'Total adeudado', value: fmtMoney(data.totalAdeudado) }],
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
            <label>Mínimo meses adeudados</label>
            <input
              type="number" min={1} max={36} value={minMeses}
              onChange={(e) => setMinMeses(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          {yo.rol === 'admin' && (
            <div className="field">
              <label>Cobrador</label>
              <select value={filtroCobrador} onChange={(e) => setFiltroCobrador(e.target.value)}>
                <option value="">Todos</option>
                <option value="__sin__">Sin cobrador (libres)</option>
                {cobradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Tipo de cuota</label>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
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
          <div className="stat-label">Socios morosos</div>
          <div className="stat-value danger">{data.morosos.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total adeudado</div>
          <div className="stat-value danger">{fmtMoney(data.totalAdeudado)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Promedio meses</div>
          <div className="stat-value">{data.promedioMeses.toFixed(1)}</div>
        </div>
      </div>

      {data.morosos.length === 0 ? (
        <div className="card empty">
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
          <div>No hay morosos con los filtros aplicados</div>
        </div>
      ) : (
        <>
          {data.porAntiguedad.length > 0 && (
            <div className="card">
              <h3>Por antigüedad de la deuda</h3>
              <table>
                <thead>
                  <tr><th>Rango</th><th style={{ width: 100 }}>Socios</th><th style={{ width: 130 }}>Total</th></tr>
                </thead>
                <tbody>
                  {data.porAntiguedad.map((a) => (
                    <tr key={a.rango}>
                      <td>{a.rango}</td>
                      <td>{a.cantidad}</td>
                      <td><strong>{fmtMoney(a.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {yo.rol === 'admin' && data.porCobrador.length > 0 && (
            <div className="card">
              <h3>Por cobrador</h3>
              <table>
                <thead>
                  <tr><th>Cobrador</th><th style={{ width: 100 }}>Socios</th><th style={{ width: 130 }}>Total</th></tr>
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

          <div className="card" style={{ padding: 0 }}>
            <h3 style={{ padding: '1rem 1.25rem 0' }}>Detalle de morosos ({data.morosos.length})</h3>
            <table className="desktop-only">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>N°</th>
                  <th>Nombre</th>
                  <th style={{ width: 130 }}>Teléfono</th>
                  <th>Cobrador</th>
                  <th style={{ width: 70 }}>Meses</th>
                  <th style={{ width: 130 }}>Más antiguo</th>
                  <th style={{ width: 130 }}>Total</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {data.morosos.slice(0, 300).map((m) => (
                  <tr key={m.socio.id}>
                    <td>{m.socio.numero}</td>
                    <td>{m.socio.nombre}</td>
                    <td>{m.socio.telefono || '—'}</td>
                    <td>{m.cobradorNombre}</td>
                    <td><span className="badge deuda">{m.cantidad}</span></td>
                    <td style={{ fontSize: 12 }}>{fmtMesLargo(m.masAntiguo)}</td>
                    <td><strong style={{ color: 'var(--danger)' }}>{fmtMoney(m.total)}</strong></td>
                    <td>
                      <button onClick={() => enviarRecordatorio(m)} title="Enviar recordatorio por WhatsApp">
                        💬
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mobile-only" style={{ padding: 8 }}>
              {data.morosos.slice(0, 100).map((m) => (
                <div key={m.socio.id} className="socio-card">
                  <div className="socio-card-head">
                    <div>
                      <span className="socio-card-num">#{m.socio.numero}</span>{' '}
                      <span className="socio-card-title">{m.socio.nombre}</span>
                    </div>
                    <span className="badge deuda">{m.cantidad} {m.cantidad === 1 ? 'mes' : 'meses'}</span>
                  </div>
                  <div className="socio-card-info">Cobrador: {m.cobradorNombre}</div>
                  <div className="socio-card-info">Desde: {fmtMesLargo(m.masAntiguo)}</div>
                  {m.socio.telefono && <div className="socio-card-info">📞 {m.socio.telefono}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <strong style={{ color: 'var(--danger)', fontSize: 16 }}>{fmtMoney(m.total)}</strong>
                    {m.socio.telefono && (
                      <button onClick={() => enviarRecordatorio(m)}>💬 WhatsApp</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {data.morosos.length > 300 && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                Mostrando 300 de {data.morosos.length}. Exportá a Excel para ver todos.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
