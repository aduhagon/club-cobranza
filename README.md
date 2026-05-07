# Cobranza Club v11.1

Patch de v11: corrección del cálculo de morosidad y saldo vencido.

Bug corregido: el reporte de morosidad y el estado de cuenta consideraban como deuda las
cuotas adelantadas (con período futuro al mes actual). Ahora:
- Morosidad: cuenta solo cuotas con período <= mes actual
- Estado de cuenta: muestra "Saldo vencido" como dato principal y "Saldo total (con futuras)" como referencia
- Tabla del estado: las cuotas futuras se muestran con badge "Futuro" y opacidad reducida

Más todo lo del v11: estado de cuenta detallado, reportes, importación masiva, pagos adelantados, asignación cobrador-socio.

## Variables de entorno
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
