'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { fmtMoney, fmtMesLargo, thisMonth, todayISO, formatNumeroRecibo, simpleHash } from '@/lib/utils';
import type { Socio, TipoCuota, ValorCuota, Sucursal, Devengamiento, Usuario } from '@/lib/types';

type Tab = 'devengamiento' | 'debito';

export default function ProcesosPage() {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const [yo, setYo] = useState<Usuario | null>(null);
  const [tab, setTab] = useState<Tab>('devengamiento');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: yoData } = await supabase.from('usuarios').select('*').eq('auth_id', user.id).single();
      setYo(yoData as Usuario);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="empty">Cargando...</div>;
  if (yo?.rol !== 'admin') {
    return (
      <div>
        <h1>Procesos masivos</h1>
        <div className="banner warning">Solo los administradores pueden ejecutar procesos masivos.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="main-header">
        <h1>Procesos masivos</h1>
      </div>

      <div className="tabs">
        <button className={tab === 'devengamiento' ? 'tab-active' : ''} onClick={() => setTab('devengamiento')}>
          Devengamiento mensual
        </button>
        <button className={tab === 'debito' ? 'tab-active' : ''} onClick={() => setTab('debito')}>
          Cobro Débitos Automáticos
        </button>
      </div>

      {tab === 'devengamiento' && <DevengamientoMasivo yo={yo} />}
      {tab === 'debito' && <DebitoAutomaticoMasivo yo={yo} />}
    </div>
  );
}

