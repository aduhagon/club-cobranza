import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import SociosClient from "./SociosClient";

export default async function SociosPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: usuario } = await supabase.from("usuarios").select("rol").eq("auth_id", user!.id).single();

  if (usuario?.rol !== "admin") redirect("/dashboard");

  const { data: socios } = await supabase
    .from("socios")
    .select("*, tipos_cuota(nombre)")
    .order("numero", { ascending: true });

  const { data: tipos } = await supabase
    .from("tipos_cuota")
    .select("*")
    .eq("activo", true)
    .order("nombre");

  return <SociosClient socios={socios || []} tipos={tipos || []} />;
}
