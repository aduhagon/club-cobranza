import { createClient } from "@/lib/supabase-server";

export default async function RecibosPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: usuario } = await supabase.from("usuarios").select("*").eq("auth_id", user!.id).single();

  let query = supabase.from("pagos").select("*, socios(numero, nombre)").order("fecha_pago", { ascending: false }).order("numero", { ascending: false }).limit(100);
  if (usuario?.rol === "cobrador") query = query.eq("cobrador_id", usuario.id);
  const { data: pagos } = await query;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium">{usuario?.rol === "cobrador" ? "Mis recibos" : "Recibos emitidos"}</h1>
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="text-left px-3 py-2 w-24">N Recibo</th>
                <th className="text-left px-3 py-2 w-24">Fecha</th>
                <th className="text-left px-3 py-2">Socio</th>
                <th className="text-left px-3 py-2 w-32">Cobrador</th>
                <th className="text-left px-3 py-2 w-28">Medio</th>
                <th className="text-right px-3 py-2 w-24">Importe</th>
                <th className="text-left px-3 py-2 w-20">Estado</th>
              </tr>
            </thead>
            <tbody>
              {!pagos || pagos.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-neutral-400">Sin recibos</td></tr>
              ) : (
                pagos.map((p: any) => (
                  <tr key={p.id} className={`border-t border-neutral-100 ${p.anulado ? "text-neutral-400 line-through" : ""}`}>
                    <td className="px-3 py-2 font-mono">#{String(p.numero).padStart(6, "0")}</td>
                    <td className="px-3 py-2">{fmtDate(p.fecha_pago)}</td>
                    <td className="px-3 py-2">{p.socios?.nombre}</td>
                    <td className="px-3 py-2">{p.cobrador}</td>
                    <td className="px-3 py-2">{p.medio}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.importe)}</td>
                    <td className="px-3 py-2">
                      {p.anulado ? (<span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">Anulado</span>) : (<span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Vigente</span>)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function fmtDate(d: string) { if (!d) return ""; return new Date(d + "T00:00:00").toLocaleDateString("es-AR"); }
function fmtMoney(n: number) { return "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
