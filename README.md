# Cobranza Club v12

Importación masiva de deuda histórica:
- Pantalla "Importar" ahora con dos tabs: Socios + Deuda histórica
- Plantilla Excel descargable con DNI, período e importe
- Una fila = una cuota adeudada (formato simple para copy-paste)
- Validaciones: socio existe + tipo de cuota + período >= alta + sin duplicados
- Importes específicos por fila (útil cuando la cuota cambió de valor)
- Importación con saltar errores y seguir
- Reporte final con detalle de errores fila por fila
- Total importado en pesos para validación

Cierra el ciclo de carga inicial. Ya podés migrar el club real con socios + deuda en pocos clicks.

Más todo lo del v11.1: estado de cuenta detallado, reportes, importación de socios, pagos adelantados, asignación cobrador-socio.

## Variables de entorno
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
