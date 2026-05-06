'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import type { Sucursal, Usuario } from '@/lib/types';

export default function TalonariosPage() {
  const supabase = createClient();
  const toast = useToast();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cobradores, setCobradores] = useState<Usuario[]>([]);
  const [asignaciones, setAsignaciones] = useState<{ cobrador_id: string; sucursal_id: string }[]>([]);
  const [editingSuc, setEditingSuc] = useState<Sucursal | 'new' | null>(null);
  const [editingCob, setEditingCob] = useState<Usuario | 'new' | null>(null);

  async function cargar() {
    const [s, c, a] = await Promise.all([
      supabase.from('sucursales').select('*').order('codigo'),
      supabase.from('usuarios').select('*').eq('rol', 'cobrador').order('nombre'),
      supabase.from('cobradores_sucursales').select('*'),
    ]);
    setSucursales((s.data || []) as Sucursal[]);
    setCobradores((c.data || []) as Usuario[]);
    setAsignaciones((a.data || []) as any);
  }

  useEffect(() => { cargar(); }, []);

  async function saveSucursal(s: Partial<Sucursal>) {
    if (editingSuc === 'new') {
      const { error } = await supabase.from('sucursales').insert(s as any);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Sucursal creada');
    } else if (editingSuc) {
      const { error } = await supabase.from('sucursales').update(s).eq('id', editingSuc.id);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Sucursal actualizada');
    }
    setEditingSuc(null);
    cargar();
  }

  async function delSucursal(id: string) {
    if (!confirm('¿Eliminar sucursal? Solo si nunca emitió recibos.')) return;
    const { error } = await supabase.from('sucursales').delete().eq('id', id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Sucursal eliminada');
    cargar();
  }

  async function saveCobrador(c: Partial<Usuario>, sucursalIds: string[]) {
    let cobradorId: string;
    if (editingCob === 'new') {
      const { data, error } = await supabase.from('usuarios').insert({ ...c, rol: 'cobrador' }).select().single();
      if (error) { toast.error('Error: ' + error.message); return; }
      cobradorId = data.id;
      toast.success('Cobrador creado');
    } else if (editingCob) {
      const { error } = await supabase.from('usuarios').update(c).eq('id', editingCob.id);
      if (error) { toast.error('Error: ' + error.message); return; }
      cobradorId = editingCob.id;
      await supabase.from('cobradores_sucursales').delete().eq('cobrador_id', cobradorId);
      toast.success('Cobrador actualizado');
    } else return;

    if (sucursalIds.length > 0) {
      const rows = sucursalIds.map((sid) => ({ cobrador_id: cobradorId, sucursal_id: sid }));
      const { error } = await supabase.from('cobradores_sucursales').insert(rows);
      if (error) { toast.error('Error asignando sucursales: ' + error.message); return; }
    }
    setEditingCob(null);
    cargar();
  }

  function getSucursalesDe(cobradorId: string): string[] {
    return asignaciones.filter((a) => a.cobrador_id === cobradorId).map((a) => a.sucursal_id);
  }

  const sucursalesMap = new Map(sucursales.map((s) => [s.id, s]));

  return (
    <div>
      <div className="main-header">
        <h1>Talonarios y cobradores</h1>
        <div className="actions">
          <button onClick={() => setEditingSuc('new')}>+ Sucursal</button>
          <button className="primary" onClick={() => setEditingCob('new')} disabled={sucursales.length === 0}>+ Cobrador</button>
        </div>
      </div>

      <div className="banner info">
        Cada sucursal tiene su propia numeración correlativa de recibos. Asigná las sucursales correspondientes a cada cobrador.
        Cuando creés un cobrador acá, también tenés que crearle un usuario en Supabase Authentication con el mismo email.
      </div>

      <div className="card">
        <h3>Sucursales</h3>
        {sucursales.length === 0 ? <div className="empty">Sin sucursales</div> : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Código</th>
                <th>Nombre</th>
                <th style={{ width: 130 }}>Numeración</th>
                <th style={{ width: 90 }}>Estado</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {sucursales.map((s) => (
                <tr key={s.id}>
                  <td className="recibo-num">{s.codigo}</td>
                  <td>{s.nombre}</td>
                  <td>{s.numero_desde} {s.numero_hasta ? `- ${s.numero_hasta}` : '→'}</td>
                  <td>{s.activa ? <span className="badge active">Activa</span> : <span className="badge inactive">Inactiva</span>}</td>
                  <td>
                    <div className="actions">
                      <button onClick={() => setEditingSuc(s)}>Editar</button>
                      <button className="danger" onClick={() => delSucursal(s.id)}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Cobradores</h3>
        {cobradores.length === 0 ? <div className="empty">Sin cobradores</div> : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Sucursales</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {cobradores.map((c) => {
                const sucs = getSucursalesDe(c.id).map((sid) => sucursalesMap.get(sid)?.codigo).filter(Boolean).join(', ');
                return (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{c.email}</td>
                    <td>{sucs || <span style={{ color: 'var(--text-3)' }}>sin asignar</span>}</td>
                    <td><button onClick={() => setEditingCob(c)}>Editar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editingSuc && (
        <SucursalForm sucursal={editingSuc === 'new' ? null : editingSuc} onClose={() => setEditingSuc(null)} onSave={saveSucursal} />
      )}
      {editingCob && (
        <CobradorForm
          cobrador={editingCob === 'new' ? null : editingCob}
          sucursales={sucursales}
          asignadas={editingCob === 'new' ? [] : getSucursalesDe(editingCob.id)}
          onClose={() => setEditingCob(null)}
          onSave={saveCobrador}
        />
      )}
    </div>
  );
}

function SucursalForm({ sucursal, onClose, onSave }: { sucursal: Sucursal | null; onClose: () => void; onSave: (s: Partial<Sucursal>) => void }) {
  const [data, setData] = useState<Partial<Sucursal>>(
    sucursal || { codigo: '', nombre: '', numero_desde: 1, numero_hasta: null, activa: true }
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.codigo?.trim() || !data.nombre?.trim()) return;
    onSave(data);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{sucursal ? 'Editar sucursal' : 'Nueva sucursal'}</h3>
        <div className="row">
          <div className="field">
            <label>Código *</label>
            <input type="text" maxLength={6} value={data.codigo || ''} onChange={(e) => setData({ ...data, codigo: e.target.value })} placeholder="001" required />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>Nombre *</label>
            <input type="text" value={data.nombre || ''} onChange={(e) => setData({ ...data, nombre: e.target.value })} required />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Numeración desde</label>
            <input type="number" value={data.numero_desde || 1} onChange={(e) => setData({ ...data, numero_desde: parseInt(e.target.value) || 1 })} />
          </div>
          <div className="field">
            <label>Hasta (opcional)</label>
            <input type="number" value={data.numero_hasta || ''} onChange={(e) => setData({ ...data, numero_hasta: e.target.value ? parseInt(e.target.value) : null })} placeholder="sin tope" />
          </div>
        </div>
        <div className="field">
          <label>
            <input type="checkbox" checked={data.activa !== false} onChange={(e) => setData({ ...data, activa: e.target.checked })} />
            {' '}Sucursal activa
          </label>
        </div>
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function CobradorForm({ cobrador, sucursales, asignadas, onClose, onSave }: {
  cobrador: Usuario | null;
  sucursales: Sucursal[];
  asignadas: string[];
  onClose: () => void;
  onSave: (c: Partial<Usuario>, sucursalIds: string[]) => void;
}) {
  const [nombre, setNombre] = useState(cobrador?.nombre || '');
  const [email, setEmail] = useState(cobrador?.email || '');
  const [sucIds, setSucIds] = useState<string[]>(asignadas);

  function toggleSuc(id: string) {
    setSucIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !email.trim()) return;
    onSave({ nombre: nombre.trim(), email: email.trim() }, sucIds);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{cobrador ? 'Editar cobrador' : 'Nuevo cobrador'}</h3>
        <div className="field">
          <label>Nombre *</label>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Email *</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!!cobrador} />
          {!cobrador && (
            <small style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Después tenés que crear este usuario en Supabase Authentication con el mismo email.
            </small>
          )}
        </div>
        <div className="field">
          <label>Sucursales asignadas</label>
          <div style={{ background: 'var(--surface-2)', padding: 8, borderRadius: 'var(--radius)' }}>
            {sucursales.map((s) => (
              <label key={s.id} style={{ display: 'block', padding: '4px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={sucIds.includes(s.id)} onChange={() => toggleSuc(s.id)} />
                {' '}{s.codigo} - {s.nombre}
              </label>
            ))}
          </div>
        </div>
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Guardar</button>
        </div>
      </form>
    </div>
  );
}
