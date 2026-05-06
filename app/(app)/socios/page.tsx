'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmtDate, todayISO, normalize } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import type { Socio, TipoCuota } from '@/lib/types';

const MOTIVOS_BAJA = ['Renuncia voluntaria', 'Mora prolongada', 'Fallecimiento', 'Traslado', 'Falta de uso', 'Otro'];

export default function SociosPage() {
  const supabase = createClient();
  const toast = useToast();
  const [socios, setSocios] = useState<Socio[]>([]);
  const [tipos, setTipos] = useState<TipoCuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'activos' | 'todos' | 'bajas'>('activos');
  const [editing, setEditing] = useState<Socio | 'new' | null>(null);

  async function cargar() {
    setLoading(true);
    const [s, t] = await Promise.all([
      supabase.from('socios').select('*').order('numero'),
      supabase.from('tipos_cuota').select('*').order('nombre'),
    ]);
    setSocios((s.data || []) as Socio[]);
    setTipos((t.data || []) as TipoCuota[]);
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

  const tiposMap = new Map(tipos.map((t) => [t.id, t.nombre]));
  const q = normalize(search);
  const filtered = socios.filter((s) => {
    if (filtroEstado === 'activos' && s.fecha_baja) return false;
    if (filtroEstado === 'bajas' && !s.fecha_baja) return false;
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

  return (
    <div>
      <div className="main-header">
        <h1>Socios</h1>
        <button className="primary" onClick={() => setEditing('new')}>+ Nuevo socio</button>
      </div>

      <div className="card">
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Buscar</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, número, DNI o teléfono..." />
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <label>Mostrar</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as any)}>
              <option value="activos">Activos</option>
              <option value="todos">Todos</option>
              <option value="bajas">Solo bajas</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty">Cargando...</div> : filtered.length === 0 ? (
          <div className="empty">Sin socios</div>
        ) : (
          <>
            <table className="desktop-only">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>N°</th>
                  <th>Nombre</th>
                  <th style={{ width: 110 }}>DNI</th>
                  <th>Tipo cuota</th>
                  <th style={{ width: 110 }}>Alta</th>
                  <th style={{ width: 90 }}>Estado</th>
                  <th style={{ width: 60 }}>DA</th>
                  <th style={{ width: 180 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>{s.numero}</td>
                    <td>{s.nombre}</td>
                    <td>{s.dni || '-'}</td>
                    <td>{tiposMap.get(s.tipo_cuota_id || '') || '-'}</td>
                    <td>{fmtDate(s.fecha_alta)}</td>
                    <td>{s.fecha_baja ? <span className="badge inactive">Baja</span> : <span className="badge active">Activo</span>}</td>
                    <td>{s.debito_automatico && <span className="badge debito">DA</span>}</td>
                    <td>
                      <div className="actions">
                        <button onClick={() => setEditing(s)}>Editar</button>
                        {s.fecha_baja && <button onClick={() => handleReincorporar(s)}>Reincorp.</button>}
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
                    <div>
                      <span className="socio-card-num">#{s.numero}</span>{' '}
                      <span className="socio-card-title">{s.nombre}</span>
                    </div>
                    <div>
                      {s.fecha_baja ? <span className="badge inactive">Baja</span> : <span className="badge active">Activo</span>}
                      {s.debito_automatico && <span className="badge debito" style={{ marginLeft: 4 }}>DA</span>}
                    </div>
                  </div>
                  <div className="socio-card-info">
                    {s.dni && <>DNI: {s.dni} · </>}{tiposMap.get(s.tipo_cuota_id || '') || 'Sin tipo'}
                  </div>
                  {s.telefono && <div className="socio-card-info">📞 {s.telefono}</div>}
                  <div className="socio-card-actions">
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
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onBaja={handleBaja}
        />
      )}
    </div>
  );
}

function SocioForm({ socio, tipos, onClose, onSave, onBaja }: {
  socio: Socio | null;
  tipos: TipoCuota[];
  onClose: () => void;
  onSave: (s: Partial<Socio>) => void;
  onBaja: (s: Socio, fecha: string, motivo: string, otro: string) => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<Partial<Socio>>(
    socio || { nombre: '', dni: '', telefono: '', email: '', tipo_cuota_id: '', fecha_alta: todayISO(), debito_automatico: false }
  );
  const [bajaMode, setBajaMode] = useState(false);
  const [bajaFecha, setBajaFecha] = useState(todayISO());
  const [bajaMotivo, setBajaMotivo] = useState(MOTIVOS_BAJA[0]);
  const [bajaOtro, setBajaOtro] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.nombre?.trim()) { toast.warning('Falta el nombre'); return; }
    onSave({ ...data, tipo_cuota_id: data.tipo_cuota_id || null });
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
            <label>Fecha de alta *</label>
            <input type="date" value={data.fecha_alta || ''} onChange={(e) => setData({ ...data, fecha_alta: e.target.value })} required />
          </div>
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
