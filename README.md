# TextilFlow 2.0

Plataforma de gestión de prendas personalizadas. Este repositorio se organiza como un workspace para web cliente, web administrativa, app móvil y Supabase.

## Sprint actual: Dev 2 — Web administrativa

El incremento de este sprint se concentra exclusivamente en la base de la web administrativa:

- Dashboard administrativo.
- Pedidos recientes y estados.
- Métricas iniciales.
- Estructura preparada para Supabase.
- Pruebas unitarias de la interfaz.
- CI para validación de tipos, pruebas y build.

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
  SPRINT-DEV2.md   # Alcance y evidencia del sprint actual
  GIT-JIRA.md      # Ramas, Jira y Pull Requests
e2e/               # Pruebas de sistema/E2E
```

## Inicio local

```bash
npm install
npm run dev:admin
```

La configuración de Supabase se documenta en `apps/admin-web/.env.example`. No se deben subir credenciales reales.
