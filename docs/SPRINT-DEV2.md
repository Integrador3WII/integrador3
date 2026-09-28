# Sprint actual — Dev 2: Web administrativa

## Objetivo del Sprint

Construir el primer incremento funcional de la web administrativa de TextilFlow 2.0: autenticación, dashboard y consulta protegida de pedidos.

## Alcance incluido

- Estructura React + TypeScript + Vite.
- Inicio de sesión mediante Supabase Auth.
- Dashboard administrativo.
- Métricas iniciales de pedidos, producción, completados e ingresos.
- Tabla de pedidos recientes.
- Consulta de pedidos mediante Supabase, respetando RLS.
- Navegación inicial para pedidos, productos, inventario, cotizaciones y usuarios.
- Pruebas unitarias iniciales.
- Pipeline de integración continua.

## Fuera de alcance de este Sprint

- CRUD persistente de productos.
- Cambio de estados contra Supabase.
- Inventario real.
- App móvil, web cliente y pruebas E2E.

## Historia principal

**TF-201 — Visualizar dashboard administrativo**

Como administrador quiero visualizar un resumen de la operación para conocer rápidamente el estado de pedidos, producción e ingresos.

### Criterios de aceptación

- Dado que el administrador accede al panel, se muestran las métricas principales.
- Se muestran los pedidos recientes con cliente, producto, total y estado.
- La navegación presenta los módulos administrativos previstos.
- La interfaz funciona en escritorio y en una vista móvil básica.
- Las pruebas unitarias del dashboard pasan en CI.
- Un usuario no autenticado no puede acceder al dashboard cuando Supabase está configurado.
- La consulta de pedidos depende de las políticas RLS del usuario autenticado.

## Definition of Done

- Código en una rama asociada a una historia Jira.
- Pull Request revisado por otro integrante.
- TypeScript sin errores.
- Pruebas unitarias aprobadas.
- Build de producción aprobado.
- Evidencia visual adjunta al ticket y al Pull Request.
- Documentación del incremento actualizada.
