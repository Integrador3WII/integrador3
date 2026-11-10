# TextilFlow 2.0

Plataforma de gestión de prendas personalizadas. Este repositorio se organiza como un workspace para web cliente, web administrativa, app móvil y Supabase.

## Incremento actual: Admin Web 03 — Operación administrativa

El incremento se concentra en Dev2 y está planificado en [SCRUM-85](https://cuquinata267.atlassian.net/browse/SCRUM-85):

- Catálogo: categorías, productos, variantes, precio y baja lógica.
- Inventario: entradas/salidas, historial y recuperación de operaciones pendientes.
- Acceso de administrador activo, validaciones de servidor y movimientos atómicos/idempotentes.
- Responsive, navegación independiente y modo oscuro.
- Pedidos: filtros por cliente, estado y fechas, detalle histórico y transiciones autorizadas.
- Cotizaciones: valoración, envío con precios congelados y conversión atómica a pedido.
- Resumen con indicadores reales calculados en horario de Bolivia.
- Pruebas de interfaz, contratos PostgreSQL aislados y validación visual con datos simulados.

**Estado:** Admin Web 03 está integrado en `develop`. Sus funciones de pedidos, cotizaciones, métricas y movimientos manuales están documentadas como instaladas en Supabase. Las migraciones posteriores de materiales y portales tienen validación local.

El resumen utiliza datos reales; los errores no se convierten en ceros. Usuarios mantiene su integración anterior. La migración amplia de catálogo/inventario de Admin Web 02 sigue sin aplicarse completa: las restricciones adicionales de publicación, duplicados normalizados y permisos directos de inventario no se declaran desplegadas. La API de movimientos se instaló mediante una migración aditiva independiente.
Detalle de resultados, límites y evidencias: [reporte del incremento](docs/REPORTE-ADMIN-WEB-03-AVANCE-03.md).

## Estructura

```text
apps/
  admin-web/       # Dev 2: dashboard, productos, pedidos e inventario
  client-web/      # Catálogo, solicitudes, ofertas y seguimiento de pedidos
  mobile/          # PWA de taller: producción, calidad y entrega
packages/
  shared/          # Tipos y utilidades compartidas
supabase/
  migrations/     # Migraciones de la base existente
  tests/           # Pruebas de BD/RLS
docs/
  SPRINT-DEV2.md   # Contexto del incremento anterior
  SPRINT-ADMIN-WEB-02.md # Evidencia y pendientes del incremento actual
  GIT-JIRA.md      # Ramas, Jira y Pull Requests
e2e/               # Pruebas de sistema/E2E
```

## Inicio local

```bash
npm install
npm run dev:admin
```

La configuración de Supabase se documenta en `apps/admin-web/.env.example`. No se deben subir credenciales reales.

### Portal cliente y taller

Copia el `.env.example` de cada app a `.env.local` en la misma carpeta y completa la URL y la clave pública del mismo proyecto de Supabase.

```bash
npm run dev:client  # http://localhost:5175
npm run dev:mobile  # http://localhost:5176
npm run build:portals
```

- Cliente puede explorar el catálogo publicado, registrarse, cotizar varias variantes con notas, responder a una oferta y consultar sus pedidos. Supabase Auth debe permitir el registro y la URL de retorno si se usa confirmación por correo. La solicitud inicial se registra con recogida. Las indicaciones adicionales se guardan como notas para el taller.
- Taller usa cuentas activas de operador o administrador. Desde el móvil se inicia la producción, se completan tareas, se registra la revisión de medidas, acabados y personalización, y se marca la entrega. Una devolución de calidad reabre las tareas completadas del pedido. La PWA se puede instalar desde el navegador en HTTPS y requiere conexión para operar.
- Antes de apuntar los frontends a otro entorno, verifica el historial de Supabase. La base debe incluir las cinco migraciones de materiales del 2 de noviembre y las migraciones de inventario y portales del 10 de noviembre en orden. El catálogo usa el bucket público `product-images` para las fotos.

## Verificación

```bash
npm run typecheck:admin
npm run test:admin
npm --workspace apps/admin-web run test:db
npm --workspace apps/admin-web run test:concurrency
npm run build:admin
npm run build:portals
```

`test:db` usa PGlite aislado. `test:concurrency` necesita Docker y crea un contenedor PostgreSQL temporal, que elimina al terminar; la imagen por defecto es `bitnami/postgresql:latest` (configurable con `QA_POSTGRES_IMAGE`). No utiliza tu proyecto remoto.

Para verificar la interfaz: inicia la web en `127.0.0.1:5174` y ejecuta `node e2e/admin-catalog.visual.cjs` y `node e2e/admin-workflows.visual.cjs`. Requieren Microsoft Edge y usan respuestas HTTP simuladas. Las capturas se guardan en `e2e/artifacts/`, excluido de Git.

Para verificar los portales en Edge, inicia ambas apps en los puertos indicados con `VITE_SUPABASE_URL=https://textilflow-fixture.supabase.co` y `VITE_SUPABASE_PUBLISHABLE_KEY=fixture`. Ejecuta `node e2e/portals.cjs` desde la raíz. El navegador intercepta las peticiones y no escribe en Supabase.

Los fixtures de pruebas no son un instalador de Supabase: no ejecutar `db reset` ni un `db push` indiscriminado. Las migraciones se prepararon sobre una base existente y algunas migraciones anteriores solo están parcialmente desplegadas. Revisar el historial remoto y el reporte antes de instalar en otro ambiente.
