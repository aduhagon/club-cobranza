import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import NavBar from "@/components/NavBar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("*")
    .eq("auth_id", user.id)
    .single();

  if (!usuario) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-medium mb-2">Cuenta sin permisos</h2>
          <p className="text-sm text-neutral-600">
            Tu email esta autenticado pero no tiene un rol asignado en el club. Contacta al administrador.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar nombre={usuario.nombre} rol={usuario.rol} />
      <main className="max-w-6xl mx-auto p-4">{children}</main>
    </div>
  );
}
