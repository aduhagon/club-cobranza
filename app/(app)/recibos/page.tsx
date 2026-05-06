'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmtMoney, fmtDate, formatNumeroRecibo, fmtMesLargo } from '@/lib/utils';
import { descargarReciboPDF } from '@/lib/recibo-pdf';
import ReciboVisual from '@/components/ReciboVisual';
import { useToast } from '@/components/Toast';
import type { Pago, Sucursal, Socio, Club, TipoCuota } from '@/lib/types';

export default function RecibosPage() {
  const supabase = createClient();
  const toast = useToast();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [tipos, setTipos] = useState<TipoCuota[]>([]);
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroSucursal, setFiltroSucursal] = useState('');
  const [verAnulados, setVerAnulados] = useState(false);
  const [detalle, setDetalle] = useState<Pago | null>(null);
  const [miRol, setMiRol] = useState<string>('');
  const [miNombre, setMiNombre] = useState<string>('');

  async function cargar() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: yo } = await supabase.from('usuarios').select('*').eq('auth_id', user.id).single();
    if (!yo) return;
    setMiRol(yo.rol); setMiNombre(yo.nombre);

    let pagosQuery = supabase.from('pagos').select('*').order('fecha_emision', { ascending: false }).limit(200);
    if (yo.rol === 'cobrador') pagosQuery = pagosQuery.eq('cobrador_id', yo.id);

    const [p, s, so, t, c] = await Promise.all([
      pagosQuery,
      supabase.from('sucursales').select('*'),
      supabase.from('socios').select('id, nombre, numero, telefono, dni'),
      supabase.from('tipos_cuota').select('*'),
      supabase.from('clubes').select('*').limit(1).maybeSingle(),
    ]);
    setPagos((p.data || []) as Pago[]);
    setSucursales((s.data || []) as Sucursal[]);
    setSocios((so.data || []) as Socio[]);
    setTipos((t.data || []) as TipoCuota[]);
    setClub(c.data as Club | null);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  async function anular(pago: Pago, motivo: string) {
    const { error: e1 } = await supabase
      .from('pagos')
      .update({
        anulado: true, anulado_por: miNombre,
        fecha_anulacion: new Date().toISOString(), motivo_anulacion: motivo,
      })
      .eq('id', pago.id);
    if (e1) { toast.error('Error: ' + e1.message); return; }

    const { data: links } = await supabase.from('pagos_devengamientos').select('devengamiento_id').eq('pago_id', pago.id);
    const ids = (links || []).map((l: any) => l.devengamiento_id);
    if (ids.length > 0) {
      await supabase.from('devengamientos').update({ estado: 'pendiente', pago_id: null }).in('id', ids);
    }

    await supabase.from('auditoria').insert({
      usuario: miNombre, rol: miRol, accion: 'recibo_anulado',
      detalle: 'Anulación de recibo', datos: { pago_id: pago.id, motivo },
      prev_hash: '0', hash: '0',
    });

    toast.success('Recibo anulado');
    cargar();
    setDetalle(null);
  }

  const sucursalesMap = new Map(sucursales.map((s) => [s.id, s]));
  const sociosMap = new Map(socios.map((s) => [s.id, s]));

  const filtrados = pagos.filter((p) => {
    if (filtroSucursal && p.sucursal_id !== filtroSucursal) return false;
    if (!verAnulados && p.anulado) return false;
    return true;
  });

  return (
    <div>
      <div className="main-header">
        <h1>{miRol === 'cobrador' ? 'Mis recibos' : 'Recibos'}</h1>
      </div>

      <div className="card">
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Sucursal</label>
            <select value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}>
              <option value="">Todas</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.codigo} - {s.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>
              <input type="checkbox" checked={verAnulados} onChange={(e) => setVerAnulados(e.target.checked)} />
              {' '}Mostrar anulados
            </label>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty">Cargando...</div> : filtrados.length === 0 ? (
          <div className="empty">Sin recibos</div>
        ) : (
          <>
            <table className="desktop-only">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Recibo</th>
                  <th style={{ width: 100 }}>Fecha</th>
                  <th>Socio</th>
                  <th>Cobrador</th>
                  <th style={{ width: 120 }}>Medio</th>
                  <th style={{ width: 110 }}>Importe</th>
                  <th style={{ width: 90 }}>Estado</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const suc = sucursalesMap.get(p.sucursal_id);
                  const socio = sociosMap.get(p.socio_id);
                  const num = suc ? formatNumeroRecibo(suc.codigo, p.numero) : '?';
                  return (
                    <tr key={p.id} style={p.anulado ? { opacity: 0.5 } : {}}>
                      <td className="recibo-num">{num}</td>
                      <td>{fmtDate(p.fecha_pago)}</td>
                      <td>{socio?.nombre || '-'}</td>
                      <td>{p.cobrador || '-'}</td>
                      <td>{p.medio}</td>
                      <td>{fmtMoney(p.importe)}</td>
                      <td>{p.anulado ? <span className="badge warning">Anulado</span> : <span className="badge active">Vigente</span>}</td>
                      <td><button onClick={() => setDetalle(p)}>Ver</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mobile-only" style={{ padding: 8 }}>
              {filtrados.map((p) => {
                const suc = sucursalesMap.get(p.sucursal_id);
                const socio = sociosMap.get(p.socio_id);
                const num = suc ? formatNumeroRecibo(suc.codigo, p.numero) : '?';
                return (
                  <div key={p.id} className="pago-card" style={p.anulado ? { opacity: 0.5 } : {}} onClick={() => setDetalle(p)}>
                    <div className="pago-card-head">
                      <span className="pago-card-num">{num}</span>
                      {p.anulado ? <span className="badge warning">Anulado</span> : <span className="badge active">Vigente</span>}
                    </div>
                    <div className="pago-card-info">{fmtDate(p.fecha_pago)} · {p.medio}</div>
                    <div className="pago-card-info">Socio: {socio?.nombre || '-'}</div>
                    <div className="pago-card-importe">{fmtMoney(p.importe)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {detalle && club && (
        <DetalleRecibo
          pago={detalle}
          sucursales={sucursales}
          socios={socios}
          tipos={tipos}
          club={club}
          puedeAnular={miRol === 'admin' && !detalle.anulado}
          onAnular={anular}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}

function DetalleRecibo({ pago, sucursales, socios, tipos, club, puedeAnular, onAnular, onClose }: {
  pago: Pago;
  sucursales: Sucursal[];
  socios: Socio[];
  tipos: TipoCuota[];
  club: Club;
  puedeAnular: boolean;
  onAnular: (pago: Pago, motivo: string) => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [tipoCuotaNombre, setTipoCuotaNombre] = useState<string | undefined>();
  const [loadingDet, setLoadingDet] = useState(true);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: links } = await supabase.from('pagos_devengamientos').select('devengamiento_id').eq('pago_id', pago.id);
      const ids = (links || []).map((l: any) => l.devengamiento_id);
      if (ids.length === 0) { setPeriodos([]); setLoadingDet(false); return; }
      const { data: ds } = await supabase.from('devengamientos').select('periodo, tipo_id').in('id', ids);
      const periodosOrd = (ds || []).map((d: any) => d.periodo).sort();
      setPeriodos(periodosOrd);
      const tipoIdsUnicos = Array.from(new Set((ds || []).map((d: any) => d.tipo_id)));
      const tipoNombre = tipos.find((t) => tipoIdsUnicos.includes(t.id))?.nombre;
      setTipoCuotaNombre(tipoNombre);
      setLoadingDet(false);
    }
    load();
  }, [pago.id]);

  const suc = sucursales.find((s) => s.id === pago.sucursal_id);
  const socio = socios.find((s) => s.id === pago.socio_id);
  const num = suc ? formatNumeroRecibo(suc.codigo, pago.numero) : '?';

  if (!suc || !socio) return null;

  async function descargarPDF() {
    if (!suc || !socio) return;
    setDescargando(true);
    try {
      await descargarReciboPDF({ pago, sucursal: suc, socio, club, periodos, tipoCuotaNombre });
      toast.success('PDF descargado');
    } catch (err: any) {
      toast.error('Error generando PDF: ' + (err.message || err));
    } finally {
      setDescargando(false);
    }
  }

  function enviarWhatsapp() {
    if (!socio) return;
    const periodosFmt = periodos.map(fmtMesLargo).join(', ');
    const texto =
      `*${club.nombre}*\n` +
      `*RECIBO N° ${num}*\n\n` +
      `Fecha: ${fmtDate(pago.fecha_pago)}\n` +
      `Socio: ${socio.nombre}\n` +
      `Socio N°: ${socio.numero}\n` +
      (tipoCuotaNombre ? `Concepto: ${tipoCuotaNombre}\n` : '') +
      (periodosFmt ? `Período: ${periodosFmt}\n` : '') +
      `Medio de pago: ${pago.medio}\n` +
      `*TOTAL: ${fmtMoney(pago.importe)}*\n\n` +
      `_Documento no válido como factura_`;
    const tel = (socio.telefono || '').replace(/[^0-9]/g, '');
    const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {pago.anulado && <div className="banner danger">Recibo anulado por {pago.anulado_por}{pago.motivo_anulacion ? ` - ${pago.motivo_anulacion}` : ''}</div>}
        {!loadingDet && (
          <ReciboVisual pago={pago} sucursal={suc} socio={socio} club={club} periodos={periodos} tipoCuotaNombre={tipoCuotaNombre} />
        )}
        <div className="actions" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          {puedeAnular && (
            <button className="danger" onClick={() => {
              const motivo = prompt('Motivo de anulación:');
              if (motivo) onAnular(pago, motivo);
            }}>Anular</button>
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button onClick={descargarPDF} disabled={descargando}>{descargando ? '...' : '📄 PDF'}</button>
            {!pago.anulado && <button onClick={enviarWhatsapp}>WhatsApp</button>}
            <button className="primary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
