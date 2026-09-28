# Integración de GitHub, Jira y Pull Requests

El proyecto Jira confirmado es `SCRUM`. Cada vez que Jira cree una historia, se debe sustituir `<clave-jira>` por su identificador real, por ejemplo `SCRUM-12`.

## Convención de ramas

```text
feature/SCRUM-<numero>-<descripcion>
bugfix/SCRUM-<numero>-<descripcion>
test/SCRUM-<numero>-<descripcion>
release/v<version>
hotfix/SCRUM-<numero>-<descripcion>
```

Ejemplo para la historia del dashboard:

```text
feature/SCRUM-12-admin-dashboard
```

La rama histórica `feature/TF-201-admin-dashboard` fue creada antes de confirmar la clave Jira. Se renombrará cuando Jira genere la clave real de la historia.

## Flujo del repositorio

1. Se crea la historia en Jira y se registra su clave.
2. El integrante crea una rama desde `develop` con esa clave.
3. Cada commit incluye la misma clave: `SCRUM-12 crea dashboard administrativo`.
4. Se abre un Pull Request hacia `develop`.
5. Otro integrante revisa el código; Tester/QA verifica los criterios de aceptación.
6. CI ejecuta typecheck, pruebas y build.
7. Tras aprobación, se realiza el merge a `develop`.
8. `main` contiene únicamente incrementos demostrables de un Sprint cerrado.

## ¿Por qué no usar forks?

No se usarán forks: todo el equipo trabaja sobre el mismo producto y debe ser colaborador del repositorio central. Las ramas protegidas y los Pull Requests aportan trazabilidad sin duplicar repositorios. Los forks se reservan para contribuciones externas.

## Estado de conexión

- GitHub: la integración está disponible, pero este workspace aún no tiene un remoto configurado.
- Jira: el tablero es `SCRUM`, pero la integración Atlassian aún no está expuesta a esta sesión.
- Backlog importable: `docs/jira/SCRUM-dev2-import.csv`.
