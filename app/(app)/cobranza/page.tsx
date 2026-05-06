import { createClient } from "@/lib/supabase-server";
import CobranzaClient from "./CobranzaClient";

export default async function CobranzaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("*")
    .eq("auth_id", user!.id)
    .single();

  const { data: socios } = await supabase
    .from("socios")
    .select("id, numero, nombre, dni, telefono, debito_automatico, tipo_cuota_id")
    .is("fecha_baja", null)
    .order("nombre");

  const { data: tipos } = await supabase
    .from("tipos_cuota")
    .select("id, nombre")
    .eq("activo", true);

  const { data: valores } = await supabase
    .from("valores_cuota")
    .select("*");

  const { data: deudas } = await supabase
    .from("devengamientos")
    .select("*")
    .eq("estado", "pendiente");

  return (
    <CobranzaClient
      socios={socios || []}
      tipos={tipos || []}
      valores={valores || []}
      deudas={deudas || []}
      usuario={usuario}
    />
  );
}
