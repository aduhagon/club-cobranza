# Cobranza Club v13 - Facelift visual

Mejoras de UI/UX significativas que elevan la calidad percibida del producto:

## Lo nuevo

1. **Tipografía Inter** cargada vía Google Fonts. La app se ve igual en cualquier SO.
2. **Sistema de spacing tokens** consistente (--space-1 a --space-12, base 4/8).
3. **Iconos vectoriales** (lucide-react) reemplazan TODOS los emojis. Ahora se ven crisp en cualquier dispositivo.
4. **Skeletons** en lugar de "Cargando..." para mejor sensación de velocidad.
5. **Animaciones sutiles**: fadeIn en cards, modalIn en modales, toastIn en toasts, hover/active states pulidos.

## Mejoras adicionales

- **Sidebar reorganizado por secciones**: Operativo / Análisis / Procesos / Configuración
- **Iconos en cada ítem del menú** (Home, Wallet, Receipt, BarChart, Users, Settings, etc.)
- **Toast con íconos** lucide en lugar de caracteres
- **Contraste mejorado** en textos secundarios (de 3.4:1 a 5.2:1, cumple WCAG)
- **Focus visible** en TODOS los elementos interactivos (accesibilidad por teclado)
- **prefers-reduced-motion** respetado (usuarios sensibles al movimiento)
- **Hover states** más sutiles y profesionales
- **Sombras más finas** y consistentes con el sistema
- **Botones con altura mínima 36px** (touch-friendly)
- **Inputs con focus ring** azul difuminado (look moderno)

Todo lo del v12: importación masiva, reportes, estado de cuenta, pagos adelantados, asignación cobrador-socio, identidad del club.

## Variables de entorno
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

## Nuevas dependencias
- `lucide-react ^0.344.0` (~20kb, tree-shakeable, instalación automática en Vercel)
