# SIRAI — Sistema Institucional de Registro Rápido de Asistencia

SIRAI es una aplicación web desarrollada para el **ISSSTE**. Registra y da seguimiento a la asistencia de las niñas y los niños en las **212 Estancias de Bienestar y Desarrollo Infantil (EBDI)** en tiempo real, y documenta cada inasistencia: si fue justificada o no, quién dio seguimiento y qué se resolvió.

Proyecto del curso *Integración de Seguridad Informática en Redes y Sistemas de Software* (Tecnológico de Monterrey) — Equipo 4.

## Funcionalidades principales

- **Pase de lista por turno**: el personal registra entrada y estado de asistencia de cada infante; al cerrar el turno (manual o automático cada minuto, según `hora_cierre`) los infantes sin registro quedan como falta injustificada.
- **Seguimiento de inasistencias**: cada falta que lo requiere abre un seguimiento con bandeja, clasificación de causa, registro de llamadas a tutores y justificación.
- **Salida con tutor y alta médica**: control de quién recoge al infante y emisión de altas médicas.
- **Expedientes imprimibles** por infante.
- **Tablero semáforo** para supervisores y administración central, con el estado de asistencia por región y estancia.
- **Reportes de asistencia** en CSV y PDF, sin nombres de infantes (el backend filtra por estancia o región).
- **Gestión institucional**: regiones, estancias, usuarios, infantes, tutores y contactos de emergencia.
- **Accesibilidad**: preferencias de presentación guardadas en el navegador.

### Roles y permisos

El acceso se controla por rol y alcance (estancia o región):

| Rol | Alcance |
|---|---|
| `ADMIN_CENTRAL` | Regiones, estancias, usuarios, bitácora, tablero y reportes |
| `SUPERVISOR` | Tablero y reportes de su región |
| `DIRECTORA` | Gestión de su estancia: infantes, tutores, asistencia, seguimientos, reportes |
| `DOCENTE` | Pase de lista (no ve notas ni seguimientos) |
| `TRABAJO_SOCIAL` | Seguimientos, tutores, expedientes |
| `MEDICO` | Seguimientos médicos y altas |

La tabla de permisos del frontend vive en [frontend/src/permisos.ts](frontend/src/permisos.ts) y debe coincidir con la del backend.

### Seguridad

- **HTTPS** en backend y frontend (certificados propios).
- Autenticación con **JWT**; toda ruta excepto `/login` exige token.
- Contraseñas con **Argon2id**.
- Teléfonos y notas **cifrados con AES-256-GCM** en la base de datos.
- **Bitácora de auditoría encadenada**: cada petición queda en `audit_log` con un hash SHA-256 que depende del registro anterior, lo que hace detectable cualquier alteración.
- Borrado lógico (`deleted_at`) y llaves foráneas con `RESTRICT`.

## Arquitectura

```
┌────────────────────┐   HTTPS / JSON   ┌────────────────────┐        ┌──────────┐
│ Frontend           │ ───────────────► │ Backend            │ ─────► │ MySQL 8  │
│ React + react-admin│                  │ Node + Express 5   │        │  sirai   │
│ Vite (MUI)         │ ◄─────────────── │ rutas/ por módulo  │ ◄───── │          │
└────────────────────┘                  └────────────────────┘        └──────────┘
```

| Carpeta | Contenido |
|---|---|
| [backend/](backend) | API REST (`index.js`, `rutas/`), `schema.sql`, `seed.js`, seguridad y cifrado |
| [frontend/](frontend) | Interfaz React/TypeScript (`src/paginas/`, `src/recursos/`) |
| [docs-entrega/](docs-entrega) | SRS, arquitectura y justificación de la base de datos, manual de usuario (PDF) |

## Requisitos

