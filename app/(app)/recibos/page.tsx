'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmtMoney, fmtDate, formatNumeroRecibo, fmtMesLargo } from '@/lib/utils';
import type { Pago, Sucursal, Socio } from '@/lib/types';

export default function RecibosPage() {
  const supabase = createClient();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
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

    const [p, s, so] = await Promise.all([
      pagosQuery,
      supabase.from('sucursales').select('*'),
      supabase.from('socios').select('id, nombre, numero, telefono'),
    ]);
    setPagos((p.data || []) as Pago[]);
    setSucursales((s.data || []) as Sucursal[]);
    setSocios((so.data || []) as Socio[]);
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
    if (e1) { alert('Error: ' + e1.message); return; }

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
          <table>
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
        )}
      </div>

      {detalle && (
        <DetalleRecibo
          pago={detalle}
          sucursales={sucursales}
          socios={socios}
          puedeAnular={miRol === 'admin' && !detalle.anulado}
          onAnular={anular}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}

function DetalleRecibo({ pago, sucursales, socios, puedeAnular, onAnular, onClose }: {
  pago: Pago;
  sucursales: Sucursal[];
  socios: Socio[];
  puedeAnular: boolean;
  onAnular: (pago: Pago, motivo: string) => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [loadingDet, setLoadingDet] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: links } = await supabase.from('pagos_devengamientos').select('devengamiento_id').eq('pago_id', pago.id);
      const ids = (links || []).map((l: any) => l.devengamiento_id);
      if (ids.length === 0) { setPeriodos([]); setLoadingDet(false); return; }
      const { data: ds } = await supabase.from('devengamientos').select('periodo').in('id', ids);
      setPeriodos((ds || []).map((d: any) => d.periodo).sort());
      setLoadingDet(false);
    }
    load();
  }, [pago.id]);

  const suc = sucursales.find((s) => s.id === pago.sucursal_id);
  const socio = socios.find((s) => s.id === pago.socio_id);
  const num = suc ? formatNumeroRecibo(suc.codigo, pago.numero) : '?';

  function enviarWhatsapp() {
    const periodosFmt = periodos.map(fmtMesLargo).join(', ');
    const texto = `*Recibo*\n\nNúmero: ${num}\nFecha: ${fmtDate(pago.fecha_pago)}\nPeríodo(s): ${periodosFmt}\nImporte: ${fmtMoney(pago.importe)}\nMedio: ${pago.medio}`;
    const tel = (socio?.telefono || '').replace(/[^0-9]/g, '');
    const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {pago.anulado && <div className="banner danger">Recibo anulado por {pago.anulado_por}{pago.motivo_anulacion ? ` - ${pago.motivo_anulacion}` : ''}</div>}
        <div className="recibo">
          <div className="recibo-header">
            <div style={{ fontWeight: 500 }}>RECIBO</div>
            <div className="recibo-num" style={{ fontSize: 18, fontWeight: 500, marginTop: 4 }}>{num}</div>
          </div>
          <div className="recibo-row"><span className="lbl">Fecha</span><span className="val">{fmtDate(pago.fecha_pago)}</span></div>
          <div className="recibo-row"><span className="lbl">Socio</span><span className="val">{socio?.nombre || '-'}</span></div>
          {socio?.numero != null && <div className="recibo-row"><span className="lbl">Socio N°</span><span className="val">{socio.numero}</span></div>}
          <div className="recibo-row"><span className="lbl">Cobrador</span><span className="val">{pago.cobrador || '-'}</span></div>
          <div className="recibo-row"><span className="lbl">Medio</span><span className="val">{pago.medio}</span></div>
          {!loadingDet && periodos.length > 0 && (
            <div className="recibo-row"><span className="lbl">Período(s)</span><span className="val">{periodos.map((p) => fmtMesLargo(p)).join(', ')}</span></div>
          )}
          <div className="recibo-total"><span>Total</span><span>{fmtMoney(pago.importe)}</span></div>
        </div>
        <div className="actions" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          {puedeAnular && (
            <button className="danger" onClick={() => {
              const motivo = prompt('Motivo de anulación:');
              if (motivo) onAnular(pago, motivo);
            }}>Anular recibo</button>
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            {!pago.anulado && <button onClick={enviarWhatsapp}>Enviar por WhatsApp</button>}
            <button className="primary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
