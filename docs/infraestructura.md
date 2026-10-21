# Infraestructura: consumo de CPU y memoria por proceso

Medición del issue 33. Se midió el consumo de cada proceso de SIRAI en reposo y bajo la carga que pide el SRS
(212 conexiones simultáneas, una por estancia).

## Resumen

| | Backend (Node, Express) | Frontend (Vite, React-admin) | MySQL 8.0 |
|---|---|---|---|
| **CPU en reposo** | 0 % | 0 % | 0.3 % |
| **CPU bajo carga** (mediana / máximo) | 27 % / 31 % | 0 % / 0 % | 62 % / 64 % |
| **RAM en reposo** | 210 MB | 46 MB | 451 MB |
| **RAM bajo carga** (pico) | 275 MB | 46 MB | 470 MB |

El CPU es porcentaje de **un solo núcleo** (100 % = un núcleo completo; puede pasar de 100 % en procesos con varios hilos).

- Con **212 conexiones sostenidas durante 30 s** el sistema atendió **1 053 peticiones por segundo**: 31 589 respuestas, **todas 2xx**, sin errores de conexión ni tiempos agotados.
- Latencia: mediana 199 ms, p99 224 ms, máxima 310 ms.
- **El cuello de botella es MySQL (~62 % de un núcleo), no Node (~27 %).** El backend tiene unas 3.7 veces de margen antes de saturar su único hilo.
- El frontend no consume nada bajo carga: la carga va contra la API, y en producción el frontend son archivos estáticos.

## Cómo se midió

| | |
|---|---|
| Carga | `autocannon`, 212 conexiones, 30 s, contra `GET /pase-lista?fecha=…&turno=MATUTINO`, con el token de la docente del seed |
| Reposo | 20 s sin tocar nada, con los tres procesos arriba |
| CPU y RAM del backend y del frontend | `top`, una lectura por segundo (en macOS equivale a `htop`; en Windows, el Administrador de tareas) |
| CPU y RAM de MySQL | `docker stats` del contenedor, una lectura por segundo |
| Script | `backend/pruebas/medicion.js`: lanza la carga y muestrea los tres procesos a la vez |

Entorno de la medición:

| | |
|---|---|
| Equipo | Apple M5 Pro, 18 núcleos lógicos, 64 GB de RAM, macOS 27.0.1 |
| Docker Desktop | máquina virtual de 4 CPUs y 7.75 GB (donde corre MySQL) |
| Versiones | Node v26.3.0, MySQL 8.0.46 (imagen oficial `mysql:8.0`, configuración por defecto) |
| Datos | los del seed: 3 estancias, 60 infantes, 6 usuarios |

### Cómo repetirla

Con el backend (`node index.js`), el frontend (`npm run dev`) y MySQL corriendo, y la base sembrada (`node seed.js`):

```bash
cd backend
PUERTO_FRONT=5173 node pruebas/medicion.js     # el puerto donde corre el frontend
DETALLE=1 node pruebas/medicion.js             # además imprime la serie segundo a segundo
```

Variables opcionales: `CONEXIONES` (212), `DURACION` (30), `REPOSO` (20), `CONTENEDOR_MYSQL` (`sirai-mysql`), `USUARIO` y `CLAVE`.
El script solo funciona en macOS y Linux, y se niega a medir un servidor que no sea local.

## Resultados

Resultado de la medición definitiva (la tabla del script usa la **mediana** y el **máximo**):

| Proceso | CPU reposo (mediana / máx %) | RAM reposo (mediana / máx MB) | CPU carga (mediana / máx %) | RAM carga (mediana / máx MB) |
|---|---|---|---|---|
| Backend (Node, Express) | 0.0 / 0.0 | 210 / 210 | 26.9 / 30.7 | 159 / 275 |
| Frontend (Vite, React-admin) | 0.0 / 0.0 | 46 / 46 | 0.0 / 0.0 | 46 / 46 |
| MySQL (contenedor) | 0.3 / 0.7 | 451 / 451 | 62.1 / 64.0 | 461 / 470 |

Se usa la mediana porque las últimas lecturas de cada serie caen cuando la carga ya terminó y bajan el promedio.
El mismo patrón salió en tres corridas independientes, con diferencias de pocos puntos:

| Corrida | Peticiones/s | p99 | Backend CPU (mediana) | MySQL CPU (mediana) |
|---|---|---|---|---|
| 1 | 1 018 | 239 ms | ~27 % | ~63 % |
| 2 | 1 032 | 242 ms | ~27 % | ~62 % |
| 3 (definitiva) | 1 053 | 224 ms | 27 % | 62 % |

### Cómo leer la memoria del backend

La RAM del backend **sube y baja** durante la carga (de 210 a 275 MB y luego a 142 MB). Es el comportamiento normal de Node:
reserva memoria mientras atiende y el recolector de basura la devuelve después. Por eso la **mediana bajo carga (159 MB) no sirve
para dimensionar**; lo que cuenta es el **pico (275 MB)**. Recién arrancado el backend ocupa unos 108 MB.

## Qué consume cada proceso y por qué

