# Integración de GitHub, Jira y Pull Requests

## Convención de ramas

```text
feature/TF-<numero>-<descripcion>
bugfix/TF-<numero>-<descripcion>
test/TF-<numero>-<descripcion>
release/v<version>
hotfix/TF-<numero>-<descripcion>
```

Para el sprint de Dev 2:

```text
feature/TF-201-admin-dashboard
```

## Flujo del repositorio

1. Cada integrante trabaja sobre una rama propia.
2. La rama se crea desde `develop`.
3. El nombre incluye la clave de Jira.
4. Los commits incluyen la misma clave, por ejemplo: `TF-201 crea dashboard administrativo`.
5. Se abre un Pull Request hacia `develop`.
6. Otro integrante revisa el código.
7. CI ejecuta typecheck, pruebas y build.
8. Solo después de aprobarse se realiza el merge.
9. `main` contiene únicamente incrementos demostrables.

## ¿Por qué no usar forks?

No se usarán forks porque el equipo trabaja dentro de un mismo repositorio y todos son colaboradores del proyecto. Las ramas y Pull Requests ofrecen trazabilidad suficiente con menos complejidad operativa. Un fork quedaría reservado para colaboradores externos sin permisos directos.

## Conexión pendiente

Para conectar el repositorio y Jira faltan datos externos que no deben escribirse en el código:

- URL del repositorio GitHub.
- Clave del proyecto Jira, por ejemplo `TF`.
- URL del tablero Jira.
- Usuarios/cuentas que deben tener acceso.

No se guardan tokens ni contraseñas en este repositorio. La conexión deberá hacerse mediante autenticación de GitHub/Jira o variables secretas de CI.
