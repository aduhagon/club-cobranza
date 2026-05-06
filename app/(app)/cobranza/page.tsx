'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmtMoney, fmtMesLargo, todayISO, formatNumeroRecibo, simpleHash } from '@/lib/utils';
import { descargarReciboPDF } from '@/lib/recibo-pdf';
import ReciboVisual from '@/components/ReciboVisual';
import SocioSearchInput from '@/components/SocioSearchInput';
import { useToast } from '@/components/Toast';
import type { Socio, Sucursal, TipoCuota, Devengamiento, ValorCuota, Pago, Club } from '@/lib/types';

const MEDIOS_PAGO = ['Efectivo', 'Transferencia', 'MercadoPago', 'Débito automático', 'Tarjeta de débito', 'Tarjeta de crédito', 'Cheque'];

interface CobranzaData {
  socios: Socio[];
  sucursales: Sucursal[];
  tipos: TipoCuota[];
  valores: ValorCuota[];
  club: Club | null;
  miNombre: string;
  miId: string;
  miRol: string;
}

interface ReciboGenerado {
  pago: Pago;
  sucursal: Sucursal;
  socio: Socio;
  periodos: string[];
  tipoCuotaNombre?: string;
}

export default function CobranzaPage() {
  const supabase = createClient();
  const toast = useToast();
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
    let sociosQuery = supabase.from('socios').select('*').is('fecha_baja', null).order('numero');

    if (yo.rol === 'cobrador') {
      const { data: asig } = await supabase.from('cobradores_sucursales').select('sucursal_id').eq('cobrador_id', yo.id);
      const ids = (asig || []).map((a: any) => a.sucursal_id);
      if (ids.length === 0) {
        setData({ socios: [], sucursales: [], tipos: [], valores: [], club: null, miNombre: yo.nombre, miId: yo.id, miRol: yo.rol });
        return;
      }
      sucursalesQuery = sucursalesQuery.in('id', ids);

      // Cobrador SOLO ve sus socios asignados
      sociosQuery = sociosQuery.eq('cobrador_id', yo.id);
    }

    const [s, sucRes, t, v, c] = await Promise.all([
      sociosQuery,
      sucursalesQuery,
      supabase.from('tipos_cuota').select('*'),
      supabase.from('valores_cuota').select('*'),
      supabase.from('clubes').select('*').limit(1).maybeSingle(),
    ]);

    setData({
      socios: (s.data || []) as Socio[],
      sucursales: (sucRes.data || []) as Sucursal[],
      tipos: (t.data || []) as TipoCuota[],
      valores: (v.data || []) as ValorCuota[],
      club: (c.data || null) as Club | null,
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

  function toggleAll() {
    if (seleccionadas.length === deudas.length) setSeleccionadas([]);
    else setSeleccionadas(deudas.map((d) => d.id));
  }

  async function generarDeudaSiNoTiene() {
    if (!data || !socioId) return;
    const socio = data.socios.find((s) => s.id === socioId);
    if (!socio || !socio.tipo_cuota_id) {
      toast.warning('El socio no tiene tipo de cuota asignado');
      return;
    }
    const mes = new Date().toISOString().slice(0, 7);

    const { data: existing } = await supabase
      .from('devengamientos').select('id')
      .eq('socio_id', socioId).eq('tipo_id', socio.tipo_cuota_id).eq('periodo', mes);
    if (existing && existing.length > 0) {
      toast.info('Ya existe un devengamiento para este mes. Recargá la página.');
      return;
    }

    const valoresOrden = data.valores
      .filter((v) => v.tipo_id === socio.tipo_cuota_id && v.desde <= mes)
      .sort((a, b) => b.desde.localeCompare(a.desde));
    const v = valoresOrden[0];
    if (!v) {
      const tipoNombre = data.tipos.find(t => t.id === socio.tipo_cuota_id)?.nombre || 'el tipo asignado';
      toast.error(`No hay valor de cuota cargado para ${tipoNombre} en ${mes}`);
      return;
    }

    const { error } = await supabase.from('devengamientos').insert({
      socio_id: socioId, tipo_id: socio.tipo_cuota_id, periodo: mes,
      importe: v.importe, estado: 'pendiente', origen: 'cobranza',
    });
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Cuota del mes generada');
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
        toast.error('El talonario de esta sucursal está agotado');
        setCobrando(false);
        return;
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
      if (ePago) { toast.error('Error: ' + ePago.message); setCobrando(false); return; }

      const links = seleccionadas.map((dId) => ({ pago_id: pago.id, devengamiento_id: dId }));
      await supabase.from('pagos_devengamientos').insert(links);
      await supabase.from('devengamientos').update({ estado: 'pagado', pago_id: pago.id }).in('id', seleccionadas);

      const periodos = deudas.filter((d) => seleccionadas.includes(d.id)).map((d) => d.periodo);
      const tipoIds = deudas.filter((d) => seleccionadas.includes(d.id)).map((d) => d.tipo_id);
      const tipoNombre = data.tipos.find((t) => tipoIds.includes(t.id))?.nombre;

      await supabase.from('auditoria').insert({
        usuario: data.miNombre, rol: data.miRol, accion: 'cobro_emitido',
        detalle: `Recibo ${formatNumeroRecibo(sucursal.codigo, nuevoNum)} por ${fmtMoney(importe)}`,
        datos: { pago_id: pago.id, importe, sucursal: sucursal.codigo, numero: nuevoNum },
        prev_hash: '0', hash: hash,
      });

      const socioActual = data.socios.find((s) => s.id === socioId)!;
      setRecibo({ pago: pago as Pago, sucursal, socio: socioActual, periodos, tipoCuotaNombre: tipoNombre });
      toast.success(`Recibo ${formatNumeroRecibo(sucursal.codigo, nuevoNum)} emitido`);
      setSocioId(''); setDeudas([]); setSeleccionadas([]);
    } catch (err: any) {
      toast.error('Error inesperado: ' + (err.message || err));
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

  if (data.miRol === 'cobrador' && data.socios.length === 0) {
    return (
      <div>
        <h1>Cobrar</h1>
        <div className="banner warning">
          No tenés socios asignados todavía. Pedile al administrador que te asigne socios desde la pantalla de Socios.
        </div>
      </div>
    );
  }

  const socio = data.socios.find((s) => s.id === socioId);
  const importeSel = deudas.filter((d) => seleccionadas.includes(d.id)).reduce((s, d) => s + Number(d.importe), 0);
  const todasSeleccionadas = deudas.length > 0 && seleccionadas.length === deudas.length;

  return (
    <div>
      <div className="main-header"><h1>Cobrar</h1></div>

      {recibo && data.club && (
        <ReciboGeneradoModal recibo={recibo} club={data.club} onClose={() => setRecibo(null)} />
      )}

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Sucursal (talonario)</label>
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              {data.sucursales.map((s) => <option key={s.id} value={s.id}>{s.codigo} - {s.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Socio</label>
          <SocioSearchInput
            socios={data.socios}
            selectedId={socioId}
            onSelect={(id) => { setSocioId(id); cargarDeudas(id); }}
          />
        </div>

        {socio && deudas.length === 0 && (
          <div className="banner warning" style={{ marginTop: 12 }}>
            <strong>{socio.nombre}</strong> no tiene cuotas pendientes registradas.
            {socio.tipo_cuota_id && (
              <> <button onClick={generarDeudaSiNoTiene} style={{ marginLeft: 8 }}>Generar cuota del mes actual</button></>
            )}
          </div>
        )}

        {socio && deudas.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
              <h3 style={{ marginBottom: 0 }}>Cuotas pendientes</h3>
              <button onClick={toggleAll} style={{ fontSize: 12, padding: '4px 10px' }}>
                {todasSeleccionadas ? 'Deseleccionar todas' : 'Seleccionar todas'}
              </button>
            </div>
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

function ReciboGeneradoModal({ recibo, club, onClose }: { recibo: ReciboGenerado; club: Club; onClose: () => void }) {
  const toast = useToast();
  const [descargando, setDescargando] = useState(false);

  async function descargarPDF() {
    setDescargando(true);
    try {
      await descargarReciboPDF({
        pago: recibo.pago, sucursal: recibo.sucursal, socio: recibo.socio, club,
        periodos: recibo.periodos, tipoCuotaNombre: recibo.tipoCuotaNombre,
      });
      toast.success('PDF descargado');
    } catch (err: any) {
      toast.error('Error generando PDF: ' + (err.message || err));
    } finally {
      setDescargando(false);
    }
  }

  function enviarWhatsapp() {
    const numRecibo = formatNumeroRecibo(recibo.sucursal.codigo, recibo.pago.numero);
    const periodosFmt = recibo.periodos.map(fmtMesLargo).join(', ');
    const texto =
      `*${club.nombre}*\n` +
      `*RECIBO N° ${numRecibo}*\n\n` +
      `Socio: ${recibo.socio.nombre}\n` +
      `Socio N°: ${recibo.socio.numero}\n` +
      (recibo.tipoCuotaNombre ? `Concepto: ${recibo.tipoCuotaNombre}\n` : '') +
      (periodosFmt ? `Período: ${periodosFmt}\n` : '') +
      `Medio de pago: ${recibo.pago.medio}\n` +
      `*TOTAL: ${fmtMoney(recibo.pago.importe)}*\n\n` +
      `_Documento no válido como factura_`;
    const tel = (recibo.socio.telefono || '').replace(/[^0-9]/g, '');
    const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="banner success">Recibo emitido correctamente</div>
        <ReciboVisual
          pago={recibo.pago} sucursal={recibo.sucursal} socio={recibo.socio} club={club}
          periodos={recibo.periodos} tipoCuotaNombre={recibo.tipoCuotaNombre}
        />
        <div className="actions" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button onClick={descargarPDF} disabled={descargando}>{descargando ? 'Generando...' : '📄 Descargar PDF'}</button>
          <button onClick={enviarWhatsapp}>WhatsApp</button>
          <button className="primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}
