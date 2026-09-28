# Sprint actual — Dev 2: Web administrativa

## Objetivo del Sprint

Construir el primer incremento visible de la web administrativa de TextilFlow 2.0: una base ejecutable con dashboard, métricas y pedidos recientes, preparada para integrar Supabase.

## Alcance

Incluido:

- Estructura React + TypeScript + Vite.
- Dashboard administrativo.
- Métricas de pedidos, producción, completados e ingresos.
- Tabla de pedidos recientes.
- Navegación inicial para pedidos, productos, inventario, cotizaciones y usuarios.
- Configuración inicial de pruebas unitarias.
- Pipeline de integración continua.
- Cliente Supabase preparado mediante variables de entorno.

No incluido todavía:

- CRUD persistente de productos.
- Autenticación.
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

## Definition of Done

- Código en una rama asociada a una historia Jira.
- Pull Request revisado por otro integrante.
- TypeScript sin errores.
- Pruebas unitarias aprobadas.
- Build de producción aprobado.
- Evidencia visual adjunta al ticket y al Pull Request.
- Documentación del incremento actualizada.
