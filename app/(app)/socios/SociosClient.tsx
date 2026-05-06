"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";

type Socio = {
  id: string;
  numero: number;
  nombre: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  tipo_cuota_id: string | null;
  fecha_alta: string;
  fecha_baja: string | null;
  motivo_baja: string | null;
  debito_automatico: boolean;
  tipos_cuota?: { nombre: string } | null;
};

type Tipo = { id: string; nombre: string };

export default function SociosClient({ socios, tipos }: { socios: Socio[]; tipos: Tipo[] }) {
  const [editing, setEditing] = useState<Socio | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<"activos" | "todos" | "bajas">("activos");
  const router = useRouter();

  let lista = socios;
  if (filtro === "activos") lista = lista.filter((s) => !s.fecha_baja);
  else if (filtro === "bajas") lista = lista.filter((s) => s.fecha_baja);

  if (search) {
    const q = search.toLowerCase();
    lista = lista.filter(
      (s) =>
        s.nombre.toLowerCase().includes(q) ||
        (s.dni || "").toLowerCase().includes(q) ||
        (s.telefono || "").toLowerCase().includes(q)
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-2xl font-medium">Socios</h1>
        <button
          onClick={() => setEditing("new")}
          className="px-3 py-1.5 bg-neutral-900 text-white rounded-md text-sm hover:bg-neutral-800"
        >
          + Nuevo socio
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 border border-neutral-300 rounded-md text-sm"
        />
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as any)}
          className="px-3 py-2 border border-neutral-300 rounded-md text-sm"
        >
          <option value="activos">Activos</option>
          <option value="todos">Todos</option>
          <option value="bajas">Solo bajas</option>
        </select>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="text-left px-3 py-2 w-12">N</th>
                <th className="text-left px-3 py-2">Nombre</th>
                <th className="text-left px-3 py-2 w-24">DNI</th>
                <th className="text-left px-3 py-2 w-28">Tipo</th>
                <th className="text-left px-3 py-2 w-24">Estado</th>
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-neutral-400">
                    Sin socios
                  </td>
                </tr>
              ) : (
                lista.map((s) => (
                  <tr key={s.id} className="border-t border-neutral-100">
                    <td className="px-3 py-2">{s.numero}</td>
                    <td className="px-3 py-2">{s.nombre}</td>
                    <td className="px-3 py-2">{s.dni}</td>
                    <td className="px-3 py-2">{s.tipos_cuota?.nombre || "-"}</td>
                    <td className="px-3 py-2">
                      {s.fecha_baja ? (
                        <span className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded">Baja</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Activo</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setEditing(s)}
                        className="text-xs text-neutral-600 hover:text-neutral-900"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <SocioModal
          socio={editing === "new" ? null : editing}
          tipos={tipos}
          ultimoNumero={socios.reduce((m, s) => Math.max(m, s.numero), 0)}
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function SocioModal({
  socio,
  tipos,
  ultimoNumero,
  onClose
}: {
  socio: Socio | null;
  tipos: Tipo[];
  ultimoNumero: number;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    nombre: socio?.nombre || "",
    dni: socio?.dni || "",
    telefono: socio?.telefono || "",
    email: socio?.email || "",
    tipo_cuota_id: socio?.tipo_cuota_id || "",
    fecha_alta: socio?.fecha_alta || new Date().toISOString().slice(0, 10),
    debito_automatico: socio?.debito_automatico || false
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const data: any = {
      nombre: form.nombre.trim(),
      dni: form.dni.trim() || null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      tipo_cuota_id: form.tipo_cuota_id || null,
      fecha_alta: form.fecha_alta,
      debito_automatico: form.debito_automatico
    };
    if (!data.nombre) {
      setError("Falta el nombre");
      setSaving(false);
      return;
    }
    let res;
    if (socio) {
      res = await supabase.from("socios").update(data).eq("id", socio.id);
    } else {
      data.numero = ultimoNumero + 1;
      res = await supabase.from("socios").insert(data);
    }
    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium mb-4">{socio ? "Editar socio" : "Nuevo socio"}</h3>
        <div className="space-y-3">
          {socio && (<div className="text-xs text-neutral-500">N de socio: {socio.numero} (no editable)</div>)}
          {!socio && (<div className="text-xs text-neutral-500">Proximo N: {ultimoNumero + 1}</div>)}
          <Field label="Nombre completo">
            <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="DNI">
              <input type="text" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm" />
            </Field>
            <Field label="Telefono">
              <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="5491145678901" className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm" />
            </Field>
          </div>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm" />
          </Field>
          <Field label="Tipo de cuota">
            <select value={form.tipo_cuota_id} onChange={(e) => setForm({ ...form, tipo_cuota_id: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm">
              <option value="">Sin tipo asignado</option>
              {tipos.map((t) => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
            </select>
          </Field>
          <Field label="Fecha de alta">
            <input type="date" value={form.fecha_alta} onChange={(e) => setForm({ ...form, fecha_alta: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.debito_automatico} onChange={(e) => setForm({ ...form, debito_automatico: e.target.checked })} />
            Adherido a debito automatico
          </label>
          {error && (<div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>)}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-neutral-300 rounded-md hover:bg-neutral-50">Cancelar</button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm bg-neutral-900 text-white rounded-md hover:bg-neutral-800 disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-neutral-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
