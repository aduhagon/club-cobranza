'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmtMoney, fmtMesLargo, thisMonth } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import type { TipoCuota, ValorCuota } from '@/lib/types';

export default function CuotasPage() {
  const supabase = createClient();
  const toast = useToast();
  const [tipos, setTipos] = useState<TipoCuota[]>([]);
  const [valores, setValores] = useState<ValorCuota[]>([]);
  const [editingTipo, setEditingTipo] = useState<TipoCuota | 'new' | null>(null);
  const [addingValor, setAddingValor] = useState(false);

  async function cargar() {
    const [t, v] = await Promise.all([
      supabase.from('tipos_cuota').select('*').order('nombre'),
      supabase.from('valores_cuota').select('*').order('desde', { ascending: false }),
    ]);
    setTipos((t.data || []) as TipoCuota[]);
    setValores((v.data || []) as ValorCuota[]);
  }

  useEffect(() => { cargar(); }, []);

  async function saveTipo(t: Partial<TipoCuota>) {
    if (editingTipo === 'new') {
      const { error } = await supabase.from('tipos_cuota').insert(t as any);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Tipo creado');
    } else if (editingTipo) {
      const { error } = await supabase.from('tipos_cuota').update(t).eq('id', editingTipo.id);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Tipo actualizado');
    }
    setEditingTipo(null);
    cargar();
  }

  async function delTipo(id: string) {
    if (!confirm('¿Eliminar este tipo y todos sus valores?')) return;
    const { error } = await supabase.from('tipos_cuota').delete().eq('id', id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Tipo eliminado');
    cargar();
  }

  async function saveValor(tipoId: string, desde: string, importe: number) {
    const { error } = await supabase.from('valores_cuota').insert({ tipo_id: tipoId, desde, importe });
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Valor cargado');
    setAddingValor(false);
    cargar();
  }

  async function delValor(id: string) {
    if (!confirm('¿Eliminar este valor?')) return;
    const { error } = await supabase.from('valores_cuota').delete().eq('id', id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Valor eliminado');
    cargar();
  }

  const tiposMap = new Map(tipos.map((t) => [t.id, t.nombre]));

  return (
    <div>
      <div className="main-header">
        <h1>Cuotas</h1>
        <div className="actions">
          <button onClick={() => setEditingTipo('new')}>+ Tipo</button>
          <button className="primary" onClick={() => setAddingValor(true)} disabled={tipos.length === 0}>+ Cargar valor</button>
        </div>
      </div>

      <div className="banner info">
        Cada tipo de cuota tiene valores con fecha de vigencia. Al devengarse un mes se usa el valor más reciente cuya vigencia sea anterior o igual a ese mes.
      </div>

      <div className="card">
        <h3>Tipos de cuota</h3>
        {tipos.length === 0 ? <div className="empty">Sin tipos de cuota</div> : (
          <table>
            <thead>
              <tr><th>Nombre</th><th>Descripción</th><th style={{ width: 160 }}></th></tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.id}>
                  <td>{t.nombre}</td>
                  <td>{t.descripcion || '-'}</td>
                  <td>
                    <div className="actions">
                      <button onClick={() => setEditingTipo(t)}>Editar</button>
                      <button className="danger" onClick={() => delTipo(t.id)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Valores históricos</h3>
        {valores.length === 0 ? <div className="empty">Sin valores cargados</div> : (
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th style={{ width: 140 }}>Vigente desde</th>
                <th style={{ width: 140 }}>Importe</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {valores.map((v) => (
                <tr key={v.id}>
                  <td>{tiposMap.get(v.tipo_id) || '-'}</td>
                  <td>{fmtMesLargo(v.desde)}</td>
                  <td>{fmtMoney(v.importe)}</td>
                  <td><button className="danger" onClick={() => delValor(v.id)}>Eliminar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingTipo && (
        <TipoForm tipo={editingTipo === 'new' ? null : editingTipo} onClose={() => setEditingTipo(null)} onSave={saveTipo} />
      )}
      {addingValor && (
        <ValorForm tipos={tipos} onClose={() => setAddingValor(false)} onSave={saveValor} />
      )}
    </div>
  );
}

function TipoForm({ tipo, onClose, onSave }: { tipo: TipoCuota | null; onClose: () => void; onSave: (t: Partial<TipoCuota>) => void }) {
  const [nombre, setNombre] = useState(tipo?.nombre || '');
  const [desc, setDesc] = useState(tipo?.descripcion || '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    onSave({ nombre: nombre.trim(), descripcion: desc.trim() || null });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{tipo ? 'Editar tipo de cuota' : 'Nuevo tipo de cuota'}</h3>
        <div className="field">
          <label>Nombre *</label>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Descripción</label>
          <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function ValorForm({ tipos, onClose, onSave }: { tipos: TipoCuota[]; onClose: () => void; onSave: (tipoId: string, desde: string, importe: number) => void }) {
  const [tipoId, setTipoId] = useState(tipos[0]?.id || '');
  const [desde, setDesde] = useState(thisMonth());
  const [importe, setImporte] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const i = parseFloat(importe);
    if (!tipoId || !desde || !i || i <= 0) return;
    onSave(tipoId, desde, i);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Cargar valor</h3>
        <div className="field">
          <label>Tipo de cuota</label>
          <select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div className="row">
          <div className="field">
            <label>Vigente desde (mes)</label>
            <input type="month" value={desde} onChange={(e) => setDesde(e.target.value)} required />
          </div>
          <div className="field">
            <label>Importe</label>
            <input type="number" step="0.01" value={importe} onChange={(e) => setImporte(e.target.value)} required />
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