// ====================================================================
// DEVENGAMIENTO MASIVO
// ====================================================================
function DevengamientoMasivo({ yo }: { yo: Usuario }) {
  const supabase = createClient();
  const toast = useToast();
  const [periodo, setPeriodo] = useState(thisMonth());
  const [calculando, setCalculando] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [resumen, setResumen] = useState<{
    totalActivos: number;
    yaTienen: number;
    aGenerar: number;
    sinTipo: number;
    sinValor: number;
    noVigentes: number;
    detalle: Array<{ socio: Socio; tipo: TipoCuota; importe: number }>;
    sinTipoLista: Socio[];
    sinValorLista: Array<{ socio: Socio; tipo: TipoCuota }>;
    noVigentesLista: Socio[];
  } | null>(null);

  async function calcular() {
    setCalculando(true);
    setResumen(null);

    const [s, t, v, d] = await Promise.all([
      supabase.from('socios').select('*').is('fecha_baja', null),
      supabase.from('tipos_cuota').select('*'),
      supabase.from('valores_cuota').select('*'),
      supabase.from('devengamientos').select('socio_id').eq('periodo', periodo),
    ]);

    const socios = (s.data || []) as Socio[];
    const tipos = (t.data || []) as TipoCuota[];
    const valores = (v.data || []) as ValorCuota[];
    const yaDevengados = new Set((d.data || []).map((x: any) => x.socio_id));

    const tiposMap = new Map(tipos.map((t) => [t.id, t]));

    let aGenerar = 0;
    let sinTipo = 0;
    let sinValor = 0;
    let noVigentes = 0;
    const detalle: typeof resumen extends infer R ? R extends { detalle: infer D } ? D : never : never = [] as any;
    const sinTipoLista: Socio[] = [];
    const sinValorLista: Array<{ socio: Socio; tipo: TipoCuota }> = [];
    const noVigentesLista: Socio[] = [];

    for (const socio of socios) {
      if (yaDevengados.has(socio.id)) continue;

      // Validar que el período sea >= mes de alta del socio
      // (el socio.fecha_alta es 'YYYY-MM-DD', el periodo es 'YYYY-MM')
      const mesAlta = socio.fecha_alta ? socio.fecha_alta.slice(0, 7) : null;
      if (mesAlta && periodo < mesAlta) {
        noVigentes++;
        noVigentesLista.push(socio);
        continue;
      }

      // Validar que el período sea <= mes de baja (si tuviera baja con fecha futura)
      if (socio.fecha_baja) {
        const mesBaja = socio.fecha_baja.slice(0, 7);
        if (periodo > mesBaja) {
          noVigentes++;
          noVigentesLista.push(socio);
          continue;
        }
      }

      if (!socio.tipo_cuota_id) {
        sinTipo++;
        sinTipoLista.push(socio);
        continue;
      }

      const tipo = tiposMap.get(socio.tipo_cuota_id);
      if (!tipo) continue;

      const valoresOrden = valores
        .filter((v) => v.tipo_id === socio.tipo_cuota_id && v.desde <= periodo)
        .sort((a, b) => b.desde.localeCompare(a.desde));

      if (valoresOrden.length === 0) {
        sinValor++;
        sinValorLista.push({ socio, tipo });
        continue;
      }

      detalle.push({ socio, tipo, importe: Number(valoresOrden[0].importe) });
      aGenerar++;
    }

    setResumen({
      totalActivos: socios.length,
      yaTienen: yaDevengados.size,
      aGenerar,
      sinTipo,
      sinValor,
      noVigentes,
      detalle,
      sinTipoLista,
      sinValorLista,
      noVigentesLista,
    });
    setCalculando(false);
  }

  async function ejecutar() {
    if (!resumen || resumen.aGenerar === 0) return;
    if (!confirm(`¿Generar ${resumen.aGenerar} devengamientos para ${fmtMesLargo(periodo)}? Esta acción no se puede deshacer.`)) return;

    setEjecutando(true);

    try {
      const filas = resumen.detalle.map(({ socio, tipo, importe }) => ({
        socio_id: socio.id,
        tipo_id: tipo.id,
        periodo,
        importe,
        estado: 'pendiente',
        origen: 'devengamiento_masivo',
      }));

      const BATCH = 200;
      let insertados = 0;
      for (let i = 0; i < filas.length; i += BATCH) {
        const lote = filas.slice(i, i + BATCH);
        const { error } = await supabase.from('devengamientos').insert(lote);
        if (error) {
          toast.error(`Error en lote ${i / BATCH + 1}: ${error.message}`);
          break;
        }
        insertados += lote.length;
      }

      await supabase.from('auditoria').insert({
        usuario: yo.nombre, rol: yo.rol, accion: 'devengamiento_masivo',
        detalle: `Generados ${insertados} devengamientos para ${fmtMesLargo(periodo)}`,
        datos: { periodo, cantidad: insertados },
        prev_hash: '0', hash: '0',
      });

      toast.success(`${insertados} devengamientos generados`);
      setResumen(null);
    } catch (err: any) {
      toast.error('Error: ' + (err.message || err));
    } finally {
      setEjecutando(false);
    }
  }

  return (
    <div>
      <div className="banner info">
        Genera el devengamiento (cuota) del mes elegido para todos los socios activos.
        Si un socio ya tiene devengamiento de ese mes lo saltea sin duplicar.
        Te muestra una previsualización antes de ejecutar.
      </div>

      <div className="card">
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Mes a devengar</label>
            <input type="month" value={periodo} onChange={(e) => { setPeriodo(e.target.value); setResumen(null); }} />
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <label>&nbsp;</label>
            <button onClick={calcular} disabled={calculando} className="primary">
              {calculando ? 'Calculando...' : 'Pre-visualizar'}
            </button>
          </div>
        </div>
      </div>

      {resumen && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">Socios activos</div>
              <div className="stat-value">{resumen.totalActivos}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Ya devengados</div>
              <div className="stat-value">{resumen.yaTienen}</div>
            </div>
            <div className="stat">
              <div className="stat-label">A generar</div>
              <div className="stat-value success">{resumen.aGenerar}</div>
            </div>
            <div className="stat">
              <div className="stat-label">No se pueden</div>
              <div className="stat-value danger">{resumen.sinTipo + resumen.sinValor + resumen.noVigentes}</div>
            </div>
          </div>

          {(resumen.sinTipo > 0 || resumen.sinValor > 0 || resumen.noVigentes > 0) && (
            <div className="banner warning">
              <strong>Atención:</strong> {resumen.sinTipo + resumen.sinValor + resumen.noVigentes} socios no podrán recibir devengamiento.
              {resumen.noVigentes > 0 && <div style={{ marginTop: 4 }}>• {resumen.noVigentes} no vigentes en {fmtMesLargo(periodo)} (alta posterior o baja anterior a ese mes)</div>}
              {resumen.sinTipo > 0 && <div style={{ marginTop: 4 }}>• {resumen.sinTipo} sin tipo de cuota asignado</div>}
              {resumen.sinValor > 0 && <div>• {resumen.sinValor} con tipo asignado pero sin valor cargado para {fmtMesLargo(periodo)}</div>}
            </div>
          )}

          {resumen.aGenerar > 0 && (
            <div className="card">
              <h3>Vista previa (primeros 30)</h3>
              <table>
                <thead>
                  <tr><th>N°</th><th>Nombre</th><th>Tipo</th><th>Importe</th></tr>
                </thead>
                <tbody>
                  {resumen.detalle.slice(0, 30).map(({ socio, tipo, importe }) => (
                    <tr key={socio.id}>
                      <td>{socio.numero}</td>
                      <td>{socio.nombre}</td>
                      <td>{tipo.nombre}</td>
                      <td>{fmtMoney(importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resumen.detalle.length > 30 && (
                <small style={{ color: 'var(--text-3)' }}>...y {resumen.detalle.length - 30} más</small>
              )}
              <div style={{ marginTop: 16, padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--radius)', textAlign: 'right' }}>
                <strong>Total a devengar: {fmtMoney(resumen.detalle.reduce((s, d) => s + d.importe, 0))}</strong>
              </div>
            </div>
          )}

          {resumen.noVigentesLista.length > 0 && (
            <details className="card">
              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Socios no vigentes en {fmtMesLargo(periodo)} ({resumen.noVigentesLista.length})</summary>
              <ul style={{ marginTop: 8, marginLeft: 24, fontSize: 13 }}>
                {resumen.noVigentesLista.map((s) => (
                  <li key={s.id}>
                    #{s.numero} - {s.nombre}
                    {s.fecha_alta && <span style={{ color: 'var(--text-3)' }}> · alta: {s.fecha_alta.slice(0, 7)}</span>}
                    {s.fecha_baja && <span style={{ color: 'var(--text-3)' }}> · baja: {s.fecha_baja.slice(0, 7)}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {resumen.sinTipoLista.length > 0 && (
            <details className="card">
              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Socios sin tipo de cuota ({resumen.sinTipoLista.length})</summary>
              <ul style={{ marginTop: 8, marginLeft: 24, fontSize: 13 }}>
                {resumen.sinTipoLista.map((s) => (
                  <li key={s.id}>#{s.numero} - {s.nombre}</li>
                ))}
              </ul>
            </details>
          )}

          {resumen.sinValorLista.length > 0 && (
            <details className="card">
              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Socios sin valor de cuota cargado ({resumen.sinValorLista.length})</summary>
              <ul style={{ marginTop: 8, marginLeft: 24, fontSize: 13 }}>
                {resumen.sinValorLista.map(({ socio, tipo }) => (
                  <li key={socio.id}>#{socio.numero} - {socio.nombre} (tipo: {tipo.nombre})</li>
                ))}
              </ul>
            </details>
          )}

          <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setResumen(null)}>Cancelar</button>
            <button className="primary" onClick={ejecutar} disabled={ejecutando || resumen.aGenerar === 0}>
              {ejecutando ? 'Ejecutando...' : `Generar ${resumen.aGenerar} devengamientos`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ====================================================================
// DÉBITO AUTOMÁTICO MASIVO
// ====================================================================
interface SocioDA {
  socio: Socio;
  devengamientos: Devengamiento[];
  total: number;
  seleccionado: boolean;
}

function DebitoAutomaticoMasivo({ yo }: { yo: Usuario }) {
  const supabase = createClient();
  const toast = useToast();
  const [fechaPago, setFechaPago] = useState(todayISO());
  const [sucursalDA, setSucursalDA] = useState<Sucursal | null>(null);
  const [tipos, setTipos] = useState<TipoCuota[]>([]);
  const [items, setItems] = useState<SocioDA[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; errores: number } | null>(null);

  async function buscar() {
    setCalculando(true);
    setItems([]);
    setResultado(null);

    // Buscar sucursal DA
    const { data: suc } = await supabase
      .from('sucursales').select('*').eq('codigo', 'DA').maybeSingle();

    if (!suc) {
      toast.error('No existe la sucursal "DA". Creala primero en Talonarios.');
      setCalculando(false);
      return;
    }
    setSucursalDA(suc as Sucursal);

    // Socios DA activos
    const { data: socios } = await supabase
      .from('socios').select('*')
      .is('fecha_baja', null).eq('debito_automatico', true).order('numero');

    if (!socios || socios.length === 0) {
      toast.info('No hay socios con débito automático');
      setCalculando(false);
      return;
    }

    const socioIds = socios.map((s: any) => s.id);

    // Devengamientos pendientes de esos socios
    const { data: devs } = await supabase
      .from('devengamientos').select('*')
      .in('socio_id', socioIds).eq('estado', 'pendiente').order('periodo');

    const { data: tiposData } = await supabase.from('tipos_cuota').select('*');
    setTipos((tiposData || []) as TipoCuota[]);

    const devsPorSocio = new Map<string, Devengamiento[]>();
    for (const d of (devs || []) as Devengamiento[]) {
      if (!devsPorSocio.has(d.socio_id)) devsPorSocio.set(d.socio_id, []);
      devsPorSocio.get(d.socio_id)!.push(d);
    }

    const lista: SocioDA[] = [];
    for (const s of socios as Socio[]) {
      const ds = devsPorSocio.get(s.id) || [];
      if (ds.length === 0) continue;
      const total = ds.reduce((sum, d) => sum + Number(d.importe), 0);
      lista.push({ socio: s, devengamientos: ds, total, seleccionado: true });
    }

    setItems(lista);
    setCalculando(false);

    if (lista.length === 0) {
      toast.info('No hay socios DA con cuotas pendientes');
    }
  }

  function toggleAll() {
    const todasSel = items.every((i) => i.seleccionado);
    setItems(items.map((i) => ({ ...i, seleccionado: !todasSel })));
  }

  function toggle(socioId: string) {
    setItems(items.map((i) => i.socio.id === socioId ? { ...i, seleccionado: !i.seleccionado } : i));
  }

  async function ejecutar() {
    if (!sucursalDA) return;
    const seleccionados = items.filter((i) => i.seleccionado);
    if (seleccionados.length === 0) {
      toast.warning('Seleccioná al menos un socio');
      return;
    }
    const totalGeneral = seleccionados.reduce((s, i) => s + i.total, 0);
    if (!confirm(`¿Registrar ${seleccionados.length} cobros por DA por un total de ${fmtMoney(totalGeneral)}?`)) return;

    setEjecutando(true);
    let ok = 0;
    let errores = 0;

    try {
      // Obtener el último número de la sucursal DA
      const { data: ultimosNumeros } = await supabase
        .from('pagos').select('numero').eq('sucursal_id', sucursalDA.id)
        .order('numero', { ascending: false }).limit(1);
      let numeroActual = ultimosNumeros && ultimosNumeros.length > 0
        ? ultimosNumeros[0].numero
        : (sucursalDA.numero_desde - 1);

      for (const item of seleccionados) {
        try {
          numeroActual++;

          if (sucursalDA.numero_hasta && numeroActual > sucursalDA.numero_hasta) {
            toast.error('Talonario DA agotado');
            errores += seleccionados.length - ok - errores;
            break;
          }

          const pagoBase = {
            sucursal_id: sucursalDA.id,
            numero: numeroActual,
            socio_id: item.socio.id,
            fecha_pago: fechaPago,
            medio: 'Débito automático',
            importe: item.total,
            cobrador: yo.nombre,
            cobrador_id: yo.id,
            prev_hash: '0',
          };
          const hash = simpleHash(JSON.stringify(pagoBase));

          const { data: pago, error: ePago } = await supabase
            .from('pagos').insert({ ...pagoBase, hash }).select().single();

          if (ePago) { errores++; console.error('Error pago:', ePago); continue; }

          const links = item.devengamientos.map((d) => ({ pago_id: pago.id, devengamiento_id: d.id }));
          await supabase.from('pagos_devengamientos').insert(links);
          await supabase.from('devengamientos')
            .update({ estado: 'pagado', pago_id: pago.id })
            .in('id', item.devengamientos.map((d) => d.id));

          ok++;
        } catch (err) {
          errores++;
          console.error(err);
        }
      }

      await supabase.from('auditoria').insert({
        usuario: yo.nombre, rol: yo.rol, accion: 'cobro_da_masivo',
        detalle: `Cobros DA masivos: ${ok} OK, ${errores} con error`,
        datos: { fecha: fechaPago, ok, errores, total: totalGeneral },
        prev_hash: '0', hash: '0',
      });

      setResultado({ ok, errores });
      if (ok > 0) toast.success(`${ok} cobros registrados`);
      if (errores > 0) toast.warning(`${errores} con error`);

      // Recargar la lista
      buscar();
    } catch (err: any) {
      toast.error('Error general: ' + (err.message || err));
    } finally {
      setEjecutando(false);
    }
  }

  const seleccionados = items.filter((i) => i.seleccionado);
  const totalSel = seleccionados.reduce((s, i) => s + i.total, 0);
  const todasSel = items.length > 0 && items.every((i) => i.seleccionado);

  return (
    <div>
      <div className="banner info">
        Lista todos los socios con débito automático que tienen cuotas pendientes.
        Tildá los que efectivamente cobraron este mes y registrá todos los pagos de un solo click.
        Los recibos se emiten bajo la sucursal "<strong>DA</strong>" con numeración propia.
      </div>

      <div className="card">
        <div className="row">
          <div className="field">
            <label>Fecha del cobro</label>
            <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <label>&nbsp;</label>
            <button onClick={buscar} disabled={calculando} className="primary">
              {calculando ? 'Buscando...' : 'Buscar socios DA'}
            </button>
          </div>
        </div>
      </div>

      {resultado && (
        <div className={`banner ${resultado.errores === 0 ? 'success' : 'warning'}`}>
          Proceso terminado: <strong>{resultado.ok}</strong> cobros registrados
          {resultado.errores > 0 && <>, <strong>{resultado.errores}</strong> con error</>}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div className="banner info" style={{ flex: 1, marginBottom: 0, minWidth: 200 }}>
              {seleccionados.length} de {items.length} seleccionados · Total: <strong>{fmtMoney(totalSel)}</strong>
            </div>
            <button onClick={toggleAll}>
              {todasSel ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <table className="desktop-only">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th style={{ width: 60 }}>N°</th>
                  <th>Socio</th>
                  <th>Cuotas pendientes</th>
                  <th style={{ width: 130 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.socio.id} style={!it.seleccionado ? { opacity: 0.5 } : {}}>
                    <td><input type="checkbox" checked={it.seleccionado} onChange={() => toggle(it.socio.id)} /></td>
                    <td>{it.socio.numero}</td>
                    <td>{it.socio.nombre}</td>
                    <td style={{ fontSize: 12 }}>
                      {it.devengamientos.map((d) => fmtMesLargo(d.periodo)).join(', ')}
                    </td>
                    <td><strong>{fmtMoney(it.total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mobile-only" style={{ padding: 8 }}>
              {items.map((it) => (
                <div key={it.socio.id} className="socio-card" style={!it.seleccionado ? { opacity: 0.5 } : {}}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={it.seleccionado} onChange={() => toggle(it.socio.id)} />
                    <div style={{ flex: 1 }}>
                      <div className="socio-card-head">
                        <div>
                          <span className="socio-card-num">#{it.socio.numero}</span>{' '}
                          <span className="socio-card-title">{it.socio.nombre}</span>
                        </div>
                        <strong>{fmtMoney(it.total)}</strong>
                      </div>
                      <div className="socio-card-info">
                        {it.devengamientos.length} cuotas: {it.devengamientos.map((d) => fmtMesLargo(d.periodo)).join(', ')}
                      </div>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="primary" onClick={ejecutar} disabled={ejecutando || seleccionados.length === 0}>
              {ejecutando ? 'Procesando...' : `Cobrar ${seleccionados.length} socios por ${fmtMoney(totalSel)}`}
            </button>
          </div>
        </>
      )}

      {items.length === 0 && !calculando && !resultado && (
        <div className="empty">Hacé clic en "Buscar socios DA" para listar.</div>
      )}
    </div>
  );
}