**Backend (Node).** El código JavaScript corre en **un solo hilo**, así que no puede usar más de un núcleo. Bajo la carga máxima
usa cerca de la cuarta parte de ese núcleo. Pasaría de un núcleo, y habría que lanzar varias copias, solo con una carga casi cuatro veces mayor.

**MySQL.** Es el que más trabaja. Cada petición a `GET /pase-lista` le cuesta **8 consultas** (verificado con el log general de MySQL):

| De quién | Consultas |
|---|---|
| El endpoint | turno que opera la estancia, si el turno está cerrado, la lista de infantes con su asistencia, y el candado de reingreso (seguimientos que requieren alta) |
| La bitácora (`audit_log`) | `GET_LOCK`, leer el último hash, `INSERT` del registro y `RELEASE_LOCK` |

La mitad del trabajo de MySQL viene de registrar la petición en la bitácora, que es obligatoria (rúbrica: logging en todos los
endpoints). La bitácora **aguantó el ritmo sin perder nada**: en la corrida 2, 30 953 peticiones dejaron 30 955 registros (los 2 extra son el inicio
de sesión y la prueba previa del script), todos con su hash. El candado que serializa la bitácora (`GET_LOCK`) no fue un problema a este ritmo.

**Frontend.** En desarrollo, Vite ocupa unos 46 MB y 0 % de CPU en reposo. En producción no hace falta ningún proceso de Node: `npm run build`
genera archivos estáticos que sirve cualquier servidor web. Su costo real está en el navegador de cada usuario, no en el servidor.

**Disco.** Cada registro de la bitácora pesa unos **550 bytes** (medido: 127 041 registros ocupan 66 MB con sus índices).
La base completa de la prueba ocupa 67.5 MB. La bitácora es lo que más crece, porque es inmutable: no se borra nada.

## Requisitos recomendados (estimación)

> Estos números **se calculan a partir de lo medido, más un margen**. No se probaron en un servidor de esa capacidad.

Para backend y MySQL en **una misma máquina Linux**, atendiendo el escenario del SRS:

| | Mínimo | Recomendado |
|---|---|---|
| CPU | 2 núcleos | 4 núcleos |
| RAM | 2 GB | 4 GB |
| Disco | 20 GB SSD | 50 GB SSD |
| Red | HTTPS con certificado válido | igual |

Cómo se llegó a esos números:

- **CPU:** a la carga máxima medida, MySQL usa ~0.6 núcleos y el backend ~0.3, es decir, unos 0.9 núcleos en total. Con 2 núcleos hay más del doble
  de margen, y con 4 sobra para el sistema operativo, las copias de seguridad y los picos.
- **RAM:** la suma de los picos medidos es de unos 0.8 GB (backend 275 MB + MySQL 470 MB + frontend 46 MB). Se agregan el sistema operativo
  (~0.5 a 1 GB) y margen. MySQL usa su configuración por defecto (`innodb_buffer_pool_size` de 128 MB); con más RAM conviene subirlo.
- **Disco:** el sistema operativo, MySQL y el backend ocupan pocos GB. Lo que decide es la bitácora: con ~550 bytes por petición y, por ejemplo,
  100 000 peticiones al día (un supuesto de ejemplo, no un dato del SRS), crece unos 55 MB al día, cerca de 20 GB al año.
  Si se quiere más de un año de bitácora en línea, hay que dimensionar el disco o archivar.
- **Frontend:** un servidor web de archivos estáticos (por ejemplo nginx) cabe en el mismo equipo con un consumo despreciable.

## Limitaciones de esta medición

- **No es un servidor Linux real.** Se midió en un Mac con MySQL dentro de la máquina virtual de Docker Desktop. En Linux, con MySQL instalado
  directamente, los números pueden variar.
- **Otros contenedores del equipo estaban corriendo** (n8n, Supabase y un chatbot, de otros proyectos, con ~1.4 GB de RAM y ~2 % de CPU de fondo).
  Las tablas son **por proceso**, así que no los incluyen, pero compartían la máquina.
- **Solo se midió un endpoint de lectura** (`GET /pase-lista`). No se midieron escrituras (`PUT /pase-lista`, marcar todos presentes) ni el cierre,
  que hacen más trabajo por petición.
- **La carga es más dura que el escenario del SRS.** El SRS habla de 212 estancias con una petición cada una, una ráfaga puntual. La prueba sostuvo
  **~1 000 peticiones por segundo durante 30 s**, mucho más.
- **Pocos datos.** El seed trae 60 infantes en 3 estancias. Con 212 estancias de unos 20 infantes cada una habría ~4 200 infantes. Las consultas usan
  índices, pero leerían algo más de filas por petición.
- **El frontend se midió en reposo** como servidor de desarrollo, sin navegadores conectados.
- Las últimas una o dos lecturas de cada serie caen después de la carga: por eso se reporta la mediana.

## Reproducibilidad del entorno

La medición usó un contenedor desechable de MySQL (`docker run -d --name sirai-mysql -e MYSQL_ROOT_PASSWORD=… -p 3306:3306 mysql:8.0`),
el esquema de `schema.sql` y el seed del proyecto. Para mantener el esquema alineado con el código actual, a esa base se le quitó
la columna `codigo_credencial` de `infantes` y `tutores`, como hizo el equipo en el issue 15.
