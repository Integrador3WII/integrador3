# Despliegue de TextilFlow con Docker Hub y OCI

Este despliegue empaqueta la aplicación administrativa `apps/admin-web` como una web estática servida por Nginx en el puerto 80. GitHub Actions construye y publica la imagen `naticookiewii/textilflow:latest` al recibir cambios en `feature/TF-201-admin-dashboard` o en la rama de despliegue `codex/textilflow-docker-deploy`.

## 1. Probar la imagen localmente

Desde la raíz del repositorio:

```powershell
docker build -t textilflow:local .
docker run -d --name textilflow-local -p 8080:80 textilflow:local
```

Abrir `http://localhost:8080`. Para revisar que Nginx responde:

```powershell
curl.exe http://localhost:8080/health
```

En Docker Desktop se debe mostrar el contenedor `textilflow-local` en ejecución y el mapeo `8080:80`. Al terminar la captura, se puede detener y quitar con `docker rm -f textilflow-local`.

## 2. Configurar publicación automática en Docker Hub

1. Crear en Docker Hub un repositorio llamado `textilflow` (preferiblemente público para que la VM lo descargue sin iniciar sesión).
2. En GitHub, abrir **Settings → Secrets and variables → Actions**.
3. Crear los secretos `DOCKERHUB_USERNAME` y `DOCKERHUB_TOKEN`. El token debe ser un Access Token de Docker Hub con permiso de lectura/escritura para publicar.
4. Opcionalmente definir las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (o `VITE_SUPABASE_ANON_KEY`) en **Variables → Actions**. Sin esos valores la app usa el modo demostración existente.
5. Subir este workflow y los cambios de la aplicación a una de las ramas configuradas. Revisar **Actions → Build and publish TextilFlow image** y luego confirmar que el repositorio muestra las etiquetas `latest` y `sha-...`.

Las variables de Supabase se incorporan al bundle de frontend al construir la imagen. Nunca colocar una `service_role` key ni otra clave secreta en variables `VITE_*`: los valores `VITE_*` son visibles para los usuarios del navegador. La publicación de catálogo/inventario conectada a Supabase requiere que el proyecto backend esté configurado y que sus migraciones/RLS estén desplegadas.

## 3. Descargar y ejecutar en la VM OCI

Conectarse por SSH con el usuario y la llave configurados para la instancia. Si Docker no está instalado en Ubuntu:

```bash
sudo apt update
sudo apt install -y docker.io
sudo systemctl enable --now docker
```

Sustituir `USUARIO_DOCKERHUB` por el usuario que publicó la imagen:

```bash
sudo docker pull USUARIO_DOCKERHUB/textilflow:latest
sudo docker run -d \
  --name textilflow \
  --restart unless-stopped \
  -p 80:80 \
  USUARIO_DOCKERHUB/textilflow:latest
```

Comprobar el despliegue:

```bash
sudo docker ps
curl http://localhost/health
```

Abrir `http://IP_PUBLICA_DE_LA_VM` en el navegador. En OCI debe estar permitida la entrada TCP al puerto 80 en la Security List o NSG de la VNIC/subred y la VM debe tener conectividad pública. Para SSH, limitar el puerto 22 a la IP del equipo que se conecta.

## 4. Evidencias para la entrega

- Docker Desktop mostrando `textilflow-local` activo y el puerto `8080:80`.
- GitHub Actions mostrando el workflow completado después de un push a `main`.
- Docker Hub mostrando `textilflow:latest` y la etiqueta `sha-...` publicada.
- Terminal SSH mostrando `docker pull`, `docker run` y `docker ps` en la VM.
- Navegador abierto en `http://IP_PUBLICA_DE_LA_VM` mostrando TextilFlow.

Ocultar tokens, contraseñas y llaves privadas en capturas. No es necesario mostrar credenciales API de OCI.

