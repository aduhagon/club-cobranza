'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { fmtMoney, fmtMesLargo } from '@/lib/utils';
import * as XLSX from 'xlsx';
import type { Usuario, Socio, TipoCuota } from '@/lib/types';
import { Download } from 'lucide-react';

interface FilaImport {
  fila: number;
  dni: string;
  periodo: string;
  importe?: number;
}

interface FilaValidada {
  fila: number;
  raw: FilaImport;
  ok: boolean;
  error?: string;
  // Datos resueltos
  socio_id?: string;
  socio_nombre?: string;
  socio_numero?: number;
  tipo_id?: string;
  periodo?: string;
  importe?: number;
}

export default function ImportarDeuda() {
  const supabase = createClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [yo, setYo] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  const [socios, setSocios] = useState<Socio[]>([]);
  const [tipos, setTipos] = useState<TipoCuota[]>([]);
  const [devsExistentes, setDevsExistentes] = useState<Array<{ socio_id: string; periodo: string }>>([]);

  const [filasValidadas, setFilasValidadas] = useState<FilaValidada[] | null>(null);
  const [parseando, setParseando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; errores: number } | null>(null);
  const [filtroPreview, setFiltroPreview] = useState<'todos' | 'ok' | 'error'>('todos');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [yoData, s, t, d] = await Promise.all([
        supabase.from('usuarios').select('*').eq('auth_id', user.id).single(),
        supabase.from('socios').select('id, numero, nombre, dni, telefono, email, tipo_cuota_id, cobrador_id, fecha_alta, fecha_baja, motivo_baja, motivo_baja_otro, debito_automatico'),
        supabase.from('tipos_cuota').select('*').order('nombre'),
        supabase.from('devengamientos').select('socio_id, periodo'),
      ]);
      setYo(yoData.data as Usuario);
      setSocios((s.data || []) as Socio[]);
      setTipos((t.data || []) as TipoCuota[]);
      setDevsExistentes((d.data || []) as Array<{ socio_id: string; periodo: string }>);
      setLoading(false);
    }
    init();
  }, []);

  function descargarPlantilla() {
    const headers = ['dni', 'periodo', 'importe'];
    const ejemplo = [
      ['12345678', '2026-01', 11500],
      ['12345678', '2026-02', 11500],
      ['12345678', '2026-03', 12000],
      ['23456789', '2026-02', 11500],
      ['23456789', '2026-03', 12000],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplo]);
    ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Deuda');

    const instrucciones = [
      ['INSTRUCCIONES PARA IMPORTAR DEUDA HISTÓRICA'],
      [''],
      ['Esta plantilla sirve para cargar cuotas adeudadas de socios que ya existen en el sistema.'],
      ['Cada fila representa UNA cuota pendiente.'],
      [''],
      ['Campos:'],
      ['  - dni: el DNI del socio (debe existir en el sistema, sin puntos ni espacios)'],
      ['  - periodo: el mes adeudado en formato AAAA-MM (ej: 2026-03 para marzo 2026)'],
      ['  - importe: el monto de la cuota (números sin signo $, sin puntos de miles)'],
      [''],
      ['Validaciones automáticas:'],
      ['  - El socio debe existir y estar activo'],
      ['  - El socio debe tener un tipo de cuota asignado'],
      ['  - El período debe ser >= mes de alta del socio'],
      ['  - El período no debe tener ya un devengamiento existente (no duplica)'],
      ['  - El importe debe ser un número positivo'],
      [''],
      ['Ejemplo:'],
      ['  Si Juan (DNI 12345678) debe enero, febrero y marzo 2026:'],
      ['  - Una fila: 12345678 | 2026-01 | 11500'],
      ['  - Una fila: 12345678 | 2026-02 | 11500'],
      ['  - Una fila: 12345678 | 2026-03 | 12000'],
      [''],
      ['Las cuotas se cargan como PENDIENTES.'],
      ['Después podés cobrarlas normalmente desde la pantalla "Cobrar".'],
      [''],
      ['Si una fila tiene error, se saltea pero el resto se importa igual.'],
    ];
    const wsInst = XLSX.utils.aoa_to_sheet(instrucciones);
    wsInst['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucciones');

    XLSX.writeFile(wb, 'plantilla-deuda-historica.xlsx');
    toast.success('Plantilla descargada');
  }

  function parsePeriodo(v: any): string | null {
    if (!v) return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    // Excel a veces convierte 2026-03 en una fecha completa
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
    return null;
  }

  function parseImporte(v: any): number | null {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  async function procesarArchivo(file: File) {
    setParseando(true);
    setResultado(null);
    setFilasValidadas(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        toast.error('El archivo no tiene hojas válidas');
        setParseando(false);
        return;
      }

      const filasRaw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as any[];
      if (filasRaw.length === 0) {
        toast.warning('El archivo está vacío o no tiene datos');
        setParseando(false);
        return;
      }

      const filas: FilaImport[] = filasRaw.map((row, idx) => ({
        fila: idx + 2,
        dni: String(row.dni || '').replace(/[^\d]/g, ''),
        periodo: String(row.periodo || '').trim(),
        importe: parseImporte(row.importe) ?? undefined,
      }));

      // Validación
      const validadas = validarFilas(filas);
      setFilasValidadas(validadas);
      setFiltroPreview('todos');

      const okCount = validadas.filter((f) => f.ok).length;
      const errCount = validadas.length - okCount;
      toast.info(`${validadas.length} filas leídas: ${okCount} válidas, ${errCount} con error`);
    } catch (err: any) {
      toast.error('Error leyendo Excel: ' + (err.message || err));
    } finally {
      setParseando(false);
    }
  }

  function validarFilas(filas: FilaImport[]): FilaValidada[] {
    const sociosPorDni = new Map<string, Socio>();
    for (const s of socios) {
      if (s.dni) sociosPorDni.set(s.dni, s);
    }

    // Set de devengamientos existentes en BD para evitar duplicados
    const devsExistSet = new Set<string>();
    for (const d of devsExistentes) {
      devsExistSet.add(`${d.socio_id}|${d.periodo}`);
    }

    // Set de combinaciones que se van agregando en este mismo Excel (evitar duplicados internos)
    const usadasEnImport = new Set<string>();

    const validadas: FilaValidada[] = [];

    for (const f of filas) {
      const errores: string[] = [];
      let socio: Socio | undefined;
      let periodoOk: string | null = null;
      let importeOk: number | null = null;

      // DNI obligatorio
      if (!f.dni) {
        errores.push('falta DNI');
      } else {
        socio = sociosPorDni.get(f.dni);
        if (!socio) errores.push(`socio con DNI ${f.dni} no existe`);
        else if (socio.fecha_baja) errores.push(`socio "${socio.nombre}" está dado de baja`);
        else if (!socio.tipo_cuota_id) errores.push(`socio "${socio.nombre}" no tiene tipo de cuota asignado`);
      }

      // Periodo
      periodoOk = parsePeriodo(f.periodo);
      if (!periodoOk) errores.push(`período "${f.periodo}" inválido (formato AAAA-MM)`);

      // Validar período vs fecha de alta del socio
      if (socio && periodoOk && socio.fecha_alta) {
        const mesAlta = socio.fecha_alta.slice(0, 7);
        if (periodoOk < mesAlta) {
          errores.push(`período ${periodoOk} es anterior al mes de alta del socio (${mesAlta})`);
        }
      }

      // Importe
      importeOk = f.importe ?? null;
      if (importeOk === null || importeOk === undefined) errores.push('falta importe');
      else if (importeOk <= 0) errores.push('importe debe ser positivo');

      // Duplicado contra BD
      if (socio && periodoOk) {
        const key = `${socio.id}|${periodoOk}`;
        if (devsExistSet.has(key)) {
          errores.push(`ya existe un devengamiento de ${periodoOk} para este socio`);
        } else if (usadasEnImport.has(key)) {
          errores.push(`fila duplicada en este archivo (mismo socio + mismo período)`);
        }
      }

      const ok = errores.length === 0;
      const validada: FilaValidada = {
        fila: f.fila,
        raw: f,
        ok,
        error: ok ? undefined : errores.join('; '),
      };

      if (ok && socio && periodoOk && importeOk !== null) {
        validada.socio_id = socio.id;
        validada.socio_nombre = socio.nombre;
        validada.socio_numero = socio.numero;
        validada.tipo_id = socio.tipo_cuota_id!;
        validada.periodo = periodoOk;
        validada.importe = importeOk;
        usadasEnImport.add(`${socio.id}|${periodoOk}`);
      }

      validadas.push(validada);
    }

    return validadas;
  }

  async function importar() {
    if (!filasValidadas || !yo) return;
    const validas = filasValidadas.filter((f) => f.ok);
    if (validas.length === 0) {
      toast.warning('No hay filas válidas para importar');
      return;
    }

    const total = validas.reduce((s, f) => s + (f.importe || 0), 0);
    if (!confirm(`¿Importar ${validas.length} cuotas adeudadas por un total de ${fmtMoney(total)}?`)) return;

    setImportando(true);
    let ok = 0;
    let errores = 0;
    const erroresDetalle: Array<{ fila: number; error: string }> = [];

    try {
      const filasInsert = validas.map((f) => ({
        socio_id: f.socio_id!,
        tipo_id: f.tipo_id!,
        periodo: f.periodo!,
        importe: f.importe!,
        estado: 'pendiente',
        origen: 'import_deuda',
      }));

      const BATCH = 100;
      for (let i = 0; i < filasInsert.length; i += BATCH) {
        const lote = filasInsert.slice(i, i + BATCH);
        const { error } = await supabase.from('devengamientos').insert(lote);
        if (error) {
          // Reintentar uno por uno
          for (const fila of lote) {
            const { error: e2 } = await supabase.from('devengamientos').insert(fila);
            if (e2) {
              errores++;
              const filaOriginal = validas.find((f) => f.socio_id === fila.socio_id && f.periodo === fila.periodo);
              erroresDetalle.push({
                fila: filaOriginal?.fila ?? 0,
                error: e2.message,
              });
            } else {
              ok++;
            }
          }
        } else {
          ok += lote.length;
        }
      }

      await supabase.from('auditoria').insert({
        usuario: yo.nombre, rol: yo.rol, accion: 'import_deuda',
        detalle: `Importación masiva de deuda: ${ok} OK, ${errores} con error`,
        datos: { ok, errores, total_importe: total },
        prev_hash: '0', hash: '0',
      });

      setResultado({ ok, errores });
      if (ok > 0) toast.success(`${ok} cuotas adeudadas importadas`);
      if (errores > 0) {
        toast.warning(`${errores} con error en la inserción`);
        const idsFallidos = new Set(erroresDetalle.map((e) => e.fila));
        setFilasValidadas(filasValidadas.map((f) => {
          if (idsFallidos.has(f.fila)) {
            const det = erroresDetalle.find((e) => e.fila === f.fila);
            return { ...f, ok: false, error: 'Al insertar: ' + (det?.error || 'error desconocido') };
          }
          return f;
        }));
      }
    } catch (err: any) {
      toast.error('Error general: ' + (err.message || err));
    } finally {
      setImportando(false);
    }
  }

  function reset() {
    setFilasValidadas(null);
    setResultado(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  if (loading) return <div className="empty">Cargando...</div>;
  if (yo?.rol !== 'admin') {
    return <div className="banner warning">Solo los administradores pueden importar deuda.</div>;
  }

  const filasFiltradas = filasValidadas
    ? (filtroPreview === 'todos' ? filasValidadas
       : filtroPreview === 'ok' ? filasValidadas.filter((f) => f.ok)
       : filasValidadas.filter((f) => !f.ok))
    : [];

  const totalOk = filasValidadas?.filter((f) => f.ok).length || 0;
  const totalError = (filasValidadas?.length || 0) - totalOk;
  const totalImporte = filasValidadas?.filter((f) => f.ok).reduce((s, f) => s + (f.importe || 0), 0) || 0;

  return (
    <div>
      <div className="banner info">
        Para cargar la deuda histórica de los socios al sistema:
        <ol style={{ marginTop: 6, marginLeft: 20 }}>
          <li>Asegurate primero de tener cargados a los socios (en el tab anterior)</li>
          <li>Descargá la plantilla Excel</li>
          <li>Una fila por cada cuota adeudada (DNI + período + importe)</li>
          <li>Subila acá para previsualizar y revisar errores</li>
          <li>Confirmá la importación</li>
        </ol>
      </div>

      {!filasValidadas && (
        <div className="card">
          <h3>1. Descargar plantilla</h3>
          <p style={{ color: 'var(--text-2)', marginBottom: 12, fontSize: 14 }}>
            Cada fila representa una cuota adeudada del socio. Los socios se identifican por DNI.
          </p>
          <button onClick={descargarPlantilla}><Download size={16} />Descargar plantilla Excel</button>

          <h3 style={{ marginTop: 24 }}>2. Subir archivo completo</h3>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) procesarArchivo(file);
            }}
            disabled={parseando}
          />
          {parseando && <div style={{ marginTop: 8, color: 'var(--text-2)' }}>Procesando archivo...</div>}
        </div>
      )}

      {filasValidadas && (
        <>
          {resultado ? (
            <div className={`banner ${resultado.errores === 0 ? 'success' : 'warning'}`}>
              <strong>Importación finalizada:</strong> {resultado.ok} cuotas importadas
              {resultado.errores > 0 && <>, {resultado.errores} con error</>}
            </div>
          ) : (
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-label">Filas leídas</div>
                <div className="stat-value">{filasValidadas.length}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Válidas</div>
                <div className="stat-value success">{totalOk}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Con error</div>
                <div className="stat-value danger">{totalError}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Total a importar</div>
                <div className="stat-value">{fmtMoney(totalImporte)}</div>
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ marginBottom: 0 }}>Vista previa</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setFiltroPreview('todos')}
                  className={filtroPreview === 'todos' ? 'primary' : ''}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  Todos ({filasValidadas.length})
                </button>
                <button
                  onClick={() => setFiltroPreview('ok')}
                  className={filtroPreview === 'ok' ? 'primary' : ''}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  OK ({totalOk})
                </button>
                <button
                  onClick={() => setFiltroPreview('error')}
                  className={filtroPreview === 'error' ? 'primary' : ''}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  Errores ({totalError})
                </button>
              </div>
            </div>

            {filasFiltradas.length === 0 ? (
              <div className="empty">Sin filas para mostrar</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>Fila</th>
                      <th style={{ width: 30 }}></th>
                      <th style={{ width: 110 }}>DNI</th>
                      <th>Socio</th>
                      <th style={{ width: 110 }}>Período</th>
                      <th style={{ width: 110 }}>Importe</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasFiltradas.slice(0, 200).map((f) => (
                      <tr key={f.fila} style={!f.ok ? { background: 'var(--danger-bg)' } : {}}>
                        <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{f.fila}</td>
                        <td>{f.ok ? '✓' : '✕'}</td>
                        <td>{f.raw.dni || '-'}</td>
                        <td>
                          {f.socio_nombre
                            ? `#${f.socio_numero} ${f.socio_nombre}`
                            : <em style={{ color: 'var(--text-3)' }}>—</em>}
                        </td>
                        <td>{f.periodo ? fmtMesLargo(f.periodo) : (f.raw.periodo || '-')}</td>
                        <td>{f.importe ? fmtMoney(f.importe) : (f.raw.importe ? `$${f.raw.importe}` : '-')}</td>
                        <td style={{ fontSize: 12, color: f.ok ? 'var(--text-3)' : 'var(--danger)' }}>
                          {f.error || (f.ok ? '✓ Listo para importar' : '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filasFiltradas.length > 200 && (
                  <small style={{ color: 'var(--text-3)' }}>...y {filasFiltradas.length - 200} más</small>
                )}
              </div>
            )}
          </div>

          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <button onClick={reset}>Cancelar / Empezar de nuevo</button>
            {!resultado && (
              <button
                className="primary"
                onClick={importar}
                disabled={importando || totalOk === 0}
              >
                {importando ? 'Importando...' : `Importar ${totalOk} cuotas (${fmtMoney(totalImporte)})`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
