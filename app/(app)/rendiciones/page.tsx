'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmtMoney, fmtDate, fmtDateTime, formatNumeroRecibo, todayISO } from '@/lib/utils';
import type { Rendicion, Pago, Sucursal, Socio, Usuario } from '@/lib/types';

export default function RendicionesPage() {
  const supabase = createClient();
  const [rendiciones, setRendiciones] = useState<Rendicion[]>([]);
  const [cobradores, setCobradores] = useState<Usuario[]>([]);
  const [yo, setYo] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [verRendicion, setVerRendicion] = useState<Rendicion | null>(null);

  async function cargar() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: yoData } = await supabase.from('usuarios').select('*').eq('auth_id', user.id).single();
    if (!yoData) return;
    setYo(yoData as Usuario);

    let rendQuery = supabase.from('rendiciones').select('*').order('creado_en', { ascending: false });
    if (yoData.rol === 'cobrador') rendQuery = rendQuery.eq('cobrador_id', yoData.id);

    const [r, c] = await Promise.all([
      rendQuery,
      supabase.from('usuarios').select('*').eq('rol', 'cobrador'),
    ]);
    setRendiciones((r.data || []) as Rendicion[]);
    setCobradores((c.data || []) as Usuario[]);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  function badgeEstado(estado: string) {
    if (estado === 'cerrada') return <span className="badge warning">Pendiente aprobación</span>;
    if (estado === 'aprobada') return <span className="badge active">Aprobada</span>;
    if (estado === 'rechazada') return <span className="badge deuda">Rechazada</span>;
    return <span className="badge inactive">{estado}</span>;
  }

  return (
    <div>
      <div className="main-header">
        <h1>{yo?.rol === 'cobrador' ? 'Mis rendiciones' : 'Rendiciones'}</h1>
        {yo && (yo.rol === 'cobrador' || yo.rol === 'admin') && (
          <button className="primary" onClick={() => setCrearAbierto(true)}>+ Nueva rendición</button>
        )}
      </div>

      <div className="banner info">
        Una rendición agrupa los recibos cobrados por un cobrador en un período. El cobrador la cierra al entregar el dinero,
        y luego el administrador la <strong>aprueba</strong> o <strong>rechaza</strong>. Una rendición aprobada queda como registro definitivo.
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty">Cargando...</div> : rendiciones.length === 0 ? (
          <div className="empty">Sin rendiciones</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cobrador</th>
                <th style={{ width: 110 }}>Desde</th>
                <th style={{ width: 110 }}>Hasta</th>
                <th style={{ width: 130 }}>Total</th>
                <th style={{ width: 170 }}>Estado</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {rendiciones.map((r) => (
                <tr key={r.id}>
                  <td>{r.cobrador}</td>
                  <td>{fmtDate(r.semana_inicio)}</td>
                  <td>{fmtDate(r.semana_fin)}</td>
                  <td>{fmtMoney(r.total_cerrado)}</td>
                  <td>{badgeEstado(r.estado)}</td>
                  <td><button onClick={() => setVerRendicion(r)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {crearAbierto && yo && (
        <CrearRendicionModal yo={yo} cobradores={cobradores} onClose={() => setCrearAbierto(false)} onSaved={() => { setCrearAbierto(false); cargar(); }} />
      )}

      {verRendicion && yo && (
        <DetalleRendicionModal rendicion={verRendicion} yo={yo} onClose={() => setVerRendicion(null)} onChanged={() => { setVerRendicion(null); cargar(); }} />
      )}
    </div>
  );
}

function CrearRendicionModal({ yo, cobradores, onClose, onSaved }: {
  yo: Usuario;
  cobradores: Usuario[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [cobradorId, setCobradorId] = useState(yo.rol === 'cobrador' ? yo.id : (cobradores[0]?.id || ''));
  const [desde, setDesde] = useState(todayISO());
  const [hasta, setHasta] = useState(todayISO());
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function buscarPagos() {
    if (!cobradorId || !desde || !hasta) return;
    setCargando(true);

    const { data: pagosData } = await supabase
      .from('pagos')
      .select('*')
      .eq('cobrador_id', cobradorId)
      .eq('anulado', false)
      .gte('fecha_pago', desde)
      .lte('fecha_pago', hasta)
      .order('fecha_pago');

    const ids = (pagosData || []).map((p: any) => p.id);
    let idsEnRendicion = new Set<string>();
    if (ids.length > 0) {
      const { data: rendPagos } = await supabase
        .from('rendiciones_pagos')
        .select('pago_id')
        .in('pago_id', ids);
      idsEnRendicion = new Set((rendPagos || []).map((r: any) => r.pago_id));
    }

    const disponibles = (pagosData || []).filter((p: any) => !idsEnRendicion.has(p.id)) as Pago[];
    setPagos(disponibles);
    setSeleccionados(disponibles.map((p) => p.id));
    setCargando(false);
  }

  function toggle(id: string) {
    setSeleccionados((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function guardar() {
    if (seleccionados.length === 0) { alert('Seleccioná al menos un pago'); return; }
    setGuardando(true);

    try {
      const pagosSel = pagos.filter((p) => seleccionados.includes(p.id));
      const total = pagosSel.reduce((s, p) => s + Number(p.importe), 0);
      const cobradorSel = cobradores.find((c) => c.id === cobradorId) || (yo.id === cobradorId ? yo : null);

      const { data: rend, error } = await supabase.from('rendiciones').insert({
        cobrador: cobradorSel?.nombre || '-',
        cobrador_id: cobradorId,
        semana_inicio: desde,
        semana_fin: hasta,
        total_cerrado: total,
        estado: 'cerrada',
      }).select().single();

      if (error) { alert('Error: ' + error.message); setGuardando(false); return; }

      const links = pagosSel.map((p) => ({ rendicion_id: rend.id, pago_id: p.id }));
      const { error: e2 } = await supabase.from('rendiciones_pagos').insert(links);
      if (e2) { alert('Error vinculando pagos: ' + e2.message); setGuardando(false); return; }

      await supabase.from('auditoria').insert({
        usuario: yo.nombre, rol: yo.rol, accion: 'rendicion_creada',
        detalle: `Rendición de ${pagosSel.length} pagos por ${fmtMoney(total)}`,
        datos: { rendicion_id: rend.id, total }, prev_hash: '0', hash: '0',
      });

      onSaved();
    } catch (err: any) {
      alert('Error: ' + (err.message || err));
    } finally {
      setGuardando(false);
    }
  }

  const totalSel = pagos.filter((p) => seleccionados.includes(p.id)).reduce((s, p) => s + Number(p.importe), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Nueva rendición</h3>

        <div className="row">
          {yo.rol === 'admin' && (
            <div className="field" style={{ flex: 2 }}>
              <label>Cobrador</label>
              <select value={cobradorId} onChange={(e) => setCobradorId(e.target.value)}>
                {cobradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="field">
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <label>&nbsp;</label>
            <button onClick={buscarPagos} disabled={cargando}>Buscar</button>
          </div>
        </div>

        {pagos.length > 0 && (
          <>
            <div className="banner info">
              {seleccionados.length} de {pagos.length} pagos seleccionados · Total: <strong>{fmtMoney(totalSel)}</strong>
            </div>
            <div style={{ maxHeight: 250, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 4 }}>
              {pagos.map((p) => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={seleccionados.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span style={{ marginLeft: 8, flex: 1, fontSize: 13 }}>
                    {fmtDate(p.fecha_pago)} · {p.medio} · <strong>{fmtMoney(p.importe)}</strong>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {pagos.length === 0 && !cargando && cobradorId && (
          <div className="empty" style={{ padding: '1rem' }}>Hacé clic en Buscar para ver los pagos disponibles</div>
        )}

        <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={guardar} disabled={guardando || seleccionados.length === 0}>
            {guardando ? 'Guardando...' : 'Crear rendición'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetalleRendicionModal({ rendicion, yo, onClose, onChanged }: {
  rendicion: Rendicion;
  yo: Usuario;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = createClient();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [loadingDet, setLoadingDet] = useState(true);
  const [accionando, setAccionando] = useState(false);

  useEffect(() => {
    async function cargar() {
      const { data: links } = await supabase.from('rendiciones_pagos').select('pago_id').eq('rendicion_id', rendicion.id);
      const ids = (links || []).map((l: any) => l.pago_id);
      const [p, s, so] = await Promise.all([
        ids.length > 0 ? supabase.from('pagos').select('*').in('id', ids).order('fecha_pago') : { data: [] },
        supabase.from('sucursales').select('*'),
        supabase.from('socios').select('id, nombre'),
      ]);
      setPagos((p.data || []) as Pago[]);
      setSucursales((s.data || []) as Sucursal[]);
      setSocios((so.data || []) as Socio[]);
      setLoadingDet(false);
    }
    cargar();
  }, [rendicion.id]);

  const sucursalesMap = new Map(sucursales.map((s) => [s.id, s]));
  const sociosMap = new Map(socios.map((s) => [s.id, s]));

  async function aprobar() {
    if (!confirm('¿Aprobar la rendición? Quedará cerrada y no podrá modificarse.')) return;
    setAccionando(true);
    const { error } = await supabase
      .from('rendiciones')
      .update({ estado: 'aprobada', fecha_aprobacion: new Date().toISOString(), aprobada_por: yo.nombre })
      .eq('id', rendicion.id);
    if (error) { alert('Error: ' + error.message); setAccionando(false); return; }
    await supabase.from('auditoria').insert({
      usuario: yo.nombre, rol: yo.rol, accion: 'rendicion_aprobada',
      detalle: `Rendición aprobada por ${yo.nombre}`,
      datos: { rendicion_id: rendicion.id, total: rendicion.total_cerrado },
      prev_hash: '0', hash: '0',
    });
    onChanged();
  }

  async function rechazar() {
    const motivo = prompt('Motivo de rechazo:');
    if (!motivo) return;
    setAccionando(true);
    const { error } = await supabase
      .from('rendiciones')
      .update({ estado: 'rechazada', fecha_rechazo: new Date().toISOString(), rechazada_por: yo.nombre, motivo_rechazo: motivo })
      .eq('id', rendicion.id);
    if (error) { alert('Error: ' + error.message); setAccionando(false); return; }
    await supabase.from('auditoria').insert({
      usuario: yo.nombre, rol: yo.rol, accion: 'rendicion_rechazada',
      detalle: `Rendición rechazada: ${motivo}`,
      datos: { rendicion_id: rendicion.id, motivo },
      prev_hash: '0', hash: '0',
    });
    onChanged();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <h3>Rendición</h3>

        <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 13 }}>
          <div><strong>Cobrador:</strong> {rendicion.cobrador}</div>
          <div><strong>Período:</strong> {fmtDate(rendicion.semana_inicio)} - {fmtDate(rendicion.semana_fin)}</div>
          <div><strong>Total:</strong> {fmtMoney(rendicion.total_cerrado)}</div>
          <div><strong>Estado:</strong> {rendicion.estado}</div>
          <div><strong>Fecha cierre:</strong> {fmtDateTime(rendicion.fecha_cierre)}</div>
          {rendicion.fecha_aprobacion && (
            <div><strong>Aprobada:</strong> {fmtDateTime(rendicion.fecha_aprobacion)} por {rendicion.aprobada_por}</div>
          )}
          {rendicion.fecha_rechazo && (
            <div>
              <strong>Rechazada:</strong> {fmtDateTime(rendicion.fecha_rechazo)} por {rendicion.rechazada_por}
              {rendicion.motivo_rechazo && <div><strong>Motivo:</strong> {rendicion.motivo_rechazo}</div>}
            </div>
          )}
        </div>

        <h4 style={{ marginBottom: 8 }}>Recibos incluidos</h4>
        {loadingDet ? <div className="empty">Cargando...</div> : pagos.length === 0 ? (
          <div className="empty">Sin recibos</div>
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <table>
              <thead>
                <tr><th>Recibo</th><th>Fecha</th><th>Socio</th><th>Importe</th></tr>
              </thead>
              <tbody>
                {pagos.map((p) => {
                  const suc = sucursalesMap.get(p.sucursal_id);
                  const num = suc ? formatNumeroRecibo(suc.codigo, p.numero) : '?';
                  return (
                    <tr key={p.id}>
                      <td className="recibo-num" style={{ fontSize: 12 }}>{num}</td>
                      <td>{fmtDate(p.fecha_pago)}</td>
                      <td>{sociosMap.get(p.socio_id)?.nombre || '-'}</td>
                      <td>{fmtMoney(p.importe)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="actions" style={{ justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap' }}>
          {yo.rol === 'admin' && rendicion.estado === 'cerrada' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="success" onClick={aprobar} disabled={accionando}>✓ Aprobar</button>
              <button className="danger" onClick={rechazar} disabled={accionando}>✗ Rechazar</button>
            </div>
          )}
          <button onClick={onClose} style={{ marginLeft: 'auto' }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
