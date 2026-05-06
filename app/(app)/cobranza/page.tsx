'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmtMoney, fmtMesLargo, todayISO, formatNumeroRecibo, simpleHash } from '@/lib/utils';
import type { Socio, Sucursal, TipoCuota, Devengamiento, ValorCuota } from '@/lib/types';

const MEDIOS_PAGO = ['Efectivo', 'Transferencia', 'MercadoPago', 'Débito automático', 'Tarjeta de débito', 'Tarjeta de crédito', 'Cheque'];

interface CobranzaData {
  socios: Socio[];
  sucursales: Sucursal[];
  tipos: TipoCuota[];
  valores: ValorCuota[];
  miNombre: string;
  miId: string;
  miRol: string;
}

interface ReciboGenerado {
  numero: number;
  codigo: string;
  importe: number;
  periodos: string[];
  telefonoSocio: string;
}

export default function CobranzaPage() {
  const supabase = createClient();
  const [data, setData] = useState<CobranzaData | null>(null);
  const [socioId, setSocioId] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [deudas, setDeudas] = useState<Devengamiento[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [fecha, setFecha] = useState(todayISO());
  const [medio, setMedio] = useState('Efectivo');
  const [cobrando, setCobrando] = useState(false);
  const [recibo, setRecibo] = useState<ReciboGenerado | null>(null);

  useEffect(() => { cargarInicial(); }, []);

  async function cargarInicial() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: yo } = await supabase.from('usuarios').select('*').eq('auth_id', user.id).single();
    if (!yo) return;

    let sucursalesQuery = supabase.from('sucursales').select('*').eq('activa', true).order('codigo');
    if (yo.rol === 'cobrador') {
      const { data: asig } = await supabase.from('cobradores_sucursales').select('sucursal_id').eq('cobrador_id', yo.id);
      const ids = (asig || []).map((a: any) => a.sucursal_id);
      if (ids.length === 0) {
        setData({ socios: [], sucursales: [], tipos: [], valores: [], miNombre: yo.nombre, miId: yo.id, miRol: yo.rol });
        return;
      }
      sucursalesQuery = sucursalesQuery.in('id', ids);
    }

    const [s, sucRes, t, v] = await Promise.all([
      supabase.from('socios').select('*').is('fecha_baja', null).order('numero'),
      sucursalesQuery,
      supabase.from('tipos_cuota').select('*'),
      supabase.from('valores_cuota').select('*'),
    ]);

    setData({
      socios: (s.data || []) as Socio[],
      sucursales: (sucRes.data || []) as Sucursal[],
      tipos: (t.data || []) as TipoCuota[],
      valores: (v.data || []) as ValorCuota[],
      miNombre: yo.nombre, miId: yo.id, miRol: yo.rol,
    });

    if ((sucRes.data || []).length > 0) setSucursalId(sucRes.data![0].id);
  }

  async function cargarDeudas(sId: string) {
    if (!sId) { setDeudas([]); setSeleccionadas([]); return; }
    const { data: ds } = await supabase
      .from('devengamientos').select('*').eq('socio_id', sId).eq('estado', 'pendiente').order('periodo');
    const lista = (ds || []) as Devengamiento[];
    setDeudas(lista);
    setSeleccionadas(lista.map((d) => d.id));

    if (data) {
      const socio = data.socios.find((s) => s.id === sId);
      setMedio(socio?.debito_automatico ? 'Débito automático' : 'Efectivo');
    }
  }

  function toggle(id: string) {
    setSeleccionadas((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function generarDeudaSiNoTiene() {
    if (!data || !socioId) return;
    const socio = data.socios.find((s) => s.id === socioId);
    if (!socio || !socio.tipo_cuota_id) { alert('El socio no tiene tipo de cuota asignado'); return; }
    const mes = new Date().toISOString().slice(0, 7);

    const { data: existing } = await supabase
      .from('devengamientos').select('id')
      .eq('socio_id', socioId).eq('tipo_id', socio.tipo_cuota_id).eq('periodo', mes);
    if (existing && existing.length > 0) {
      alert('Ya existe un devengamiento para este mes. Recargá la página.');
      return;
    }

    const valoresOrden = data.valores
      .filter((v) => v.tipo_id === socio.tipo_cuota_id && v.desde <= mes)
      .sort((a, b) => b.desde.localeCompare(a.desde));
    const v = valoresOrden[0];
    if (!v) {
      const tipoNombre = data.tipos.find(t => t.id === socio.tipo_cuota_id)?.nombre || 'el tipo asignado';
      alert(`No hay valor de cuota cargado para ${tipoNombre} en ${mes}. Cargalo en la solapa Cuotas.`);
      return;
    }

    const { error } = await supabase.from('devengamientos').insert({
      socio_id: socioId, tipo_id: socio.tipo_cuota_id, periodo: mes,
      importe: v.importe, estado: 'pendiente', origen: 'cobranza',
    });
    if (error) { alert('Error: ' + error.message); return; }
    cargarDeudas(socioId);
  }

  async function cobrar() {
    if (!data || !socioId || !sucursalId || seleccionadas.length === 0) return;
    setCobrando(true);

    try {
      const importe = deudas.filter((d) => seleccionadas.includes(d.id)).reduce((s, d) => s + Number(d.importe), 0);

      const { data: ultimosNumeros } = await supabase
        .from('pagos').select('numero').eq('sucursal_id', sucursalId)
        .order('numero', { ascending: false }).limit(1);
      const sucursal = data.sucursales.find((s) => s.id === sucursalId)!;
      const ultimoNum = ultimosNumeros && ultimosNumeros.length > 0 ? ultimosNumeros[0].numero : (sucursal.numero_desde - 1);
      const nuevoNum = ultimoNum + 1;

      if (sucursal.numero_hasta && nuevoNum > sucursal.numero_hasta) {
        alert('El talonario de esta sucursal está agotado'); setCobrando(false); return;
      }

      const { data: ultimoPago } = await supabase
        .from('pagos').select('hash').order('fecha_emision', { ascending: false }).limit(1);
      const prevHash = ultimoPago && ultimoPago.length > 0 ? (ultimoPago[0].hash || '0') : '0';

      const pagoBase = {
        sucursal_id: sucursalId, numero: nuevoNum, socio_id: socioId,
        fecha_pago: fecha, medio, importe,
        cobrador: data.miNombre, cobrador_id: data.miId, prev_hash: prevHash,
      };
      const hash = simpleHash(JSON.stringify(pagoBase));

      const { data: pago, error: ePago } = await supabase
        .from('pagos').insert({ ...pagoBase, hash }).select().single();
      if (ePago) { alert('Error: ' + ePago.message); setCobrando(false); return; }

      const links = seleccionadas.map((dId) => ({ pago_id: pago.id, devengamiento_id: dId }));
      await supabase.from('pagos_devengamientos').insert(links);
      await supabase.from('devengamientos').update({ estado: 'pagado', pago_id: pago.id }).in('id', seleccionadas);

      const periodos = deudas.filter((d) => seleccionadas.includes(d.id)).map((d) => d.periodo);

      await supabase.from('auditoria').insert({
        usuario: data.miNombre, rol: data.miRol, accion: 'cobro_emitido',
        detalle: `Recibo ${formatNumeroRecibo(sucursal.codigo, nuevoNum)} por ${fmtMoney(importe)}`,
        datos: { pago_id: pago.id, importe, sucursal: sucursal.codigo, numero: nuevoNum },
        prev_hash: '0', hash: hash,
      });

      const socioActual = data.socios.find((s) => s.id === socioId);
      setRecibo({
        numero: nuevoNum, codigo: sucursal.codigo, importe, periodos,
        telefonoSocio: socioActual?.telefono || '',
      });
      setSocioId(''); setDeudas([]); setSeleccionadas([]);
    } catch (err: any) {
      alert('Error inesperado: ' + (err.message || err));
    } finally { setCobrando(false); }
  }

  if (!data) return <div className="empty">Cargando...</div>;
  if (data.sucursales.length === 0) {
    return (
      <div>
        <h1>Cobrar</h1>
        <div className="banner warning">No hay sucursales activas. Agregá una en Talonarios.</div>
      </div>
    );
  }

  const socio = data.socios.find((s) => s.id === socioId);
  const importeSel = deudas.filter((d) => seleccionadas.includes(d.id)).reduce((s, d) => s + Number(d.importe), 0);

  return (
    <div>
      <div className="main-header"><h1>Cobrar</h1></div>

      {recibo && <ReciboModal recibo={recibo} onClose={() => setRecibo(null)} />}

      <div className="card">
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Sucursal (talonario)</label>
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              {data.sucursales.map((s) => <option key={s.id} value={s.id}>{s.codigo} - {s.nombre}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>Socio</label>
            <select value={socioId} onChange={(e) => { setSocioId(e.target.value); cargarDeudas(e.target.value); }}>
              <option value="">Seleccionar socio...</option>
              {data.socios.map((s) => (
                <option key={s.id} value={s.id}>{s.numero} - {s.nombre}{s.debito_automatico ? ' [DA]' : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {socio && deudas.length === 0 && (
          <div className="banner warning" style={{ marginTop: 12 }}>
            {socio.nombre} no tiene cuotas pendientes registradas.
            {socio.tipo_cuota_id && (
              <> <button onClick={generarDeudaSiNoTiene} style={{ marginLeft: 8 }}>Generar cuota del mes actual</button></>
            )}
          </div>
        )}

        {socio && deudas.length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>Cuotas pendientes</h3>
            <div style={{ background: 'var(--surface-2)', padding: 8, borderRadius: 'var(--radius)', marginBottom: 12 }}>
              {deudas.map((d) => {
                const tipo = data.tipos.find((t) => t.id === d.tipo_id);
                return (
                  <label key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface)', borderRadius: 'var(--radius)', marginBottom: 4, cursor: 'pointer' }}>
                    <span>
                      <input type="checkbox" checked={seleccionadas.includes(d.id)} onChange={() => toggle(d.id)} />
                      {' '}{fmtMesLargo(d.periodo)} · {tipo?.nombre || '-'}
                    </span>
                    <strong>{fmtMoney(d.importe)}</strong>
                  </label>
                );
              })}
            </div>

            <div className="banner info">Total a cobrar: <strong>{fmtMoney(importeSel)}</strong></div>

            <div className="row">
              <div className="field">
                <label>Fecha de pago</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="field">
                <label>Medio de pago</label>
                <select value={medio} onChange={(e) => setMedio(e.target.value)}>
                  {MEDIOS_PAGO.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: '0 0 auto' }}>
                <label>&nbsp;</label>
                <button className="primary" onClick={cobrar} disabled={cobrando || seleccionadas.length === 0}>
                  {cobrando ? 'Procesando...' : 'Cobrar y emitir recibo'}
                </button>
              </div>
            </div>
            <small style={{ color: 'var(--text-3)' }}>El recibo se emitirá a nombre del cobrador <strong>{data.miNombre}</strong></small>
          </>
        )}
      </div>
    </div>
  );
}

function ReciboModal({ recibo, onClose }: { recibo: ReciboGenerado; onClose: () => void }) {
  const numeroFmt = formatNumeroRecibo(recibo.codigo, recibo.numero);

  function enviarWhatsapp() {
    const periodosFmt = recibo.periodos.map((p) => fmtMesLargo(p)).join(', ');
    const texto = `*Recibo emitido*\n\nNúmero: ${numeroFmt}\nPeríodo(s): ${periodosFmt}\nImporte: ${fmtMoney(recibo.importe)}\n\n¡Gracias!`;
    const tel = recibo.telefonoSocio.replace(/[^0-9]/g, '');
    const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="banner success">Recibo emitido correctamente</div>
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Número de recibo</div>
          <div className="recibo-num" style={{ fontSize: 24, fontWeight: 500 }}>{numeroFmt}</div>
          <div style={{ fontSize: 28, fontWeight: 500, marginTop: 12 }}>{fmtMoney(recibo.importe)}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{recibo.periodos.length} cuota(s) pagada(s)</div>
        </div>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button onClick={enviarWhatsapp}>Enviar por WhatsApp</button>
          <button className="primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}