- [Node.js](https://nodejs.org/) 20.12 o superior (el backend usa `process.loadEnvFile`)
- MySQL 8.0 (local o en Docker)
- OpenSSL, para generar los certificados HTTPS de desarrollo

## Cómo correrlo

### 1. Clonar e instalar dependencias

```sh
git clone https://github.com/brinez-juan/SIRAI-equipo-4.git
cd SIRAI-equipo-4

cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Base de datos

Con MySQL corriendo, crea el esquema (esto crea la base `sirai`):

```sh
mysql -u root -p < backend/schema.sql
```

O con Docker:

```sh
docker run -d --name sirai-mysql -e MYSQL_ROOT_PASSWORD=CAMBIAR -p 3306:3306 mysql:8.0
# espera unos segundos a que arranque y luego:
docker exec -i sirai-mysql mysql -uroot -pCAMBIAR < backend/schema.sql
```

### 3. Certificados HTTPS

El backend y el frontend usan los mismos certificados, que **no se suben a git**. Genera unos autofirmados en `backend/`:

```sh
cd backend
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout backend.key -out backend.crt -subj "/CN=localhost"
```

La primera vez, abre `https://localhost:3000` en el navegador y acepta el certificado.

### 4. Variables de entorno

**Backend** — copia `backend/.env.example` a `backend/.env` y llena los valores:

```sh
cp backend/.env.example backend/.env

# LLAVESECRETA (firma de JWT)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# LLAVE_CIFRADO (AES-256, 32 bytes en hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión a MySQL, p. ej. `mysql://root:CAMBIAR@localhost:3306/sirai` |
| `LLAVESECRETA` | Llave para firmar los JWT |
| `LLAVE_CIFRADO` | Llave AES-256 en hex (64 caracteres) para teléfonos y notas |

> Si cambias `LLAVE_CIFRADO` después de guardar datos, no podrás descifrar los existentes.

**Frontend** — copia `frontend/.env.example` a `frontend/.env`:

```sh
cp frontend/.env.example frontend/.env   # VITE_BACKEND=https://localhost:3000
```

### 5. Datos de demostración

Desde `backend/`, carga regiones, estancias, usuarios y infantes sintéticos:

```sh
cd backend
npm run seed
```

### 6. Levantar los servicios

En dos terminales:

```sh
# Terminal 1 — backend (https://localhost:3000)
cd backend
node index.js

# Terminal 2 — frontend (https://localhost:5173)
cd frontend
npm run dev
```

Abre <https://localhost:5173> e inicia sesión con alguno de los usuarios de demostración.

### Usuarios de demostración

Todos usan la contraseña `Sirai#2026` (definida en [backend/seed.js](backend/seed.js)). **Solo para desarrollo; no usar en producción.**

| Correo | Rol |
|---|---|
| `admin@sirai.mx` | ADMIN_CENTRAL |
| `supervisor@sirai.mx` | SUPERVISOR |
| `directora@sirai.mx` | DIRECTORA |
| `docente@sirai.mx` | DOCENTE |
| `trabajosocial@sirai.mx` | TRABAJO_SOCIAL |
| `medico@sirai.mx` | MEDICO |

## Scripts útiles

| Dónde | Comando | Qué hace |
|---|---|---|
| `backend/` | `node index.js` | Inicia la API en el puerto 3000 |
| `backend/` | `npm run seed` | Carga datos de demostración (sobre una base recién creada) |
| `backend/` | `node pruebas/medicion.js` | Mide CPU y memoria en reposo y bajo carga (212 conexiones); requiere macOS/Linux y `autocannon` |
| `frontend/` | `npm run dev` | Servidor de desarrollo con Vite |
| `frontend/` | `npm run build` | Compilación de producción |
| `frontend/` | `npm run type-check` | Revisión de tipos con TypeScript |
| `frontend/` | `npm run lint` / `npm run format` | ESLint / Prettier |

## Problemas comunes

- **`Faltan DATABASE_URL, LLAVESECRETA o LLAVE_CIFRADO`**: falta crear o completar `backend/.env`.
- **`ENOENT ... backend.key`**: genera los certificados del paso 3; el frontend también los lee de `backend/`.
- **El frontend no conecta con la API**: confirma `VITE_BACKEND` y que aceptaste el certificado de `https://localhost:3000` en el navegador.
- **`seed.js` falla o duplica datos**: úsalo solo sobre una base recién creada con `schema.sql`.

## Documentación

En [docs-entrega/](docs-entrega) están:

- *SRS — SIRAI — Equipo 4* (requerimientos)
- *Arquitectura de SIRAI y justificación de la base de datos*
- *SIRAI — Manual de Usuario*

## Contribuir

El flujo de trabajo es con ramas desde `develop` y pull requests (ver [la plantilla de PR](.github/pull_request_template.md)). Cada módulo nuevo del backend se monta en `backend/index.js` después de `autenticar` y `registrarPeticion`, para que quede protegido y auditado.

## Licencia

[MIT](LICENSE) © 2026 Juan Pablo Briñez
