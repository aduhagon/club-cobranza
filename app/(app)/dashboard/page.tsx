import { createClient } from "@/lib/supabase-server";

export default async function DashboardPage() {
  const supabase = createClient();
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);

  const [{ count: sociosActivos }, { count: recibosMes }, { data: sumMes }] = await Promise.all([
    supabase.from("socios").select("*", { count: "exact", head: true }).is("fecha_baja", null),
    supabase
      .from("pagos")
      .select("*", { count: "exact", head: true })
      .gte("fecha_pago", inicioMes)
      .eq("anulado", false),
    supabase
      .from("pagos")
      .select("importe")
      .gte("fecha_pago", inicioMes)
      .eq("anulado", false)
  ]);

  const totalMes = (sumMes || []).reduce((s: number, p: any) => s + Number(p.importe), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium">Inicio</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card label="Socios activos" value={String(sociosActivos ?? 0)} />
        <Card label="Cobros del mes" value={String(recibosMes ?? 0)} />
        <Card label="Recaudado este mes" value={fmt(totalMes)} />
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-2xl font-medium mt-1">{value}</div>
    </div>
  );
}

function fmt(n: number) {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
