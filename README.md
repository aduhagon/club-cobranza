# Cobranza del Club

Sistema de cobranza de cuotas sociales para clubes de barrio.

## Stack
- Next.js 14 (App Router)
- Supabase (base de datos + autenticacion)
- Tailwind CSS

## Variables de entorno (configurar en Vercel)
- NEXT_PUBLIC_SUPABASE_URL: URL del proyecto en Supabase
- NEXT_PUBLIC_SUPABASE_ANON_KEY: anon key del proyecto

## Estructura
- app/login - Pantalla de ingreso
- app/(app)/dashboard - Inicio
- app/(app)/cobranza - Cobrar una cuota
- app/(app)/socios - ABM de socios (solo admin)
- app/(app)/recibos - Listado de recibos
- lib/ - Clientes Supabase
- components/NavBar.tsx - Barra de navegacion
- middleware.ts - Proteccion de rutas

## Roles
Los roles se asignan en la tabla usuarios:
- admin: acceso total
- cobrador: solo cobranza y sus recibos
- consulta: solo lectura
