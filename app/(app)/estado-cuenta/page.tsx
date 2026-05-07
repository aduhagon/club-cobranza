'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { fmtMoney, fmtDate, fmtMesLargo, formatNumeroRecibo } from '@/lib/utils';
import { exportarEstadoCuentaPDF, exportarExcel } from '@/lib/reportes';
import SocioSearchInput from '@/components/SocioSearchInput';
import type { Usuario, Club, Socio, TipoCuota, Devengamiento, Pago, Sucursal } from '@/lib/types';

interface FilaEstado {
  periodo: string;
  devengado: number;
  pagado: number;
  fecha_pago: string | null;
  estado: 'pagado' | 'pendiente' | 'parcial';
  recibo: string | null;
  pago_id: string | null;
  origen: string;
}

interface DataEstado {
  socio: Socio;
  tipoCuota: TipoCuota | null;
  cobrador: Usuario | null;
  filas: FilaEstado[];
  totalDevengado: number;
  totalPagado: number;
  saldo: number;
  saldoVencido: number;
  cantidadPendientes: number;
}

function EstadoCuentaContent() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();

  const socioIdParam = params.get('socio') || '';

  const [yo, setYo] = useState<Usuario | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [socioId, setSocioId] = useState(socioIdParam);
  const [data, setData] = useState<DataEstado | null>(null);
  const [loading, setLoading] = useState(true);
  const [cargandoEstado, setCargandoEstado] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  useEffect(() => { init(); }, []);
  useEffect(() => {
    if (socioId) cargarEstado(socioId);
    else setData(null);
  }, [socioId]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [yoRes, clubRes] = await Promise.all([
      supabase.from('usuarios').select('*').eq('auth_id', user.id).single(),
      supabase.from('clubes').select('*').limit(1).maybeSingle(),
    ]);
    const yoData = yoRes.data as Usuario;
    setYo(yoData);
    setClub(clubRes.data as Club | null);

    let sociosQuery = supabase.from('socios').select('*').order('numero');
    if (yoData.rol === 'cobrador') {
      sociosQuery = sociosQuery.eq('cobrador_id', yoData.id);
    }
    const { data: sociosData } = await sociosQuery;
    setSocios((sociosData || []) as Socio[]);
    setLoading(false);
  }

  async function cargarEstado(sId: string) {
    setCargandoEstado(true);
    setData(null);

    const [socioRes, tiposRes, cobradoresRes, devsRes] = await Promise.all([
      supabase.from('socios').select('*').eq('id', sId).single(),
      supabase.from('tipos_cuota').select('*'),
      supabase.from('usuarios').select('*').eq('rol', 'cobrador'),
      supabase.from('devengamientos').select('*').eq('socio_id', sId).order('periodo'),
    ]);

    if (socioRes.error || !socioRes.data) {
      toast.error('No se pudo cargar el socio');
      setCargandoEstado(false);
      return;
    }

    const socio = socioRes.data as Socio;
    const tipos = (tiposRes.data || []) as TipoCuota[];
    const cobradores = (cobradoresRes.data || []) as Usuario[];
    const devs = (devsRes.data || []) as Devengamiento[];

    // Obtener pagos asociados a esos devengamientos
    const pagoIds = Array.from(new Set(devs.map((d) => d.pago_id).filter(Boolean) as string[]));
    let pagosMap = new Map<string, Pago>();
    let sucursalesMap = new Map<string, Sucursal>();

    if (pagoIds.length > 0) {
      const [pagosRes, sucursalesRes] = await Promise.all([
        supabase.from('pagos').select('*').in('id', pagoIds),
        supabase.from('sucursales').select('*'),
      ]);
      pagosMap = new Map(((pagosRes.data || []) as Pago[]).map((p) => [p.id, p]));
      sucursalesMap = new Map(((sucursalesRes.data || []) as Sucursal[]).map((s) => [s.id, s]));
    }

    // Construir filas (una por devengamiento)
    const filas: FilaEstado[] = devs.map((d) => {
      const pago = d.pago_id ? pagosMap.get(d.pago_id) : null;
      const sucursal = pago ? sucursalesMap.get(pago.sucursal_id) : null;
      const reciboNum = pago && sucursal ? formatNumeroRecibo(sucursal.codigo, pago.numero) : null;

      let estado: 'pagado' | 'pendiente' | 'parcial' = d.estado === 'pagado' ? 'pagado' : 'pendiente';
      // Si el pago está anulado lo tratamos como pendiente (porque al anular vuelve a pendiente)
      if (pago?.anulado) estado = 'pendiente';

      return {
        periodo: d.periodo,
        devengado: Number(d.importe),
        pagado: estado === 'pagado' ? Number(d.importe) : 0,
        fecha_pago: estado === 'pagado' && pago ? pago.fecha_pago : null,
        estado,
        recibo: estado === 'pagado' ? reciboNum : null,
        pago_id: estado === 'pagado' && pago ? pago.id : null,
        origen: d.origen,
      };
    });

    const totalDevengado = filas.reduce((s, f) => s + f.devengado, 0);
    const totalPagado = filas.reduce((s, f) => s + f.pagado, 0);
    const saldo = totalDevengado - totalPagado;

    // Cuotas pendientes vencidas (período <= mes actual)
    const mesActual = new Date().toISOString().slice(0, 7); // YYYY-MM
    const filasVencidas = filas.filter((f) => f.estado === 'pendiente' && f.periodo <= mesActual);
    const cantidadPendientes = filasVencidas.length;
    const saldoVencido = filasVencidas.reduce((s, f) => s + f.devengado, 0);

    const tipoCuota = socio.tipo_cuota_id ? tipos.find((t) => t.id === socio.tipo_cuota_id) || null : null;
    const cobrador = socio.cobrador_id ? cobradores.find((c) => c.id === socio.cobrador_id) || null : null;

    setData({
      socio, tipoCuota, cobrador, filas,
      totalDevengado, totalPagado, saldo, saldoVencido, cantidadPendientes,
    });
    setCargandoEstado(false);
  }

  function handleSelectSocio(id: string) {
    setSocioId(id);
    // Actualiza la URL sin recargar
    if (id) router.replace(`/estado-cuenta?socio=${id}`, { scroll: false });
    else router.replace('/estado-cuenta', { scroll: false });
  }

  async function descargarPDF() {
    if (!data) return;
    setGenerandoPDF(true);
    try {
      await exportarEstadoCuentaPDF({
        filename: `estado-cuenta-${data.socio.numero}-${data.socio.nombre.replace(/\s+/g, '_')}.pdf`,
        club,
        socio: {
          numero: data.socio.numero,
          nombre: data.socio.nombre,
          dni: data.socio.dni,
          telefono: data.socio.telefono,
          email: data.socio.email,
          tipo_cuota: data.tipoCuota?.nombre,
          cobrador: data.cobrador?.nombre,
          fecha_alta: data.socio.fecha_alta,
        },
        filas: data.filas,
        totalDevengado: data.totalDevengado,
        totalPagado: data.totalPagado,
        saldo: data.saldo,
      });
      toast.success('PDF descargado');
    } catch (err: any) {
      toast.error('Error generando PDF: ' + (err.message || err));
    } finally {
      setGenerandoPDF(false);
    }
  }

  function descargarExcel() {
    if (!data) return;
    exportarExcel({
      filename: `estado-cuenta-${data.socio.numero}-${data.socio.nombre.replace(/\s+/g, '_')}.xlsx`,
      hojas: [
        {
          nombre: 'Datos del socio',
          encabezados: ['Concepto', 'Valor'],
          filas: [
            ['Número', data.socio.numero],
            ['Nombre', data.socio.nombre],
            ['DNI', data.socio.dni || ''],
            ['Teléfono', data.socio.telefono || ''],
            ['Email', data.socio.email || ''],
            ['Tipo de cuota', data.tipoCuota?.nombre || ''],
            ['Cobrador', data.cobrador?.nombre || ''],
            ['Fecha de alta', data.socio.fecha_alta],
          ],
          anchos: [25, 35],
        },
        {
          nombre: 'Estado de cuenta',
          encabezados: ['Período', 'Devengado', 'Pagado', 'Fecha de pago', 'Estado', 'Recibo'],
          filas: data.filas.map((f) => [
            fmtMesLargo(f.periodo),
            f.devengado,
            f.pagado,
            f.fecha_pago ? fmtDate(f.fecha_pago) : '',
            f.estado,
            f.recibo || '',
          ]),
          anchos: [18, 14, 14, 14, 12, 18],
        },
        {
          nombre: 'Resumen',
          encabezados: ['Concepto', 'Valor'],
          filas: [
            ['Total devengado', data.totalDevengado],
            ['Total pagado', data.totalPagado],
            ['Saldo', data.saldo],
            ['Cuotas pendientes', data.cantidadPendientes],
          ],
          anchos: [25, 18],
        },
      ],
    });
    toast.success('Excel descargado');
  }

  function enviarRecordatorioWA() {
    if (!data || data.saldoVencido <= 0) return;
    const mesActual = new Date().toISOString().slice(0, 7);
    const mesesVencidos = data.filas
      .filter((f) => f.estado === 'pendiente' && f.periodo <= mesActual)
      .map((f) => fmtMesLargo(f.periodo)).join(', ');
    const nombreClub = club?.nombre || 'Club';
    const texto =
      `Hola ${data.socio.nombre.split(' ')[0]}, te escribo desde *${nombreClub}*.\n\n` +
      `Tenés ${data.cantidadPendientes} cuota${data.cantidadPendientes > 1 ? 's' : ''} pendiente${data.cantidadPendientes > 1 ? 's' : ''} (${mesesVencidos}) ` +
      `por un total de *${fmtMoney(data.saldoVencido)}*.\n\n` +
      `Te pido por favor que regularices tu situación cuando puedas. ¡Gracias!`;
    const tel = (data.socio.telefono || '').replace(/[^0-9]/g, '');
    if (!tel) {
      toast.warning('El socio no tiene teléfono cargado');
      return;
    }
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
  }

  if (loading) return <div className="empty">Cargando...</div>;

  if (yo?.rol === 'cobrador' && socios.length === 0) {
    return (
      <div>
        <h1>Estado de cuenta</h1>
        <div className="banner warning">
          No tenés socios asignados. Pedile al administrador que te asigne socios.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="main-header">
        <h1>Estado de cuenta</h1>
      </div>

      <div className="card">
        <div className="field">
          <label>Buscar socio</label>
          <SocioSearchInput
            socios={socios}
            selectedId={socioId}
            onSelect={handleSelectSocio}
            placeholder="Escribí nombre, número o DNI..."
          />
        </div>
      </div>

      {cargandoEstado && <div className="empty">Cargando estado de cuenta...</div>}

      {data && (
        <>
          {/* Header del socio */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>
                  #{data.socio.numero} - {data.socio.nombre}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {data.socio.dni && <span>DNI: {data.socio.dni}</span>}
                  {data.socio.telefono && <span>📞 {data.socio.telefono}</span>}
                  {data.socio.email && <span>✉ {data.socio.email}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {data.tipoCuota && <span>Tipo: <strong>{data.tipoCuota.nombre}</strong></span>}
                  {data.cobrador && <span>Cobrador: <strong>{data.cobrador.nombre}</strong></span>}
                  {!data.cobrador && <span style={{ fontStyle: 'italic' }}>Sin cobrador (libre)</span>}
                  <span>Alta: {fmtDate(data.socio.fecha_alta)}</span>
                  {data.socio.debito_automatico && <span className="badge debito">DA</span>}
                  {data.socio.fecha_baja
                    ? <span className="badge inactive">Baja: {fmtDate(data.socio.fecha_baja)}</span>
                    : <span className="badge active">Activo</span>}
                </div>
              </div>
              <div className="actions">
                <button onClick={descargarExcel}>📊 Excel</button>
                <button onClick={descargarPDF} disabled={generandoPDF}>
                  {generandoPDF ? 'Generando...' : '📄 PDF'}
                </button>
                {data.saldoVencido > 0 && data.socio.telefono && (
                  <button onClick={enviarRecordatorioWA}>💬 Recordatorio</button>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">Total devengado</div>
              <div className="stat-value">{fmtMoney(data.totalDevengado)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Total pagado</div>
              <div className="stat-value success">{fmtMoney(data.totalPagado)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Saldo vencido</div>
              <div className={`stat-value ${data.saldoVencido > 0 ? 'danger' : ''}`}>
                {fmtMoney(data.saldoVencido)}
              </div>
              {data.saldo !== data.saldoVencido && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Saldo total (con futuras): {fmtMoney(data.saldo)}
                </div>
              )}
            </div>
            <div className="stat">
              <div className="stat-label">Cuotas vencidas</div>
              <div className={`stat-value ${data.cantidadPendientes > 0 ? 'danger' : ''}`}>
                {data.cantidadPendientes}
              </div>
            </div>
          </div>

          {/* Tabla del estado de cuenta */}
          <div className="card" style={{ padding: 0 }}>
            <h3 style={{ padding: '1rem 1.25rem 0' }}>Detalle por período ({data.filas.length})</h3>
            {data.filas.length === 0 ? (
              <div className="empty">El socio no tiene devengamientos registrados</div>
            ) : (
              <>
                {/* Desktop */}
                <table className="desktop-only">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Período</th>
                      <th style={{ width: 120 }}>Devengado</th>
                      <th style={{ width: 120 }}>Pagado</th>
                      <th style={{ width: 120 }}>Fecha pago</th>
                      <th style={{ width: 100 }}>Estado</th>
                      <th>Recibo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.filas.map((f, idx) => {
                      const mesActualLocal = new Date().toISOString().slice(0, 7);
                      const esFuturo = f.estado === 'pendiente' && f.periodo > mesActualLocal;
                      return (
                        <tr key={idx} style={esFuturo ? { opacity: 0.6 } : {}}>
                          <td>{fmtMesLargo(f.periodo)}</td>
                          <td>{fmtMoney(f.devengado)}</td>
                          <td>{f.pagado > 0 ? <strong style={{ color: 'var(--success)' }}>{fmtMoney(f.pagado)}</strong> : '—'}</td>
                          <td>{f.fecha_pago ? fmtDate(f.fecha_pago) : '—'}</td>
                          <td>
                            {f.estado === 'pagado' && <span className="badge active">Pagado</span>}
                            {esFuturo && <span className="badge debito">Futuro</span>}
                            {f.estado === 'pendiente' && !esFuturo && <span className="badge deuda">Pendiente</span>}
                          </td>
                          <td className="recibo-num" style={{ fontSize: 12 }}>{f.recibo || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile */}
                <div className="mobile-only" style={{ padding: 8 }}>
                  {data.filas.map((f, idx) => {
                    const mesActualLocal = new Date().toISOString().slice(0, 7);
                    const esFuturo = f.estado === 'pendiente' && f.periodo > mesActualLocal;
                    return (
                      <div key={idx} className="pago-card" style={esFuturo ? { opacity: 0.6 } : {}}>
                        <div className="pago-card-head">
                          <strong>{fmtMesLargo(f.periodo)}</strong>
                          {f.estado === 'pagado' && <span className="badge active">Pagado</span>}
                          {esFuturo && <span className="badge debito">Futuro</span>}
                          {f.estado === 'pendiente' && !esFuturo && <span className="badge deuda">Pendiente</span>}
                        </div>
                        <div className="pago-card-info">
                          Devengado: <strong>{fmtMoney(f.devengado)}</strong>
                        </div>
                        {f.pagado > 0 && (
                          <div className="pago-card-info">
                            Pagado: <strong style={{ color: 'var(--success)' }}>{fmtMoney(f.pagado)}</strong>
                            {f.fecha_pago && <> el {fmtDate(f.fecha_pago)}</>}
                          </div>
                        )}
                        {f.recibo && (
                          <div className="pago-card-info" style={{ fontFamily: 'ui-monospace, monospace' }}>
                            Recibo {f.recibo}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {!data && !cargandoEstado && socioId === '' && (
        <div className="empty">Buscá un socio para ver su estado de cuenta</div>
      )}
    </div>
  );
}

export default function EstadoCuentaPage() {
  return (
    <Suspense fallback={<div className="empty">Cargando...</div>}>
      <EstadoCuentaContent />
    </Suspense>
  );
}
