"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";

const itemsPorRol: Record<string, { href: string; label: string }[]> = {
  admin: [
    { href: "/dashboard", label: "Inicio" },
    { href: "/cobranza", label: "Cobrar" },
    { href: "/recibos", label: "Recibos" },
    { href: "/socios", label: "Socios" }
  ],
  cobrador: [
    { href: "/cobranza", label: "Cobrar" },
    { href: "/recibos", label: "Mis recibos" }
  ],
  consulta: [
    { href: "/dashboard", label: "Inicio" },
    { href: "/recibos", label: "Recibos" }
  ]
};

export default function NavBar({ nombre, rol }: { nombre: string; rol: string }) {
  const path = usePathname();
  const router = useRouter();
  const items = itemsPorRol[rol] || [];

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const rolLabel = rol === "admin" ? "Administrador" : rol === "cobrador" ? "Cobrador" : "Consulta";

  return (
    <header className="bg-white border-b border-neutral-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-neutral-700">
          <span>{nombre}</span>
          <span className="ml-2 px-2 py-0.5 bg-neutral-100 rounded text-xs">{rolLabel}</span>
        </div>
        <button onClick={logout} className="text-xs text-neutral-600 hover:text-neutral-900">
          Cerrar sesion
        </button>
      </div>
      <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
        {items.map((it) => {
          const active = path === it.href || path.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`px-3 py-2 text-sm border-b-2 ${
                active
                  ? "border-neutral-900 text-neutral-900 font-medium"
                  : "border-transparent text-neutral-500 hover:text-neutral-900"
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
