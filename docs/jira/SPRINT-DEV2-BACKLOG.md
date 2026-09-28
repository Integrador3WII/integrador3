# Backlog Jira — Proyecto SCRUM

## Sprint Dev 2: Web administrativa

Objetivo: entregar una web administrativa con autenticación, dashboard y consulta protegida de pedidos.

| Tipo | Resumen | Responsable | Rama sugerida | Prioridad |
|---|---|---|---|---|
| Epic | Administración web | Dev 2 | — | Alta |
| Historia | Iniciar sesión como administrador | Dev 2 | `feature/SCRUM-<id>-admin-login` | Alta |
| Historia | Visualizar dashboard administrativo | Dev 2 | `feature/SCRUM-<id>-admin-dashboard` | Alta |
| Historia | Consultar pedidos recientes según RLS | Dev 2 | `feature/SCRUM-<id>-admin-orders` | Alta |
| Tarea de prueba | Probar autenticación administrativa | Tester/QA — jhonmaytaflores@gmail.com | `test/SCRUM-<id>-admin-auth` | Alta |
| Tarea de prueba | Probar dashboard y regresión de pedidos | Tester/QA — jhonmaytaflores@gmail.com | `test/SCRUM-<id>-admin-dashboard` | Media |

## Historias y criterios de aceptación

### Iniciar sesión como administrador

Como administrador, quiero iniciar sesión con correo y contraseña para acceder de manera segura al panel administrativo.

- Dado que una cuenta válida ingresa sus credenciales, cuando confirma el formulario, entonces se crea una sesión en Supabase.
- Dado que una cuenta no está autenticada, cuando intenta acceder al panel, entonces visualiza el formulario de inicio de sesión.
- Dado que el inicio de sesión falla, cuando Supabase rechaza las credenciales, entonces se muestra un mensaje claro sin exponer detalles sensibles.

### Visualizar dashboard administrativo

Como administrador, quiero ver métricas y pedidos recientes para conocer el estado de la operación.

- Se muestran tarjetas para pedidos, producción, completados e ingresos.
- Se muestra una tabla con pedido, cliente, producto, total y estado.
- La interfaz funciona en escritorio y en una vista móvil básica.

### Consultar pedidos recientes según RLS

Como administrador autenticado, quiero consultar los pedidos permitidos por mi rol para operar sin exponer datos a usuarios no autorizados.

- La consulta se realiza con el token de la sesión autenticada.
- Las políticas RLS controlan las filas visibles.
- Si no existen permisos o datos, el panel informa que está en modo demostración sin desactivar RLS.

## Backlog posterior

| Epic | Responsable | Alcance inicial |
|---|---|---|
| Web cliente | Dev 1 — lian141924@gmail.com | Catálogo, personalización, cotizaciones y seguimiento de pedidos |
| Operación móvil | Dev móvil — gaby64838342@gmail.com | Producción, estados, QR y control de calidad |
| Calidad | Tester/QA — jhonmaytaflores@gmail.com | Unitarias, integración, E2E, RLS, regresión y evidencias |
