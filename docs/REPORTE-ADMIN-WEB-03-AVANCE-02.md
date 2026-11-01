# Reporte de avance 02 — Admin Web 03

Fecha: 01/11/2026, America/La_Paz. Plan: SCRUM-85.
Rama local: `codex/SCRUM-85-orders`.

## Resultado

Supabase está disponible nuevamente. Se verificó el esquema real de pedidos y se sustituyeron las cifras de demostración del resumen por una consulta administrativa real. Este es un avance parcial del sprint, no su cierre.

## Pedidos: SCRUM-9 y SCRUM-12

- Se corrigió el importe para utilizar `orders.total`, en lugar del campo inexistente `total_amount`.
- Se añadieron filtros por estado y fechas, con comienzo inclusivo y fin exclusivo del día siguiente en horario de Bolivia. El filtro reinicia la página y rechaza intervalos invertidos.
- Se muestran los seis estados del esquema real y el número del pedido junto con su UUID completo.
- El detalle incorpora historial paginado, observación, fecha, actor y recuperación ante errores.
- Se reforzó la prueba de precios históricos para comprobar también el total y se añadió un caso de recuperación del historial.

La búsqueda por cliente continúa pendiente. No se habilitaron cambios de estado desde la interfaz: la función existente permite transiciones de regreso a `confirmed` desde estados finales y registra dos eventos cuando se envía una observación, porque tanto el trigger como la función insertan historial. Ambos hallazgos fueron confirmados inspeccionando las definiciones SQL; no se provocaron sobre pedidos reales. Están registrados en SCRUM-12.

## Resumen real: SCRUM-34

Se creó y desplegó `public.admin_order_metrics()` mediante la migración `admin_order_metrics`. El archivo reproducible es `supabase/migrations/20261101190000_admin_order_metrics.sql`.

Los cuatro indicadores son pedidos creados hoy, pedidos actualmente en producción, pedidos entregados hoy e importe de los pedidos entregados hoy. Las fechas se calculan en `America/La_Paz`. El importe representa valor de pedidos; no se presenta como dinero cobrado. Se retiraron las tendencias y la capacidad semanal ficticias.

La consulta produce una sola instantánea y exige un perfil administrador activo. Se revocó la ejecución a PUBLIC y anon; una sesión autenticada debe superar además la comprobación del perfil. No se incorporaron claves administrativas al frontend.

La interfaz incluye carga, actualización manual, hora de consulta y error. Cuando falla la consulta muestra datos no disponibles; los ceros solo proceden de una respuesta válida.

## Verificación

- TypeScript y compilación de producción aprobados (85 módulos).
- Vitest: **42 pruebas aprobadas en 5 archivos**.
- Seis pruebas nuevas PGlite aprobadas: base vacía; límites de medianoche y exclusión de cancelados; rechazo de cliente, administrador inactivo, identidad ausente y rol anónimo.
- Se incorporó esta suite de base de datos al comando `test:db` utilizado por CI.
- Regresión de base de datos completa: **21 aprobadas y 1 omitida** entre catálogo/inventario y métricas. La omitida requiere dos sesiones PostgreSQL reales para concurrencia; PGlite usa una sola conexión. Total ejecutado con Vitest: **63 aprobadas**, sin fallos finales.
- Comprobación en Supabase usando el rol `authenticated` y un perfil administrador real: los cuatro indicadores devolvieron cero. Se verificó el rechazo de ejecución sin identidad y con rol anónimo. Las comprobaciones se ejecutaron dentro de transacciones revertidas, sin modificar datos de negocio.
- `git diff --check`: sin errores de espacios.

Los casos de interfaz utilizan respuestas simuladas. Las pruebas PGlite utilizan un esquema mínimo aislado. La comprobación remota de autorización es SQL, no una prueba de inicio de sesión ni de navegador completo. No se realizó revisión visual en este avance; Playwright no está instalado en el proyecto. El script visual existente se actualizó para reconocer la nueva consulta de métricas.

La primera ejecución de la prueba reforzada del importe falló por la normalización del espacio no separable de la moneda; se ajustó la aserción para comparar el texto original y la suite final pasó.

## Observaciones técnicas

La compilación advierte que el archivo JavaScript principal supera 500 kB (503,80 kB antes de gzip); la separación de módulos queda pendiente. Node emite una advertencia sobre localstorage durante Vitest, sin fallos finales.

El asesor de seguridad señala la función nueva por ser SECURITY DEFINER ejecutable por sesiones autenticadas. Es deliberado: la autorización administrativa se comprueba dentro de la función y está cubierta por pruebas. También permanecen cuatro avisos de funciones previas y la protección de contraseñas filtradas desactivada. Referencias: [funciones con privilegios elevados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) y [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Publicación y pendientes

La función de métricas sí está desplegada en Supabase. El frontend y sus pruebas permanecen locales; este avance no tiene commit, push ni PR nuevo. Se conservaron los cambios previos del espacio de trabajo.

Se mantienen pendientes la corrección y prueba de transiciones, filtro por cliente, cotizaciones y conversión a pedido, revisión visual e integración completa. SCRUM-34 requiere aceptación del equipo. No se cerraron historias ni se declararon pruebas de carga, estrés o recuperación que no se ejecutaron.
