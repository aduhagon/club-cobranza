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

// Calcula el siguiente mes a partir de un período "YYYY-MM"
function siguienteMes(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
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

  // Estado del bloque de pago adelantado
  const [adelantadoActivo, setAdelantadoActivo] = useState(false);
  const [cantAdelantadas, setCantAdelantadas] = useState<number>(6);
  const [desdeAdelantado, setDesdeAdelantado] = useState<string>('');
  const [importeAdelantadoEditable, setImporteAdelantadoEditable] = useState<string>('');
  const [importeAdelantadoEditado, setImporteAdelantadoEditado] = useState(false);

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
    if (!sId) {
      setDeudas([]);
      setSeleccionadas([]);
      setAdelantadoActivo(false);
      return;
    }

    const { data: ds } = await supabase
      .from('devengamientos').select('*').eq('socio_id', sId).order('periodo');
    const todos = (ds || []) as Devengamiento[];
    const pendientes = todos.filter((d) => d.estado === 'pendiente');

    setDeudas(pendientes);
    setSeleccionadas(pendientes.map((d) => d.id));

    // Calcular el "siguiente mes" después del último devengamiento que ya tenga (sea o no pagado)
    const ultimoPeriodo = todos.length > 0
      ? todos.map((d) => d.periodo).sort().reverse()[0]
      : todayISO().slice(0, 7);
    setDesdeAdelantado(siguienteMes(ultimoPeriodo));

    setAdelantadoActivo(false);
    setImporteAdelantadoEditado(false);

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

  // ===== PAGO ADELANTADO =====
  function valorVigenteParaSocio(socio: Socio, periodo: string): number | null {
    if (!data || !socio.tipo_cuota_id) return null;
    const valoresOrden = data.valores
      .filter((v) => v.tipo_id === socio.tipo_cuota_id && v.desde <= periodo)
      .sort((a, b) => b.desde.localeCompare(a.desde));
    return valoresOrden[0] ? Number(valoresOrden[0].importe) : null;
  }

  function periodosAdelantados(): string[] {
    const lista: string[] = [];
    let actual = desdeAdelantado;
    for (let i = 0; i < cantAdelantadas; i++) {
      lista.push(actual);
      actual = siguienteMes(actual);
    }
    return lista;
  }

  const socio = data?.socios.find((s) => s.id === socioId) || null;

  // Importe sugerido para el bloque adelantado
  const periodosAdel = adelantadoActivo && socio ? periodosAdelantados() : [];
  const importeSugeridoAdel = adelantadoActivo && socio
    ? periodosAdel.reduce((sum, p) => sum + (valorVigenteParaSocio(socio, p) || 0), 0)
    : 0;

  const importeAdelFinal = adelantadoActivo
    ? (importeAdelantadoEditado ? (parseFloat(importeAdelantadoEditable) || 0) : importeSugeridoAdel)
    : 0;

  const importeDeudas = deudas.filter((d) => seleccionadas.includes(d.id)).reduce((s, d) => s + Number(d.importe), 0);
  const importeTotal = importeDeudas + importeAdelFinal;

  function activarAdelantado() {
    if (!socio) return;
    if (!socio.tipo_cuota_id) {
      toast.warning('El socio no tiene tipo de cuota asignado, no se puede calcular el adelantado');
      return;
    }
    // Verificar que se pueda calcular el primer período
    const primerValor = valorVigenteParaSocio(socio, desdeAdelantado);
    if (primerValor === null) {
      toast.error(`No hay valor de cuota cargado para ${fmtMesLargo(desdeAdelantado)}. Cargalo en Cuotas.`);
      return;
    }
    setAdelantadoActivo(true);
    setImporteAdelantadoEditado(false);
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

    const v = valorVigenteParaSocio(socio, mes);
    if (v === null) {
      const tipoNombre = data.tipos.find(t => t.id === socio.tipo_cuota_id)?.nombre || 'el tipo asignado';
      toast.error(`No hay valor de cuota cargado para ${tipoNombre} en ${mes}`);
      return;
    }

    const { error } = await supabase.from('devengamientos').insert({
      socio_id: socioId, tipo_id: socio.tipo_cuota_id, periodo: mes,
      importe: v, estado: 'pendiente', origen: 'cobranza',
    });
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Cuota del mes generada');
    cargarDeudas(socioId);
  }

  async function cobrar() {
    if (!data || !socioId || !sucursalId) return;
    if (seleccionadas.length === 0 && !adelantadoActivo) return;
    if (!socio) return;

    setCobrando(true);

    try {
      let importeFinal = importeDeudas;
      let devengamientosNuevos: Array<{ id: string; periodo: string; tipo_id: string; importe: number }> = [];

      // 1. Si hay pago adelantado, generamos los devengamientos nuevos primero
      if (adelantadoActivo && socio.tipo_cuota_id) {
        // Validar que ningún período del adelantado ya exista
        const periodos = periodosAdelantados();
        const { data: existentes } = await supabase
          .from('devengamientos').select('periodo')
          .eq('socio_id', socioId).in('periodo', periodos);

        if (existentes && existentes.length > 0) {
          const conflictos = (existentes || []).map((e: any) => fmtMesLargo(e.periodo)).join(', ');
          toast.error(`Estos meses ya tienen devengamiento existente: ${conflictos}. Ajustá el "desde" del adelantado.`);
          setCobrando(false);
          return;
        }

        // Crear devengamientos para cada período adelantado
        const filas = periodos.map((p) => {
          const valor = valorVigenteParaSocio(socio, p) || 0;
          return {
            socio_id: socioId,
            tipo_id: socio.tipo_cuota_id,
            periodo: p,
            importe: valor,
            estado: 'pendiente',
            origen: 'pago_adelantado',
          };
        });

        const { data: insertados, error } = await supabase
          .from('devengamientos').insert(filas).select();

        if (error) {
          toast.error('Error generando devengamientos adelantados: ' + error.message);
          setCobrando(false);
          return;
        }

        devengamientosNuevos = (insertados || []).map((d: any) => ({
          id: d.id, periodo: d.periodo, tipo_id: d.tipo_id, importe: Number(d.importe),
        }));

        // El importe del adelantado es lo que el admin/cobrador definió (puede estar editado)
        // Nota: usamos el importe final, pero los devengamientos quedan con el valor calculado
        // Si el admin editó (ej: redondeó), la diferencia queda como "no facturada"; el admin debería ajustar valores
        importeFinal += importeAdelFinal;
      }

      // 2. Numerar el recibo
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

      // 3. Crear el pago
      const pagoBase = {
        sucursal_id: sucursalId, numero: nuevoNum, socio_id: socioId,
        fecha_pago: fecha, medio, importe: importeFinal,
        cobrador: data.miNombre, cobrador_id: data.miId, prev_hash: prevHash,
      };
      const hash = simpleHash(JSON.stringify(pagoBase));

      const { data: pago, error: ePago } = await supabase
        .from('pagos').insert({ ...pagoBase, hash }).select().single();
      if (ePago) {
        toast.error('Error: ' + ePago.message);
        setCobrando(false);
        return;
      }

      // 4. Vincular devengamientos: las deudas seleccionadas + los nuevos adelantados
      const idsAVincular = [...seleccionadas, ...devengamientosNuevos.map((d) => d.id)];
      if (idsAVincular.length > 0) {
        const links = idsAVincular.map((dId) => ({ pago_id: pago.id, devengamiento_id: dId }));
        await supabase.from('pagos_devengamientos').insert(links);
        await supabase.from('devengamientos')
          .update({ estado: 'pagado', pago_id: pago.id })
          .in('id', idsAVincular);
      }

      // 5. Armar la lista de períodos para el recibo
      const periodosPagados = [
        ...deudas.filter((d) => seleccionadas.includes(d.id)).map((d) => d.periodo),
        ...devengamientosNuevos.map((d) => d.periodo),
      ].sort();

      const tipoIds = [
        ...deudas.filter((d) => seleccionadas.includes(d.id)).map((d) => d.tipo_id),
        ...devengamientosNuevos.map((d) => d.tipo_id),
      ];
      const tipoNombre = data.tipos.find((t) => tipoIds.includes(t.id))?.nombre;

      // 6. Auditoría
      const detalleAudit = adelantadoActivo
        ? `Recibo ${formatNumeroRecibo(sucursal.codigo, nuevoNum)} con adelantado de ${cantAdelantadas} meses por ${fmtMoney(importeFinal)}`
        : `Recibo ${formatNumeroRecibo(sucursal.codigo, nuevoNum)} por ${fmtMoney(importeFinal)}`;
      await supabase.from('auditoria').insert({
        usuario: data.miNombre, rol: data.miRol,
        accion: adelantadoActivo ? 'cobro_con_adelantado' : 'cobro_emitido',
        detalle: detalleAudit,
        datos: {
          pago_id: pago.id, importe: importeFinal,
          sucursal: sucursal.codigo, numero: nuevoNum,
          adelantado: adelantadoActivo ? { meses: cantAdelantadas, periodos: periodosAdel } : null,
        },
        prev_hash: '0', hash: hash,
      });

      // 7. Mostrar el recibo
      setRecibo({
        pago: pago as Pago,
        sucursal,
        socio,
        periodos: periodosPagados,
        tipoCuotaNombre: tipoNombre,
      });

      toast.success(`Recibo ${formatNumeroRecibo(sucursal.codigo, nuevoNum)} emitido`);
      setSocioId('');
      setDeudas([]);
      setSeleccionadas([]);
      setAdelantadoActivo(false);
    } catch (err: any) {
      toast.error('Error inesperado: ' + (err.message || err));
    } finally {
      setCobrando(false);
    }
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

  const todasSeleccionadas = deudas.length > 0 && seleccionadas.length === deudas.length;
  const puedeAdelantar = !!socio && !!socio.tipo_cuota_id;

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

        {socio && deudas.length === 0 && !adelantadoActivo && (
          <div className="banner warning" style={{ marginTop: 12 }}>
            <strong>{socio.nombre}</strong> no tiene cuotas pendientes registradas.
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {socio.tipo_cuota_id && (
                <button onClick={generarDeudaSiNoTiene}>Generar cuota del mes actual</button>
              )}
              {puedeAdelantar && (
                <button onClick={activarAdelantado}>Cobrar cuotas adelantadas</button>
              )}
            </div>
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
          </>
        )}

        {/* === BLOQUE PAGO ADELANTADO === */}
        {socio && puedeAdelantar && !adelantadoActivo && deudas.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button onClick={activarAdelantado}>+ Sumar cuotas adelantadas a este pago</button>
          </div>
        )}

        {socio && adelantadoActivo && (
          <div style={{ background: 'var(--primary-bg)', padding: 12, borderRadius: 'var(--radius)', marginBottom: 12, border: '1px solid var(--primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ marginBottom: 0, color: 'var(--primary)' }}>Cuotas adelantadas</h3>
              <button onClick={() => setAdelantadoActivo(false)} style={{ fontSize: 12 }}>Quitar</button>
            </div>
            <div className="row">
              <div className="field">
                <label>Cantidad de meses</label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={cantAdelantadas}
                  onChange={(e) => {
                    setCantAdelantadas(Math.max(1, Math.min(24, parseInt(e.target.value) || 1)));
                    setImporteAdelantadoEditado(false);
                  }}
                />
              </div>
              <div className="field">
                <label>Desde el mes</label>
                <input
                  type="month"
                  value={desdeAdelantado}
                  onChange={(e) => {
                    setDesdeAdelantado(e.target.value);
                    setImporteAdelantadoEditado(false);
                  }}
                />
              </div>
            </div>

            <div style={{ background: 'var(--surface)', padding: 8, borderRadius: 'var(--radius)', marginBottom: 8, fontSize: 13 }}>
              <strong>Meses a anticipar:</strong> {periodosAdel.map(fmtMesLargo).join(', ')}
            </div>

            <div className="field">
              <label>Importe total adelantado (sugerido: {fmtMoney(importeSugeridoAdel)})</label>
              <input
                type="number"
                step="0.01"
                value={importeAdelantadoEditado ? importeAdelantadoEditable : importeSugeridoAdel}
                onChange={(e) => {
                  setImporteAdelantadoEditable(e.target.value);
                  setImporteAdelantadoEditado(true);
                }}
              />
              {importeAdelantadoEditado && (
                <small style={{ color: 'var(--text-3)' }}>
                  Editado manualmente. Sugerido: {fmtMoney(importeSugeridoAdel)}
                  <button
                    type="button"
                    onClick={() => setImporteAdelantadoEditado(false)}
                    style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px' }}
                  >
                    Volver al sugerido
                  </button>
                </small>
              )}
            </div>
          </div>
        )}

        {/* === RESUMEN Y BOTÓN COBRAR === */}
        {socio && (deudas.length > 0 || adelantadoActivo) && (
          <>
            <div className="banner info">
              {seleccionadas.length > 0 && (
                <>Cuotas pendientes: <strong>{fmtMoney(importeDeudas)}</strong></>
              )}
              {seleccionadas.length > 0 && adelantadoActivo && <br />}
              {adelantadoActivo && (
                <>Adelantado ({cantAdelantadas} meses): <strong>{fmtMoney(importeAdelFinal)}</strong></>
              )}
              {(seleccionadas.length > 0 && adelantadoActivo) && (
                <div style={{ marginTop: 4, fontSize: 16 }}>
                  Total a cobrar: <strong>{fmtMoney(importeTotal)}</strong>
                </div>
              )}
            </div>

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
                <button
                  className="primary"
                  onClick={cobrar}
                  disabled={cobrando || (seleccionadas.length === 0 && !adelantadoActivo)}
                >
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
