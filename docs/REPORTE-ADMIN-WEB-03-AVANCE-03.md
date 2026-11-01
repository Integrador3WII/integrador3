# Reporte de entrega técnica — Admin Web 03

Fecha: 01/11/2026, America/La_Paz. Plan: [SCRUM-85](https://cuquinata267.atlassian.net/browse/SCRUM-85).
Rama: `codex/SCRUM-85-orders`. Este reporte actualiza los pendientes de los avances 01 y 02; no sustituye la aceptación del equipo.

## Funcionalidades entregadas

| Historia | Implementación y resultado |
|---|---|
| SCRUM-9, pedidos | Listado paginado, búsqueda por UUID, filtros por nombre del cliente, estado y fechas en Bolivia. Carga, vacío, errores y reintento. Consulta de cliente por relación real de Supabase. |
| SCRUM-12, estados | Detalle con cliente, entrega, prendas e importes históricos. Cambios permitidos y observación; cancelación con motivo obligatorio. Recarga del detalle, listado e historial tras guardar. |
| SCRUM-30, cotizaciones | Sección independiente, filtros, detalle y trazabilidad. Valoración de cada prenda, servicios, envío, descuento y vigencia. Validación en servidor, cálculo decimal en Bs y congelación al enviar. El envío genera la notificación interna existente; no se implementó correo externo. |
| SCRUM-32, conversión | Acción disponible para cotizaciones aprobadas. Conversión en una transacción con stock, movimiento y tarea de producción; el reintento retorna el mismo pedido. Identificador mostrado para consultarlo en Pedidos. |
| SCRUM-34, resumen | Indicadores reales ya desplegados: pedidos de hoy, en producción, entregados e importe entregado. Se distingue el valor de pedidos del dinero cobrado. |
| SCRUM-13, integración pendiente | Se instaló la API que faltaba para movimientos manuales de inventario, con UUID de operación, saldo resultante, validación y reintento idempotente. |

La aprobación de una oferta sigue perteneciendo al cliente: la web administrativa no incorpora un botón para aprobar en su nombre. Las solicitudes iniciales se originan en el flujo cliente; esta entrega administra las solicitudes recibidas.

## Correcciones de servidor

1. La función de estados ahora usa una lista explícita de transiciones válidas. Entregado y Cancelado no pueden volver a Confirmado. Se conservan las reglas de tareas completas y calidad aprobada.
2. La observación se incorpora al único registro de historial creado por el trigger. Se eliminó la inserción duplicada desde la función.
3. La cancelación exige administrador y motivo, bloquea el pedido y devuelve stock una vez. Se comprueba la existencia del inventario y se ordenan los bloqueos por variante.
4. Se revocó la escritura directa de pedidos, prendas del pedido, servicios e historial para los roles de API. Las operaciones autorizadas pasan por funciones con comprobación de identidad.
5. Se corrigió la auditoría de inventario: su identificador es `product_variant_id`, no `id`.
6. Las prendas y servicios de una oferta enviada son inmutables. Los cambios de sus líneas se serializan con la cotización padre. No se permite reabrir una oferta finalizada ni cambiar su estado directamente desde el cliente.
7. La valoración valida importes, descuento, vigencia y que se hayan incluido todas las prendas exactamente una vez. Congela precios de productos y servicios y genera la trazabilidad existente.
8. La respuesta del cliente valida identidad activa, propiedad, vencimiento y tipo enum. Se corrigió el error previo de asignar un texto a `quote_status`.
9. La conversión rechaza cotizaciones vacías y toma los bloqueos de inventario en orden consistente. Se conserva la restricción única existente sobre `orders.quote_id`.

## Despliegue en Supabase

Proyecto: `vqrzvtxvssvajafgoboc`. Migraciones aplicadas en esta entrega:

- `admin_order_quote_workflows`: archivo `20261101184030_admin_order_quote_workflows.sql`.
- `admin_inventory_movement_api`: archivo `20261101185431_admin_inventory_movement_api.sql`.

`admin_order_metrics` ya estaba aplicada desde el avance 02. No se utilizaron claves administrativas en el frontend.

La migración amplia `20261008005250_admin_catalog_inventory.sql` continúa sin aplicarse completa. Se instaló una alternativa aditiva limitada para movimientos: columnas, índice de idempotencia y funciones. Se preservaron los permisos directos existentes de inventario y las políticas de catálogo; por tanto, las restricciones adicionales de esa migración amplia **no se declaran activas**. Sus pruebas locales permanecen separadas de las pruebas del contrato desplegado.

## Evidencia de pruebas

### Automatizadas locales

- **51 pruebas Vitest** en seis archivos: interfaz, validaciones, filtros, errores, precios, estados, cotizaciones y métricas.
- **32 pruebas PostgreSQL aisladas**: 15 de la propuesta amplia de catálogo/inventario, 6 de métricas y 11 del flujo desplegado de pedidos/cotizaciones/inventario. La suite de flujos usa un esquema exportado sin datos, con Auth sustituido por una función de identidad para pruebas. No es un test del servicio Auth real.
- **Total: 83 pruebas aprobadas**, sin pruebas omitidas en estas suites. La comprobación antes omitida de concurrencia se trasladó a una prueba real independiente.
- TypeScript y compilación de producción aprobados. `npm audit` quedó con **0 vulnerabilidades** después de actualizar las correcciones compatibles de Vite/Vitest; Playwright quedó fijado en 1.64.1.

### Concurrencia en PostgreSQL real

Script: `supabase/tests/workflows-postgres.cjs`. Usa dos conexiones independientes en un contenedor temporal y lo elimina al terminar.

| Escenario | Esperado y obtenido |
|---|---|
| Dos conversiones simultáneas | Un pedido, una reserva de stock, una tarea; stock 10 → 8. |
| Dos cancelaciones simultáneas | Una devolución, un evento de historial; stock 8 → 10. |
| Dos salidas de 4 con stock 5 | Una aceptada y otra rechazada; stock final 1. |
| Dos entradas repetidas con el mismo UUID | Una operación aplicada; stock 1 → 4. |

El script se verificó con la imagen PostgreSQL local de Bitnami. Los problemas iniciales de preparación del contenedor (servidor temporal de arranque, contraseña de la conexión y SKU del fixture) se corrigieron; los cuatro escenarios finales pasaron.

### Integración SQL en el Supabase real

Se ejecutaron transacciones de prueba con rollback y comprobaciones que lanzan errores si no se cumple el resultado:

- Enviar oferta → aprobar → convertir → repetir conversión → cancelar → repetir cancelación.
- Total esperado **Bs 95,50**, stock restituido a **10**, historial de cancelación único y reapertura terminal rechazada.
- Entrada manual con reintento, salida superior al stock y rechazo de identidad no autorizada.
- RLS de pedidos: administrador, clientes A/B, operador, identidad desconocida y anónimo. Cada cliente solo pudo leer su propio pedido; el operador pudo consultar por su autorización de personal, pero no escribir directamente.
- El script reproducible de RLS está en `supabase/tests/orders-rls-remote.sql`.

Los registros temporales, incluidas las cuentas de prueba de RLS, fueron revertidos. No se enviaron correos ni se dejaron pedidos ficticios. Las secuencias PostgreSQL pueden avanzar aun cuando la transacción se revierte.

### Navegador y presentación

Microsoft Edge, con respuestas HTTP interceptadas y datos ficticios: estos resultados **no equivalen a una sesión E2E autenticada contra Supabase**.

- Catálogo e inventario: regresión visual y de interacción en 1440, 390 y 320 px.
- Resumen y flujos nuevos: 1440, 1366, 390 y 320 px; sin scroll vertical en el resumen de escritorio ni desbordamiento horizontal en móvil.
- Se probaron cambio de estado e historial, envío de oferta, conversión, diálogo y modo oscuro.
- Se detectó y corrigió la pérdida de foco cuando el diálogo reemplazaba su formulario después de guardar; Escape vuelve a funcionar.
- Capturas locales: `e2e/artifacts/admin-web-03/`, excluidas de Git. Se inspeccionaron visualmente el resumen de escritorio y la lista móvil oscura.

## Reproducción

```text
npm run typecheck:admin
npm run test:admin
npm --workspace apps/admin-web run test:db
npm --workspace apps/admin-web run test:concurrency
npm run build:admin
npm audit
```

Para navegador, iniciar `npm --workspace apps/admin-web run dev -- --host 127.0.0.1 --port 5174 --strictPort`, luego ejecutar los scripts `e2e/admin-catalog.visual.cjs` y `e2e/admin-workflows.visual.cjs`.

## Límites y aceptación

- Revisión por otro integrante, aceptación del PO/tester y merge no se sustituyen por estas pruebas. No se marcaron historias Finalizado ni se cerró un sprint nativo.
- No se ejecutaron cargas sostenidas, estrés, volumen ni recuperación de infraestructura. Las pruebas de errores/reintentos y concurrencia descritas no se presentan como esas pruebas.
- La compilación conserva una advertencia por un bloque JavaScript de aproximadamente 517 kB antes de gzip; la separación de módulos sigue siendo una mejora de rendimiento.
- El asesor de Supabase muestra avisos por funciones SECURITY DEFINER accesibles a sesiones autenticadas; las funciones utilizadas validan el perfil dentro del servidor. Permanece el aviso previo de protección de contraseñas filtradas desactivada. [Referencia de funciones](https://supabase.com/docs/guides/database/functions), [asesor de seguridad](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- El repositorio no es un instalador de una base vacía. Los fixtures son exclusivamente de pruebas y las migraciones deben reconciliarse con el historial remoto antes de aplicarlas a otro entorno.

La publicación de código y el enlace del PR se registran en SCRUM-85 y en la respuesta de entrega.
