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

**Estado:** funciones de pedidos, cotizaciones, métricas y movimientos manuales instaladas en Supabase. Pruebas locales, comprobación SQL remota con rollback y revisión de navegador con respuestas simuladas. La aprobación del equipo, revisión del PR y merge se registran cuando ocurran.

El resumen utiliza datos reales; los errores no se convierten en ceros. Usuarios mantiene su integración anterior. La migración amplia de catálogo/inventario de Admin Web 02 sigue sin aplicarse completa: las restricciones adicionales de publicación, duplicados normalizados y permisos directos de inventario no se declaran desplegadas. La API de movimientos se instaló mediante una migración aditiva independiente.
Detalle de resultados, límites y evidencias: [reporte del incremento](docs/REPORTE-ADMIN-WEB-03-AVANCE-03.md).

## Estructura

```text
apps/
  admin-web/       # Dev 2: dashboard, productos, pedidos e inventario
  client-web/      # Próximo incremento: experiencia del cliente
  mobile/          # Próximo incremento: operación y control de calidad
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

## Verificación

```bash
npm run typecheck:admin
npm run test:admin
npm --workspace apps/admin-web run test:db
npm --workspace apps/admin-web run test:concurrency
npm run build:admin
```

`test:db` usa PGlite aislado. `test:concurrency` necesita Docker y crea un contenedor PostgreSQL temporal, que elimina al terminar; la imagen por defecto es `bitnami/postgresql:latest` (configurable con `QA_POSTGRES_IMAGE`). No utiliza tu proyecto remoto.

Para verificar la interfaz: inicia la web en `127.0.0.1:5174` y ejecuta `node e2e/admin-catalog.visual.cjs` y `node e2e/admin-workflows.visual.cjs`. Requieren Microsoft Edge y usan respuestas HTTP simuladas. Las capturas se guardan en `e2e/artifacts/`, excluido de Git.

Los fixtures de pruebas no son un instalador de Supabase: no ejecutar `db reset` ni un `db push` indiscriminado. Las migraciones se prepararon sobre una base existente y algunas migraciones anteriores solo están parcialmente desplegadas. Revisar el historial remoto y el reporte antes de instalar en otro ambiente.
