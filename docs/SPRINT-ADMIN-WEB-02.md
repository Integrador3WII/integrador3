# Admin Web 02 — Catálogo e inventario

Fecha de verificación: 7 de octubre de 2026 (America/La_Paz). Responsable de implementación: Dev2.

## Resultado y estado real

Implementación local lista para revisión. **No desplegada en Supabase ni publicada en GitHub.** La revisión automática rechazó aplicar la migración remota por su impacto en permisos y auditoría. Se solicitó autorización explícita y no se eludió el bloqueo. Una lectura posterior confirmó que `admin_catalog_access()` no existe todavía y que productos, variantes y movimientos continúan en cero filas. No se modificaron usuarios, pedidos ni cotizaciones.

Plan Jira: [SCRUM-72](https://cuquinata267.atlassian.net/browse/SCRUM-72). Historias existentes ampliadas, sin duplicarlas: [SCRUM-11 / HU05](https://cuquinata267.atlassian.net/browse/SCRUM-11) y [SCRUM-13 / HU06](https://cuquinata267.atlassian.net/browse/SCRUM-13). Se conservaron la épica SCRUM-25 y el plan global SCRUM-47. Se crearon SCRUM-73 y SCRUM-74 para QA independiente. El tester todavía no es asignable en Jira.

El conector no ofrece crear/iniciar sprints nativos. El timebox de dos semanas y los 10 puntos son propuestas por confirmar, no fechas ni capacidad comprometidas. El flujo disponible solo ofrece «En revisión» y «Finalizado»; no se cerraron incidencias ni se inventó la aceptación.

Rama local: `codex/SCRUM-11-SCRUM-13-catalog-inventory`. Sin commit, push, PR ni revisión por pares realizados en este incremento.

## Funcionalidad implementada

- Catálogo independiente con categorías, creación de productos como borrador, edición, variantes por color/talla, SKU, precio y estados. Publicación condicionada a una variante activa.
- Baja lógica: los registros no se borran desde el panel. Los productos de categorías inactivas dejan de ser públicos con la nueva política.
- Inventario por variante con paginación y búsqueda por SKU; entradas/salidas e historial con fecha, autor, motivo y saldo al registrar.
- Operación de inventario transaccional: bloqueo por variante, protección contra saldos negativos, UUID de operación y comprobación de payload en reintentos.
- Operaciones pendientes conservadas en la pestaña del navegador, separadas por usuario; los errores de red no permiten cambiar el payload antes de reconfirmar. Cerrar la pestaña elimina esa recuperación local: revisar el historial antes de repetir manualmente una operación.
- Permisos de administrador activo comprobados por servidor; no hay credenciales privilegiadas en el frontend. Las funciones públicas nuevas usan SECURITY INVOKER; el tramo privilegiado es privado y valida al actor.
- Escritorio con desplazamiento dentro del listado; tarjetas en móvil, formularios accesibles por teclado, estados de carga/error/vacío y modo oscuro.
- El dashboard general identifica sus métricas como demostración; no simula cifras actuales de negocio.

## Migración preparada (no aplicada)

Archivo: `supabase/migrations/20261008005250_admin_catalog_inventory.sql`, generado con el CLI y fechado en UTC.

1. Corrige la función de auditoría para usar `product_variant_id` en inventario, manteniendo `id` para las demás tablas. La función anterior fallaba al insertar inventario porque intentaba leer una columna inexistente.
2. Agrega unicidad normalizada de SKU y combinación producto/color/talla.
3. Agrega identificador de operación, saldo resultante e índice de historial. Los movimientos antiguos conservan esos campos nulos; las operaciones existentes de pedidos no necesitan proporcionar los campos nuevos.
4. Revoca borrado físico del catálogo y escritura directa del saldo/historial para clientes autenticados. Cualquier integración que actualmente actualice stock directamente deberá cambiar a la operación segura. Las funciones existentes con privilegios de servidor no dependen de esos permisos de cliente.
5. Ajusta lectura pública por categoría activa y agrega validación al publicar un producto.
6. Crea comprobación de acceso y operación segura de inventario, con privilegios explícitos.

No ejecutar contra una base vacía: requiere el esquema preexistente de TextilFlow. La fixture de pruebas no es un baseline de despliegue. Antes de aplicar, revisar integraciones consumidoras, respaldo y la autorización solicitada.

## Evidencia de verificación local

| Comprobación | Resultado | Límite |
| --- | --- | --- |
| Tipos TypeScript | Correcto | Verificación local |
| Interfaz y lógica | 28 pruebas aprobadas | Respuestas Supabase simuladas |
| PostgreSQL aislado | 15 pruebas aprobadas, 1 omitida explícitamente | Fixture parcial del catálogo; no base remota |
| Compilación de producción | Correcta | No implica despliegue |
| Dependencias | 0 vulnerabilidades reportadas tras actualizar | Resultado puntual del informe de npm |
| Navegador | Recorrido con fixtures HTTP, escritorio 1440 y móvil 390/320 | No sustituye integración real ni aceptación del tester |

Las pruebas PostgreSQL ejecutan la migración real sobre un esquema aislado. Verifican auditoría, duplicados, validaciones, publicación, entradas, salidas, insuficiencia de stock, cantidades inválidas, reintentos, roles y reconciliación de saldos. PGlite dispone de una sola conexión: la prueba CA5 de concurrencia se marca como omitida, no como aprobada. [Documentación de PGlite](https://pglite.dev/docs/).

La comprobación visual intercepta todas las solicitudes a Supabase y utiliza una sesión ficticia; no crea cuentas ni datos remotos. Script reproducible: `e2e/admin-catalog.visual.cjs` (requiere Playwright y Edge; acepta `PLAYWRIGHT_MODULE` y `ADMIN_PREVIEW_URL`). Capturas: `e2e/artifacts/admin-web-02/`, excluidas de Git.

El workflow de GitHub se actualizó con instalación reproducible y pruebas de BD aisladas, pero no se ejecutó una acción remota ni se abrió PR. La herramienta de pruebas quedó en Vitest 4.1.11 tras detectar vulnerabilidades en la versión anterior.

## Pendientes antes de aceptar las historias

1. Autorizar y aplicar la migración; comprobar permisos, API y CRUD con la cuenta de prueba real. Volver a ejecutar asesores de seguridad después del despliegue.
2. HU05 CA4: cotización con precio Bs 50 → cambiar precio base a Bs 60 → comprobar que el precio histórico queda en 50. También verificar conservación de pedidos existentes al desactivar. Estos flujos completos no están cubiertos por la fixture parcial y no se declaran aprobados.
3. HU06 CA5: dos sesiones reales con stock 1, ambas retirando 1; esperar un éxito, un rechazo, stock 0 y exactamente un movimiento. Usar un entorno de integración, no datos de negocio.
4. QA independiente, revisión por pares, PR y aceptación. No marcar Done antes de resolver los controles y defectos.
5. Dar acceso Jira al tester y configurar el sprint nativo con fechas y capacidad confirmadas.

## Advertencias preexistentes de Supabase

El asesor previo detectó cuatro funciones públicas SECURITY DEFINER de cotizaciones/pedidos y protección de contraseñas filtradas desactivada. Se conservaron fuera del alcance de este sprint, sin reinterpretar estos avisos como vulnerabilidades explotables confirmadas. Revisar sus permisos y controles: [funciones privilegiadas expuestas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Cómo probar después de aplicar la migración

1. Iniciar Admin Web e ingresar con una cuenta administradora activa.
2. Catálogo → Categorías → crear una categoría.
3. Productos → crear un borrador → Variantes → agregar SKU/color/talla/precio.
4. Volver a productos → Editar → estado Activo.
5. Inventario → Movimiento → Entrada con cantidad y motivo; comprobar saldo e historial.
6. Probar salida válida, salida superior al stock, reintento con el mismo identificador y acceso de una cuenta no administradora.

Mientras no se aplique la migración, la nueva sección informa que la actualización está pendiente. Esto no afecta al acceso anterior a Usuarios.
