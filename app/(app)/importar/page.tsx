'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { fmtDate, todayISO, normalize } from '@/lib/utils';
import * as XLSX from 'xlsx';
import type { Usuario, Socio, TipoCuota } from '@/lib/types';

interface FilaImport {
  fila: number; // 1-indexed para mostrar al usuario (la 1 es el header)
  numero?: number;
  nombre: string;
  dni?: string;
  telefono?: string;
  email?: string;
  tipo_cuota?: string;
  cobrador_email?: string;
  debito_automatico?: string;
  fecha_alta?: string;
}

interface FilaValidada {
  fila: number;
  raw: FilaImport;
  ok: boolean;
  error?: string;
  // Datos resueltos
  numero?: number;
  nombre?: string;
  dni?: string | null;
  telefono?: string | null;
  email?: string | null;
  tipo_cuota_id?: string | null;
  cobrador_id?: string | null;
  debito_automatico?: boolean;
  fecha_alta?: string;
}

export default function ImportarPage() {
  const supabase = createClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [yo, setYo] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  const [tipos, setTipos] = useState<TipoCuota[]>([]);
  const [cobradores, setCobradores] = useState<Usuario[]>([]);
  const [sociosExistentes, setSociosExistentes] = useState<Socio[]>([]);

  const [filasValidadas, setFilasValidadas] = useState<FilaValidada[] | null>(null);
  const [parseando, setParseando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; errores: number } | null>(null);
  const [filtroPreview, setFiltroPreview] = useState<'todos' | 'ok' | 'error'>('todos');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [yoData, t, c, s] = await Promise.all([
        supabase.from('usuarios').select('*').eq('auth_id', user.id).single(),
        supabase.from('tipos_cuota').select('*').order('nombre'),
        supabase.from('usuarios').select('*').eq('rol', 'cobrador').eq('activo', true).order('nombre'),
        supabase.from('socios').select('id, numero, nombre, dni, telefono, email, tipo_cuota_id, cobrador_id, fecha_alta, fecha_baja, motivo_baja, motivo_baja_otro, debito_automatico'),
      ]);
      setYo(yoData.data as Usuario);
      setTipos((t.data || []) as TipoCuota[]);
      setCobradores((c.data || []) as Usuario[]);
      setSociosExistentes((s.data || []) as Socio[]);
      setLoading(false);
    }
    init();
  }, []);

  function descargarPlantilla() {
    const headers = [
      'numero', 'nombre', 'dni', 'telefono', 'email',
      'tipo_cuota', 'cobrador_email', 'debito_automatico', 'fecha_alta',
    ];
    const ejemplo = [
      [1, 'Juan Pérez', '12345678', '5491145678901', 'juan@email.com', 'Adulto', 'cobrador@email.com', 'no', '2025-03-01'],
      [2, 'María López', '23456789', '', '', 'Adulto', '', 'si', '2025-06-15'],
      ['', 'Pedro García (sin número, se asigna automático)', '', '', '', 'Cadete', '', 'no', '2026-01-10'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplo]);
    // Anchos de columna
    ws['!cols'] = [
      { wch: 8 }, { wch: 40 }, { wch: 12 }, { wch: 18 }, { wch: 25 },
      { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Socios');

    // Hoja con instrucciones
    const instrucciones = [
      ['INSTRUCCIONES PARA IMPORTAR SOCIOS'],
      [''],
      ['Campos obligatorios:'],
      ['  - nombre: el nombre completo del socio'],
      [''],
      ['Campos opcionales:'],
      ['  - numero: si está vacío se asigna el siguiente disponible'],
      ['  - dni, telefono, email: tal cual'],
      ['  - tipo_cuota: debe ser el NOMBRE EXACTO de un tipo existente'],
      ['  - cobrador_email: el email del cobrador asignado (debe existir como usuario)'],
      ['  - debito_automatico: "si" / "no" (también acepta true/false, sí/no)'],
      ['  - fecha_alta: en formato AAAA-MM-DD (ej: 2025-03-15). Si está vacía, se usa hoy'],
      [''],
      ['Tipos de cuota actuales:'],
      ...['(ver tipos en la pantalla principal de Cuotas)'].map((s) => ['  ' + s]),
      [''],
      ['Cobradores actuales:'],
      ['  (ver cobradores en la pantalla de Talonarios)'],
      [''],
      ['Si una fila tiene error, se saltea pero el resto se importa igual.'],
      ['Al final vas a ver el reporte de cuáles fallaron y por qué.'],
    ];
    const wsInst = XLSX.utils.aoa_to_sheet(instrucciones);
    wsInst['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucciones');

    XLSX.writeFile(wb, 'plantilla-socios.xlsx');
    toast.success('Plantilla descargada');
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

      // Convertir a JSON con encabezados como nombres de campo
      const filasRaw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as any[];

      if (filasRaw.length === 0) {
        toast.warning('El archivo está vacío o no tiene datos');
        setParseando(false);
        return;
      }

      const filas: FilaImport[] = filasRaw.map((row, idx) => ({
        fila: idx + 2, // +2 porque la fila 1 es el header en Excel
        numero: parseNumero(row.numero),
        nombre: String(row.nombre || '').trim(),
        dni: String(row.dni || '').trim() || undefined,
        telefono: String(row.telefono || '').trim() || undefined,
        email: String(row.email || '').trim() || undefined,
        tipo_cuota: String(row.tipo_cuota || '').trim() || undefined,
        cobrador_email: String(row.cobrador_email || '').trim() || undefined,
        debito_automatico: String(row.debito_automatico || '').trim() || undefined,
        fecha_alta: String(row.fecha_alta || '').trim() || undefined,
      }));

      // Validar
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

  function parseNumero(v: any): number | undefined {
    if (v === '' || v === null || v === undefined) return undefined;
    const n = parseInt(String(v));
    return isNaN(n) ? undefined : n;
  }

  function parseBoolean(v: string | undefined): boolean {
    if (!v) return false;
    const s = v.toLowerCase().trim();
    return ['si', 'sí', 'yes', 'true', '1', 'x', 'verdadero'].includes(s);
  }

  function parseFecha(v: string | undefined): string | null {
    if (!v) return null;
    const s = v.trim();
    // ya en formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // formato DD/MM/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // ISO con tiempo (Excel a veces devuelve esto)
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
    return null;
  }

  function validarFilas(filas: FilaImport[]): FilaValidada[] {
    const tiposPorNombre = new Map<string, TipoCuota>();
    for (const t of tipos) tiposPorNombre.set(normalize(t.nombre), t);

    const cobradoresPorEmail = new Map<string, Usuario>();
    for (const c of cobradores) cobradoresPorEmail.set(c.email.toLowerCase(), c);

    const numerosExistentes = new Set(sociosExistentes.map((s) => s.numero));
    const dnisExistentes = new Set(sociosExistentes.filter((s) => s.dni).map((s) => s.dni));
    const numerosUsadosEnImport = new Set<number>();
    const dnisUsadosEnImport = new Set<string>();

    let siguienteNumero = sociosExistentes.length > 0
      ? Math.max(...sociosExistentes.map((s) => s.numero)) + 1
      : 1;

    const validadas: FilaValidada[] = [];

    for (const f of filas) {
      const errores: string[] = [];

      // Nombre obligatorio
      if (!f.nombre) errores.push('falta nombre');

      // Número
      let numeroFinal: number;
      if (f.numero !== undefined) {
        if (numerosExistentes.has(f.numero)) errores.push(`número ${f.numero} ya existe`);
        else if (numerosUsadosEnImport.has(f.numero)) errores.push(`número ${f.numero} repetido en el archivo`);
        numeroFinal = f.numero;
      } else {
        // Buscar próximo libre
        while (numerosExistentes.has(siguienteNumero) || numerosUsadosEnImport.has(siguienteNumero)) {
          siguienteNumero++;
        }
        numeroFinal = siguienteNumero;
        siguienteNumero++;
      }

      // DNI duplicado (warning, no error fatal)
      if (f.dni) {
        if (dnisExistentes.has(f.dni)) errores.push(`DNI ${f.dni} ya existe en otro socio`);
        else if (dnisUsadosEnImport.has(f.dni)) errores.push(`DNI ${f.dni} repetido en el archivo`);
      }

      // Tipo de cuota
      let tipoId: string | null = null;
      if (f.tipo_cuota) {
        const tipo = tiposPorNombre.get(normalize(f.tipo_cuota));
        if (!tipo) errores.push(`tipo de cuota "${f.tipo_cuota}" no existe`);
        else tipoId = tipo.id;
      }

      // Cobrador
      let cobradorId: string | null = null;
      if (f.cobrador_email) {
        const cob = cobradoresPorEmail.get(f.cobrador_email.toLowerCase());
        if (!cob) errores.push(`cobrador "${f.cobrador_email}" no existe`);
        else cobradorId = cob.id;
      }

      // Fecha de alta
      let fechaAlta = parseFecha(f.fecha_alta);
      if (f.fecha_alta && !fechaAlta) errores.push(`fecha "${f.fecha_alta}" formato inválido (usar AAAA-MM-DD)`);
      if (!fechaAlta) fechaAlta = todayISO();

      const ok = errores.length === 0;
      const validada: FilaValidada = {
        fila: f.fila,
        raw: f,
        ok,
        error: ok ? undefined : errores.join('; '),
      };

      if (ok) {
        validada.numero = numeroFinal;
        validada.nombre = f.nombre;
        validada.dni = f.dni || null;
        validada.telefono = f.telefono || null;
        validada.email = f.email || null;
        validada.tipo_cuota_id = tipoId;
        validada.cobrador_id = cobradorId;
        validada.debito_automatico = parseBoolean(f.debito_automatico);
        validada.fecha_alta = fechaAlta;

        // Reservar número y DNI para evitar duplicados con filas siguientes
        numerosUsadosEnImport.add(numeroFinal);
        if (f.dni) dnisUsadosEnImport.add(f.dni);
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
    if (!confirm(`¿Importar ${validas.length} socios?`)) return;

    setImportando(true);
    let ok = 0;
    let errores = 0;
    const erroresDetalle: Array<{ fila: number; error: string }> = [];

    try {
      const filasInsert = validas.map((f) => ({
        numero: f.numero!,
        nombre: f.nombre!,
        dni: f.dni,
        telefono: f.telefono,
        email: f.email,
        tipo_cuota_id: f.tipo_cuota_id,
        cobrador_id: f.cobrador_id,
        debito_automatico: f.debito_automatico!,
        fecha_alta: f.fecha_alta!,
      }));

      // Insertar en lotes de 50
      const BATCH = 50;
      for (let i = 0; i < filasInsert.length; i += BATCH) {
        const lote = filasInsert.slice(i, i + BATCH);
        const { error } = await supabase.from('socios').insert(lote);
        if (error) {
          // Si falla el lote completo, intentamos uno por uno para identificar cuál falló
          for (const fila of lote) {
            const { error: e2 } = await supabase.from('socios').insert(fila);
            if (e2) {
              errores++;
              const filaOriginal = validas.find((f) => f.numero === fila.numero);
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
        usuario: yo.nombre, rol: yo.rol, accion: 'import_socios',
        detalle: `Importación masiva: ${ok} OK, ${errores} con error`,
        datos: { ok, errores, total: validas.length },
        prev_hash: '0', hash: '0',
      });

      setResultado({ ok, errores });
      if (ok > 0) toast.success(`${ok} socios importados`);
      if (errores > 0) {
        toast.warning(`${errores} con error en la inserción`);
        // Marcar las filas que fallaron en el resultado
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
    return (
      <div>
        <h1>Importar socios</h1>
        <div className="banner warning">Solo los administradores pueden importar socios.</div>
      </div>
    );
  }

  const filasFiltradas = filasValidadas
    ? (filtroPreview === 'todos' ? filasValidadas
       : filtroPreview === 'ok' ? filasValidadas.filter((f) => f.ok)
       : filasValidadas.filter((f) => !f.ok))
    : [];

  const totalOk = filasValidadas?.filter((f) => f.ok).length || 0;
  const totalError = (filasValidadas?.length || 0) - totalOk;

  return (
    <div>
      <div className="main-header">
        <h1>Importar socios</h1>
      </div>

      <div className="banner info">
        Para cargar muchos socios de una vez:
        <ol style={{ marginTop: 6, marginLeft: 20 }}>
          <li>Descargá la plantilla Excel</li>
          <li>Completala con los datos de tus socios</li>
          <li>Subila acá para previsualizar</li>
          <li>Revisá los errores (si hay) y confirmá la importación</li>
        </ol>
      </div>

      {!filasValidadas && (
        <div className="card">
          <h3>1. Descargar plantilla</h3>
          <p style={{ color: 'var(--text-2)', marginBottom: 12, fontSize: 14 }}>
            La plantilla incluye los encabezados correctos y una hoja con instrucciones.
            Tipos de cuota actuales: {tipos.map((t) => t.nombre).join(', ') || 'ninguno'}.
            Cobradores: {cobradores.map((c) => c.nombre).join(', ') || 'ninguno'}.
          </p>
          <button onClick={descargarPlantilla}>📥 Descargar plantilla Excel</button>

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
              <strong>Importación finalizada:</strong> {resultado.ok} socios importados
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
                      <th>Nombre</th>
                      <th style={{ width: 70 }}>N°</th>
                      <th style={{ width: 100 }}>DNI</th>
                      <th style={{ width: 110 }}>Tipo cuota</th>
                      <th style={{ width: 110 }}>Cobrador</th>
                      <th style={{ width: 100 }}>Alta</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasFiltradas.slice(0, 100).map((f) => (
                      <tr key={f.fila} style={!f.ok ? { background: 'var(--danger-bg)' } : {}}>
                        <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{f.fila}</td>
                        <td>{f.ok ? '✓' : '✕'}</td>
                        <td>{f.raw.nombre || <em style={{ color: 'var(--text-3)' }}>(vacío)</em>}</td>
                        <td>{f.numero || f.raw.numero || '-'}</td>
                        <td>{f.raw.dni || '-'}</td>
                        <td>{f.raw.tipo_cuota || '-'}</td>
                        <td>{f.raw.cobrador_email || '-'}</td>
                        <td>{f.fecha_alta ? fmtDate(f.fecha_alta) : (f.raw.fecha_alta || '-')}</td>
                        <td style={{ fontSize: 12, color: f.ok ? 'var(--text-3)' : 'var(--danger)' }}>
                          {f.error || (f.ok ? '✓ Listo para importar' : '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filasFiltradas.length > 100 && (
                  <small style={{ color: 'var(--text-3)' }}>...y {filasFiltradas.length - 100} más</small>
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
                {importando ? 'Importando...' : `Importar ${totalOk} socios`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
