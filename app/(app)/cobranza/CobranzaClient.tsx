"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";

const MEDIOS_PAGO = ["Efectivo","Transferencia","MercadoPago","Debito automatico","Tarjeta de debito","Tarjeta de credito","Cheque"];

type Socio = { id: string; numero: number; nombre: string; dni: string | null; telefono: string | null; debito_automatico: boolean; tipo_cuota_id: string | null; };
type Tipo = { id: string; nombre: string };
type Valor = { tipo_id: string; desde: string; importe: number };
type Deuda = { id: string; socio_id: string; tipo_id: string; periodo: string; importe: number };

export default function CobranzaClient({ socios, tipos, valores, deudas, usuario }: { socios: Socio[]; tipos: Tipo[]; valores: Valor[]; deudas: Deuda[]; usuario: any; }) {
  const [socioId, setSocioId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [medio, setMedio] = useState("Efectivo");
  const [importe, setImporte] = useState("");
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string; numero?: number } | null>(null);
  const router = useRouter();

  const socio = socios.find((s) => s.id === socioId);
  const deudasSocio = deudas.filter((d) => d.socio_id === socioId).sort((a, b) => a.periodo.localeCompare(b.periodo));

  const valorSugerido = useMemo(() => {
    if (!tipoId || !periodo) return null;
    const v = valores.filter((x) => x.tipo_id === tipoId && x.desde <= periodo).sort((a, b) => b.desde.localeCompare(a.desde))[0];
    return v?.importe ?? null;
  }, [tipoId, periodo, valores]);

  function onSelectSocio(id: string) {
    setSocioId(id);
    const s = socios.find((x) => x.id === id);
    if (s) {
      if (s.tipo_cuota_id) setTipoId(s.tipo_cuota_id);
      if (s.debito_automatico) setMedio("Debito automatico");
      else setMedio("Efectivo");
    }
  }

  async function cobrar() {
    if (!socioId || !tipoId || !periodo || !fechaPago || !importe) {
      setMensaje({ tipo: "error", texto: "Completa todos los campos" });
      return;
    }
    setSaving(true);
    setMensaje(null);
    const supabase = createClient();

    let devengamientoId: string | null = null;
    const existente = deudas.find((d) => d.socio_id === socioId && d.tipo_id === tipoId && d.periodo === periodo);
    if (existente) {
      devengamientoId = existente.id;
    } else {
      const { data: nuevoDev, error: errDev } = await supabase
        .from("devengamientos")
        .insert({ socio_id: socioId, tipo_id: tipoId, periodo, importe: parseFloat(importe), estado: "pendiente", origen: "cobranza_directa" })
        .select().single();
      if (errDev) { setMensaje({ tipo: "error", texto: errDev.message }); setSaving(false); return; }
      devengamientoId = nuevoDev.id;
    }

    const { data: ultimo } = await supabase.from("pagos").select("numero").order("numero", { ascending: false }).limit(1);
    const proximoNumero = ultimo && ultimo.length > 0 ? ultimo[0].numero + 1 : 1;

    const { data: pago, error: errPago } = await supabase
      .from("pagos")
      .insert({ numero: proximoNumero, socio_id: socioId, fecha_pago: fechaPago, medio, importe: parseFloat(importe), cobrador: usuario.nombre, cobrador_id: usuario.id, anulado: false })
      .select().single();
    if (errPago) { setMensaje({ tipo: "error", texto: errPago.message }); setSaving(false); return; }

    await supabase.from("pagos_devengamientos").insert({ pago_id: pago.id, devengamiento_id: devengamientoId });
    await supabase.from("devengamientos").update({ estado: "pagado", pago_id: pago.id }).eq("id", devengamientoId);

    setMensaje({ tipo: "ok", texto: `Recibo N ${proximoNumero} emitido para ${socio?.nombre}`, numero: proximoNumero });
    setSaving(false);
  }

  function nuevoCobro() {
    setSocioId(""); setTipoId(""); setImporte(""); setMensaje(null);
    router.refresh();
  }

  function enviarWhatsApp() {
    if (!socio || !mensaje || mensaje.tipo !== "ok") return;
    const texto = `Hola ${socio.nombre.split(" ")[0]}, te confirmo el pago de tu cuota por *${fmtMoney(parseFloat(importe))}* (${fmtMes(periodo)}). Recibo N ${mensaje.numero}. Gracias!`;
    const tel = (socio.telefono || "").replace(/[^0-9]/g, "");
    const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium">Cobrar cuota</h1>
      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
        <Field label="Socio">
          <select value={socioId} onChange={(e) => onSelectSocio(e.target.value)} disabled={mensaje?.tipo === "ok"} className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm">
            <option value="">Seleccionar socio...</option>
            {socios.map((s) => (<option key={s.id} value={s.id}>{s.numero} - {s.nombre}{s.debito_automatico ? " [DA]" : ""}</option>))}
          </select>
        </Field>
        {deudasSocio.length > 0 && !mensaje && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-800">
            Este socio tiene {deudasSocio.length} cuota(s) pendiente(s): {deudasSocio.map((d) => fmtMes(d.periodo)).join(", ")}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Tipo de cuota">
            <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} disabled={mensaje?.tipo === "ok"} className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm">
              <option value="">Seleccionar...</option>
              {tipos.map((t) => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
            </select>
          </Field>
          <Field label="Periodo (mes)">
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} disabled={mensaje?.tipo === "ok"} className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm" />
          </Field>
          <Field label="Fecha de pago">
            <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} disabled={mensaje?.tipo === "ok"} className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm" />
          </Field>
          <Field label="Medio de pago">
            <select value={medio} onChange={(e) => setMedio(e.target.value)} disabled={mensaje?.tipo === "ok"} className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm">
              {MEDIOS_PAGO.map((m) => (<option key={m}>{m}</option>))}
            </select>
          </Field>
        </div>
        <Field label="Importe">
          <div className="flex gap-2">
            <input type="number" value={importe} onChange={(e) => setImporte(e.target.value)} disabled={mensaje?.tipo === "ok"} placeholder="0" className="flex-1 px-3 py-2 border border-neutral-300 rounded-md text-sm" />
            {valorSugerido && !mensaje && (
              <button onClick={() => setImporte(String(valorSugerido))} className="px-3 py-1.5 text-xs border border-neutral-300 rounded-md hover:bg-neutral-50">
                Usar {fmtMoney(valorSugerido)}
              </button>
            )}
          </div>
        </Field>
        {mensaje && (
          <div className={`text-sm px-3 py-2 rounded-md ${mensaje.tipo === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{mensaje.texto}</div>
        )}
        <div className="flex gap-2 justify-end flex-wrap">
          {mensaje?.tipo === "ok" ? (
            <>
              <button onClick={enviarWhatsApp} className="px-3 py-2 text-sm border border-green-600 text-green-700 rounded-md hover:bg-green-50">Enviar por WhatsApp</button>
              <button onClick={nuevoCobro} className="px-4 py-2 bg-neutral-900 text-white rounded-md text-sm hover:bg-neutral-800">Nuevo cobro</button>
            </>
          ) : (
            <button onClick={cobrar} disabled={saving} className="px-4 py-2 bg-neutral-900 text-white rounded-md text-sm hover:bg-neutral-800 disabled:opacity-50">
              {saving ? "Procesando..." : "Cobrar y emitir recibo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label className="block text-xs text-neutral-600 mb-1">{label}</label>{children}</div>);
}
function fmtMoney(n: number) {
  return "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function fmtMes(p: string) {
  if (!p) return "";
  const [y, m] = p.split("-");
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return meses[parseInt(m) - 1] + " " + y;
}
