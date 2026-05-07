'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fmtDate, todayISO, normalize } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import type { Socio, TipoCuota, Usuario } from '@/lib/types';

const MOTIVOS_BAJA = ['Renuncia voluntaria', 'Mora prolongada', 'Fallecimiento', 'Traslado', 'Falta de uso', 'Otro'];

export default function SociosPage() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const [socios, setSocios] = useState<Socio[]>([]);
  const [tipos, setTipos] = useState<TipoCuota[]>([]);
  const [cobradores, setCobradores] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'activos' | 'todos' | 'bajas'>('activos');
  const [filtroCobrador, setFiltroCobrador] = useState<string>('');
  const [editing, setEditing] = useState<Socio | 'new' | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [asignarOpen, setAsignarOpen] = useState(false);

  async function cargar() {
    setLoading(true);
    const [s, t, c] = await Promise.all([
      supabase.from('socios').select('*').order('numero'),
      supabase.from('tipos_cuota').select('*').order('nombre'),
      supabase.from('usuarios').select('*').eq('rol', 'cobrador').eq('activo', true).order('nombre'),
    ]);
    setSocios((s.data || []) as Socio[]);
    setTipos((t.data || []) as TipoCuota[]);
    setCobradores((c.data || []) as Usuario[]);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  async function handleSave(s: Partial<Socio>) {
    if (editing === 'new') {
      const max = socios.reduce((m, x) => Math.max(m, x.numero), 0);
      const nuevo = { ...s, numero: max + 1, fecha_alta: s.fecha_alta || todayISO() };
      const { error } = await supabase.from('socios').insert(nuevo as any);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Socio creado');
    } else if (editing) {
      const { error } = await supabase.from('socios').update(s).eq('id', editing.id);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Socio actualizado');
    }
    setEditing(null);
    cargar();
  }

  async function handleBaja(socio: Socio, fecha: string, motivo: string, otro: string) {
    const { error } = await supabase
      .from('socios')
      .update({ fecha_baja: fecha, motivo_baja: motivo, motivo_baja_otro: otro || null })
      .eq('id', socio.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(`${socio.nombre} dado de baja`);
    setEditing(null);
    cargar();
  }

  async function handleReincorporar(socio: Socio) {
    if (!confirm(`¿Reincorporar a ${socio.nombre}?`)) return;
    const { error } = await supabase
      .from('socios')
      .update({ fecha_baja: null, motivo_baja: null, motivo_baja_otro: null })
      .eq('id', socio.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(`${socio.nombre} reincorporado`);
    cargar();
  }

  function toggleSel(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelAll(idsVisibles: string[]) {
    setSeleccionados((prev) => {
      const todasMarcadas = idsVisibles.every((id) => prev.has(id));
      if (todasMarcadas) {
        const next = new Set(prev);
        idsVisibles.forEach((id) => next.delete(id));
        return next;
      } else {
        const next = new Set(prev);
        idsVisibles.forEach((id) => next.add(id));
        return next;
      }
    });
  }

  async function asignarMasivo(cobradorId: string | null) {
    if (seleccionados.size === 0) return;
    const labelCobrador = cobradorId ? cobradoresMap.get(cobradorId) : 'sin cobrador (libre)';
    if (!confirm(`¿Asignar ${seleccionados.size} socios a ${labelCobrador}?`)) return;

    const ids = Array.from(seleccionados);
    const { error } = await supabase
      .from('socios')
      .update({ cobrador_id: cobradorId })
      .in('id', ids);

    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(`${ids.length} socios actualizados`);
    setSeleccionados(new Set());
    setAsignarOpen(false);
    cargar();
  }

  const tiposMap = new Map(tipos.map((t) => [t.id, t.nombre]));
  const cobradoresMap = new Map(cobradores.map((c) => [c.id, c.nombre]));
  const q = normalize(search);
  const filtered = socios.filter((s) => {
    if (filtroEstado === 'activos' && s.fecha_baja) return false;
    if (filtroEstado === 'bajas' && !s.fecha_baja) return false;
    if (filtroCobrador === '__sin__' && s.cobrador_id) return false;
    if (filtroCobrador && filtroCobrador !== '__sin__' && s.cobrador_id !== filtroCobrador) return false;
    if (q) {
      return (
        normalize(s.nombre).includes(q) ||
        String(s.numero).includes(q) ||
        (s.dni && s.dni.includes(q)) ||
        (s.telefono && s.telefono.includes(q))
      );
    }
    return true;
  });

  const idsVisibles = filtered.map((s) => s.id);
  const todasSelVisibles = idsVisibles.length > 0 && idsVisibles.every((id) => seleccionados.has(id));

  return (
    <div>
      <div className="main-header">
        <h1>Socios</h1>
        <button className="primary" onClick={() => setEditing('new')}>+ Nuevo socio</button>
      </div>

      <div className="card">
        <div className="row">
          <div className="field" style={{ flex: 2, minWidth: 200 }}>
            <label>Buscar</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, número, DNI o teléfono..." />
          </div>
          <div className="field" style={{ flex: '0 0 auto', minWidth: 150 }}>
            <label>Cobrador</label>
            <select value={filtroCobrador} onChange={(e) => setFiltroCobrador(e.target.value)}>
              <option value="">Todos</option>
              <option value="__sin__">Sin cobrador (libres)</option>
              {cobradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <label>Estado</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as any)}>
              <option value="activos">Activos</option>
              <option value="todos">Todos</option>
              <option value="bajas">Solo bajas</option>
            </select>
          </div>
        </div>
      </div>

      {seleccionados.size > 0 && (
        <div className="banner info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span><strong>{seleccionados.size}</strong> socios seleccionados</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setAsignarOpen(true)}>Asignar cobrador</button>
            <button onClick={() => setSeleccionados(new Set())}>Limpiar selección</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty">Cargando...</div> : filtered.length === 0 ? (
          <div className="empty">Sin socios</div>
        ) : (
          <>
            <table className="desktop-only">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={todasSelVisibles} onChange={() => toggleSelAll(idsVisibles)} />
                  </th>
                  <th style={{ width: 60 }}>N°</th>
                  <th>Nombre</th>
                  <th style={{ width: 110 }}>DNI</th>
                  <th>Tipo cuota</th>
                  <th>Cobrador</th>
                  <th style={{ width: 90 }}>Estado</th>
                  <th style={{ width: 60 }}>DA</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input type="checkbox" checked={seleccionados.has(s.id)} onChange={() => toggleSel(s.id)} />
                    </td>
                    <td>{s.numero}</td>
                    <td>{s.nombre}</td>
                    <td>{s.dni || '-'}</td>
                    <td>{tiposMap.get(s.tipo_cuota_id || '') || '-'}</td>
                    <td>
                      {s.cobrador_id
                        ? cobradoresMap.get(s.cobrador_id) || <span style={{ color: 'var(--text-3)' }}>?</span>
                        : <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>libre</span>}
                    </td>
                    <td>{s.fecha_baja ? <span className="badge inactive">Baja</span> : <span className="badge active">Activo</span>}</td>
                    <td>{s.debito_automatico && <span className="badge debito">DA</span>}</td>
                    <td>
                      <div className="actions">
                        <button onClick={() => router.push(`/estado-cuenta?socio=${s.id}`)}>Estado</button>
                        <button onClick={() => setEditing(s)}>Editar</button>
                        {s.fecha_baja && <button onClick={() => handleReincorporar(s)}>↻</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mobile-only" style={{ padding: 8 }}>
              {filtered.map((s) => (
                <div key={s.id} className="socio-card">
                  <div className="socio-card-head">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={seleccionados.has(s.id)} onChange={() => toggleSel(s.id)} />
                      <div>
                        <span className="socio-card-num">#{s.numero}</span>{' '}
                        <span className="socio-card-title">{s.nombre}</span>
                      </div>
                    </div>
                    <div>
                      {s.fecha_baja ? <span className="badge inactive">Baja</span> : <span className="badge active">Activo</span>}
                      {s.debito_automatico && <span className="badge debito" style={{ marginLeft: 4 }}>DA</span>}
                    </div>
                  </div>
                  <div className="socio-card-info">
                    {s.dni && <>DNI: {s.dni} · </>}{tiposMap.get(s.tipo_cuota_id || '') || 'Sin tipo'}
                  </div>
                  <div className="socio-card-info">
                    Cobrador: {s.cobrador_id
                      ? <strong>{cobradoresMap.get(s.cobrador_id) || '?'}</strong>
                      : <em style={{ color: 'var(--text-3)' }}>libre</em>}
                  </div>
                  {s.telefono && <div className="socio-card-info">📞 {s.telefono}</div>}
                  <div className="socio-card-actions">
                    <button onClick={() => router.push(`/estado-cuenta?socio=${s.id}`)}>Estado</button>
                    <button onClick={() => setEditing(s)}>Editar</button>
                    {s.fecha_baja && <button onClick={() => handleReincorporar(s)}>Reincorporar</button>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {editing && (
        <SocioForm
          socio={editing === 'new' ? null : editing}
          tipos={tipos}
          cobradores={cobradores}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onBaja={handleBaja}
        />
      )}

      {asignarOpen && (
        <AsignarCobradorModal
          cantidad={seleccionados.size}
          cobradores={cobradores}
          onClose={() => setAsignarOpen(false)}
          onAsignar={asignarMasivo}
        />
      )}
    </div>
  );
}

function AsignarCobradorModal({ cantidad, cobradores, onClose, onAsignar }: {
  cantidad: number;
  cobradores: Usuario[];
  onClose: () => void;
  onAsignar: (cobradorId: string | null) => void;
}) {
  const [seleccionado, setSeleccionado] = useState<string>('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onAsignar(seleccionado === '__sin__' ? null : seleccionado);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Asignar cobrador a {cantidad} socios</h3>
        <div className="field">
          <label>Cobrador</label>
          <select value={seleccionado} onChange={(e) => setSeleccionado(e.target.value)} required autoFocus>
            <option value="" disabled>Elegir...</option>
            <option value="__sin__">— Sin cobrador (libre) —</option>
            {cobradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="banner info">
          Los socios "libres" solo pueden ser cobrados por el administrador (los cobradores no los van a ver).
        </div>
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary" disabled={!seleccionado}>Asignar</button>
        </div>
      </form>
    </div>
  );
}

function SocioForm({ socio, tipos, cobradores, onClose, onSave, onBaja }: {
  socio: Socio | null;
  tipos: TipoCuota[];
  cobradores: Usuario[];
  onClose: () => void;
  onSave: (s: Partial<Socio>) => void;
  onBaja: (s: Socio, fecha: string, motivo: string, otro: string) => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<Partial<Socio>>(
    socio || { nombre: '', dni: '', telefono: '', email: '', tipo_cuota_id: '', cobrador_id: null, fecha_alta: todayISO(), debito_automatico: false }
  );
  const [bajaMode, setBajaMode] = useState(false);
  const [bajaFecha, setBajaFecha] = useState(todayISO());
  const [bajaMotivo, setBajaMotivo] = useState(MOTIVOS_BAJA[0]);
  const [bajaOtro, setBajaOtro] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.nombre?.trim()) { toast.warning('Falta el nombre'); return; }
    onSave({
      ...data,
      tipo_cuota_id: data.tipo_cuota_id || null,
      cobrador_id: data.cobrador_id || null,
    });
  }

  if (bajaMode && socio) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>Dar de baja a {socio.nombre}</h3>
          <div className="field">
            <label>Fecha de baja</label>
            <input type="date" value={bajaFecha} onChange={(e) => setBajaFecha(e.target.value)} />
          </div>
          <div className="field">
            <label>Motivo</label>
            <select value={bajaMotivo} onChange={(e) => setBajaMotivo(e.target.value)}>
              {MOTIVOS_BAJA.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          {bajaMotivo === 'Otro' && (
            <div className="field">
              <label>Especificar motivo</label>
              <input type="text" value={bajaOtro} onChange={(e) => setBajaOtro(e.target.value)} />
            </div>
          )}
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <button onClick={() => setBajaMode(false)}>Cancelar</button>
            <button className="danger" onClick={() => onBaja(socio, bajaFecha, bajaMotivo, bajaOtro)}>Confirmar baja</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{socio ? `Editar socio N° ${socio.numero}` : 'Nuevo socio'}</h3>
        <div className="field">
          <label>Nombre completo *</label>
          <input type="text" value={data.nombre || ''} onChange={(e) => setData({ ...data, nombre: e.target.value })} required />
        </div>
        <div className="row">
          <div className="field">
            <label>DNI</label>
            <input type="text" value={data.dni || ''} onChange={(e) => setData({ ...data, dni: e.target.value })} />
          </div>
          <div className="field">
            <label>Teléfono (con código país)</label>
            <input type="text" value={data.telefono || ''} onChange={(e) => setData({ ...data, telefono: e.target.value })} placeholder="5491145678901" />
          </div>
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={data.email || ''} onChange={(e) => setData({ ...data, email: e.target.value })} />
        </div>
        <div className="row">
          <div className="field">
            <label>Tipo de cuota</label>
            <select value={data.tipo_cuota_id || ''} onChange={(e) => setData({ ...data, tipo_cuota_id: e.target.value })}>
              <option value="">Sin asignar</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Cobrador asignado</label>
            <select value={data.cobrador_id || ''} onChange={(e) => setData({ ...data, cobrador_id: e.target.value || null })}>
              <option value="">— Sin cobrador (libre) —</option>
              {cobradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Fecha de alta *</label>
          <input type="date" value={data.fecha_alta || ''} onChange={(e) => setData({ ...data, fecha_alta: e.target.value })} required />
        </div>
        <div className="field">
          <label>
            <input type="checkbox" checked={data.debito_automatico || false} onChange={(e) => setData({ ...data, debito_automatico: e.target.checked })} />
            {' '}Adherido a débito automático
          </label>
        </div>
        <div className="actions" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          {socio && !socio.fecha_baja && <button type="button" onClick={() => setBajaMode(true)}>Dar de baja</button>}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button type="button" onClick={onClose}>Cancelar</button>
            <button type="submit" className="primary">Guardar</button>
          </div>
        </div>
      </form>
    </div>
  );
}
