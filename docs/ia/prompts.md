# Prompts usados (registro numerado)

Cada comentario `[IA]` / `[IA+Humano]` del código cita aquí el número del prompt.

**El número del prompt es el número del issue** (`#3` = prompt del issue 03, `#4` = prompt del issue 04).
Cada integrante registra aquí los prompts de sus issues con esta misma estructura:
número, quién, para qué, dónde se cita y el texto literal. Si un issue necesita más de un prompt,
se agregan como `#3b`, `#3c`.

Herramienta: Claude (Claude Code).

---

## #3 · Issue 03: Frontend base (login, rol y menú)
- **Quién:** Oscar
- **Para qué:** `authProvider`, menú por rol en `App.tsx`, Vite con HTTPS, textos en español. Claude generó el código; Oscar lo revisa y hace los commits.
- **Citado en:** `frontend/src/authProvider.ts`, `App.tsx`, `permisos.ts`, `i18n.ts`, `paginas/Inicio.tsx`, `recursos/Regiones.tsx`, `recursos/Estancias.tsx`.
- **Prompt:**
  ```
  #### 03 · Frontend base: login, rol y menú
  **Responsable:** Jesús · **SP:** 2 · **Depende de:** — · **Rúbrica:** el frontend usa autenticación, HTTPS

  - Borrar `Productos.tsx` y `registrarse.tsx`.
  - `authProvider`:
    - guarda token, rol y nombre;
    - implementa `getPermissions` (devuelve el rol) y `getIdentity`;
    - en 401 manda al login.
  - `App.tsx` muestra cada `<Resource>` o página según el rol (tabla 2.5).
  - Vite con HTTPS (`server.https`, mismos certificados que el backend). `VITE_BACKEND=https://localhost:3000`.
  - Textos en español y `<html lang="es">`.

  **Listo cuando:** cada usuario del seed entra y ve solo su menú.
  ```

## #4 · Issue 04: Convención de IA y carpeta de documentación
- **Quién:** Oscar
- **Para qué:** crear `docs/ia/declaracion.md`, `docs/ia/prompts.md`, la plantilla de PR y revisar los comentarios de IA del backend.
- **Citado en:** ninguno. Solo se agregó el comentario `[Humano]` a `backend/index.js`; el resto de las funciones del backend ya tenía el suyo.
- **Prompt:**
  ```
  #### 04 · Convención de IA y carpeta de documentación
  **Responsable:** Oscar · **SP:** 1 · **Depende de:** — · **Rúbrica:** declaración de AI

  - Crear `docs/ia/declaracion.md` (roles en los que se usó IA: programación, consulta, corrección de errores…) y `docs/ia/prompts.md` (prompts numerados).
  - Pasar a `prompts.md` los prompts que ya se usaron: migración a MySQL, esquema y este plan.
  - Agregar el comentario `[IA]`/`[Humano]` a cada función que ya existe en el backend.
  - Plantilla de PR (`.github/pull_request_template.md`) con el checklist: autenticar + permitir, comentario de IA, prompt registrado.
  ```

## #7 · Issue 07: Cifrado AES-256 de campos sensibles
- **Quién:** Oscar (responsable en el plan: Briñez)
- **Para qué:** `cifrado.js` con `cifrar`/`descifrar` (aes-256-gcm) y la opción `cifrados` en `crud.js`. Claude generó el código; Oscar lo revisa.
- **Citado en:** `backend/cifrado.js`, `backend/crud.js` (`paraRespuesta`, `valoresParaEscribir`).
- **Prompt:**
  ```
  #### 07 · Cifrado AES-256 de campos sensibles
  **Responsable:** Briñez · **SP:** 1 · **Depende de:** 01 · **Rúbrica:** seguridad (SRS: cifrado de teléfonos y notas)

  - `cifrado.js` con `cifrar(texto)` y `descifrar(texto)` usando `aes-256-gcm` y `LLAVE_CIFRADO` del `.env`. Son unas 20 líneas con `crypto`.
  - En `crud.js`, una opción `cifrados: ["telefono_cifrado"]` en la configuración del recurso: cifra al escribir y descifra al leer.
  ```

## #10 · Issue 10: Tutores y consentimiento de privacidad
- **Quién:** Oscar (responsable en el plan: Jesús)
- **Para qué:** recurso `Tutores` (backend y frontend) con teléfono cifrado, casilla obligatoria de aviso de privacidad y fila en `consentimientos`. Claude generó el código; Oscar lo revisa.
- **Citado en:** `backend/rutas/tutores.js`, `backend/crud.js` (opciones `alcance`, `generados`, `validar` y `alCrear`), `frontend/src/recursos/Tutores.tsx`.
- **Prompt:**
  ```
  #### 10 · Tutores y consentimiento de privacidad
  **Responsable:** Jesús · **SP:** 2 · **Depende de:** 07, 09 · **Rúbrica:** SRS, consentimiento y cifrado

  - Recurso `Tutores` con el teléfono cifrado (opción del issue 07).
  - Al crear un tutor, el formulario exige marcar *"Acepta el aviso de privacidad y el contacto telefónico"*. El backend inserta la fila en `consentimientos` (`version_aviso = '2026.1'`, `registrado_por` = usuario). Sin esa casilla, responde 400.
  - Lo gestionan `DIRECTORA` y `TRABAJO_SOCIAL`.
  ```

## #12 · Issue 12: Contactos de emergencia
- **Quién:** Oscar (responsable en el plan: Jesús)
- **Para qué:** `/infantes/:id/contactos` (listar, agregar, editar y borrar) con teléfono cifrado y prioridad, y la sección de contactos en la ficha del infante. Claude generó el código; Oscar lo revisa.
- **Citado en:** `backend/rutas/contactos.js`, `frontend/src/api.ts`, `frontend/src/recursos/ContactosEmergencia.tsx`.
- **Prompt:**
  ```
  #### 12 · Contactos de emergencia
  **Responsable:** Jesús · **SP:** 1 · **Depende de:** 07, 09

  - `/infantes/:id/contactos` con nombre, parentesco, teléfono (cifrado) y prioridad 1, 2, 3…
  - Se muestran en la ficha del infante, debajo de los tutores.
  ```

## #16 · Issue 16: Salida con tutor autorizado
- **Quién:** Oscar (responsable en el plan: Adolfo)
- **Para qué:** `PUT /pase-lista/:infanteId/salida` con validación de tutor autorizado, y el componente "Registrar salida" para el renglón de cada infante presente. Claude generó el código; Oscar lo revisa.
- **Citado en:** `backend/rutas/salida.js`, `frontend/src/dataProvider.ts` (`registrarSalida`), `frontend/src/paginas/SalidaConTutor.tsx`.
- **Prompt:**
  ```
  #### 16 · Salida con tutor autorizado
  **Responsable:** Adolfo · **SP:** 2 · **Depende de:** 11, 13

  - `PUT /pase-lista/:infanteId/salida {tutor_id}`: valida que el tutor esté vinculado con `autorizado_recoger = 1`; si no, responde 403 *"Tutor no autorizado"*. Guarda `hora_salida` y `tutor_salida_id`.
  - En el renglón de cada infante presente, un botón "Registrar salida" que despliega solo los tutores autorizados.
  ```

## #17 · Issue 17: Cierre del pase de lista → faltas y tickets
- **Quién:** Oscar (responsable en el plan: Jesús)
- **Para qué:** `POST /cierres {fecha, turno}` en una transacción (faltas injustificadas, seguimientos y registro del cierre) y el botón "Cerrar pase de lista" con confirmación. Claude generó el código; Oscar lo revisa.
- **Citado en:** `backend/rutas/cierres.js`, `frontend/src/dataProvider.ts` (`cerrarPaseLista`), `frontend/src/paginas/CerrarPaseLista.tsx`.
- **Prompt:**
  ```
  #### 17 · Cierre del pase de lista → faltas y tickets
  **Responsable:** Jesús · **SP:** 2 · **Depende de:** 13 · **Camino crítico**

  - `POST /cierres {fecha, turno}` (solo `DIRECTORA`), todo en **una transacción**:
    1. Los infantes sin registro quedan como `FALTA_INJUSTIFICADA`.
    2. Por cada asistencia cuyo estado tenga `genera_seguimiento = 1`, se inserta un `seguimientos` en `ABIERTO`.
    3. Se inserta `cierres_pase_lista` (`automatico = 0`, `cerrado_por` = usuario).
  - Botón "Cerrar pase de lista" en `PaseLista.tsx`, con confirmación.
  ```

## #23 · Issue 23: Clasificar causa y fecha de retorno
- **Quién:** Oscar (responsable en el plan: Oscar)
- **Para qué:** `PUT /seguimientos/:id/clasificar` (detalle cifrado, estado `CLASIFICADO`), `GET /causas` con la asesoría de cada causa, y el formulario de clasificación que muestra la asesoría y, para NO_LOC, los contactos por prioridad. Claude generó el código; Oscar lo revisa.
- **Citado en:** `backend/rutas/seguimientos.js`, `backend/rutas/causas.js`, `frontend/src/dataProvider.ts` (`causasInasistencia`, `clasificarSeguimiento`), `frontend/src/paginas/ClasificarSeguimiento.tsx`.
- **Prompt:**
  ```
  #### 23 · Clasificar causa y fecha de retorno
  **Responsable:** Oscar · **SP:** 2 · **Depende de:** 20

  - `PUT /seguimientos/:id/clasificar {causa_codigo, detalle, fecha_probable_retorno}`: el detalle se guarda cifrado y el estado pasa a `CLASIFICADO`.
  - En pantalla aparece el texto de `asesoria` de la causa elegida.
  - Si la causa es `NO_LOC`, se muestra la lista de contactos de emergencia por prioridad para llamarles (issue 22).
  ```

## #26 · Issue 26: Tablero semáforo (backend)
- **Quién:** Oscar (responsable en el plan: Jesús)
- **Para qué:** `GET /tablero?fecha=` con total, presentes, porcentaje y semáforo por estancia, anonimizado. Claude generó el código; Oscar lo revisa.
- **Citado en:** `backend/rutas/tablero.js`.
- **Prompt:**
  ```
  #### 26 · Tablero semáforo (backend)
  **Responsable:** Jesús · **SP:** 2 · **Depende de:** 13 · **Rúbrica:** el frontend no recibe lo que no debe (anonimización)

  - `GET /tablero?fecha=` devuelve, por estancia, solo `{estancia, total, presentes, porcentaje, semaforo}`. **Nada de nombres ni matrículas.**
  - `SUPERVISOR` ve las estancias de su región; `ADMIN_CENTRAL` ve todas.
  - Umbrales en constantes: verde ≥ 90 %, amarillo ≥ 75 %, rojo < 75 %.
  ```

## #33 · Issue 33: Medición de CPU y memoria
- **Quién:** Oscar (responsable en el plan: Jesús)
- **Para qué:** script de medición de CPU y RAM por proceso (`backend/pruebas/medicion.js`) y el documento `docs/infraestructura.md` con los resultados reales y los requisitos recomendados. Claude levantó MySQL en Docker, corrió la carga con autocannon y redactó el documento; Oscar lo revisa.
- **Citado en:** `backend/pruebas/medicion.js`.
- **Prompt:**
  ```
  #### 33 · Medición de CPU y memoria
  **Responsable:** Jesús · **SP:** 1 · **Depende de:** fase 2 · **Rúbrica:** noción de CPU y memoria por proceso

  - Con backend, frontend y MySQL corriendo, medir con `htop` (o el Administrador de tareas) en reposo y bajo carga.
  - Carga: `npx autocannon -c 212 -d 30 https://localhost:3000/pase-lista...` (212 = una petición por estancia, lo que pide el SRS).
  - Tabla de CPU y RAM por proceso, más los requisitos mínimos recomendados, en `docs/infraestructura.md`.
  ```

## #41 · Feature 41: Desactivar regiones y estancias (sin issue en el plan)
- **Quién:** Jesús
- **Para qué:** botón "Desactivar" (borrado lógico) en la edición de regiones y estancias, y la regla del backend que lo rechaza con 409 mientras tengan estancias, infantes o usuarios activos. Después, "Mostrar desactivadas" en las listas y el botón "Activar" (`POST /<recurso>/:id/activar`, bitácora `REACTIVAR`); una estancia no se activa si su región sigue desactivada. Claude generó el código; Jesús lo revisa y hace los commits.
- **Citado en:** `backend/crud.js` (opciones `alBorrar`, `reactivable` y `alActivar`), `backend/rutas/catalogos.js`, `frontend/src/dataProvider.ts`, `frontend/src/recursos/Desactivadas.tsx`, `Regiones.tsx`, `Estancias.tsx`.
- **Prompt:**
  ```
  Admin: Estancias: No existe la posibilidad de eliminar regiones o desactivarlas.
  Regiones: No existe la posibilidad de eliminar regiones o desactivarlas.

  Haz estos cambios siguiendo las reglas impuestas por el claude md, las skills y dime cuando y a donde probar cada uno de los features

  cuando se desactiva debe de salir la opcion de activar para no tener que crear nuevamente la estancia
  ```

## #42 · Feature 42: Justificación de la inasistencia (sin issue en el plan)
- **Quién:** Jesús
- **Para qué:** al marcar "Ausente justificado" en el pase de lista se pide el motivo (catálogo `causas_inasistencia`, sin "Sin respuesta") y una nota opcional cifrada. El motivo se ve en el pase de lista, el historial y el detalle del seguimiento (donde además llena de antemano la clasificación); la nota solo la leen DIRECTORA, TRABAJO_SOCIAL y MEDICO, y cada lectura queda como `READ_CONFIDENCIAL`. Migración `backend/migraciones/42_justificacion_inasistencia.sql`. Claude generó el código; Jesús lo revisa y hace los commits.
- **Citado en:** `backend/migraciones/42_justificacion_inasistencia.sql`, `backend/rutas/asistencia.js`, `backend/rutas/historial.js`, `backend/rutas/seguimientos.js`, `frontend/src/paginas/JustificarInasistencia.tsx`, `PaseLista.tsx`, `Seguimiento.tsx`, `ClasificarSeguimiento.tsx`, `frontend/src/recursos/Asistencias.tsx`, `frontend/src/permisos.ts`.
- **Prompt:**
  ```
  Dudas generales: Donde se pone la informacion de la justificación del infante de su inasistencia si es que existe

  Esta issue no quiero eso, sino que a los alumnos se les puede poner faltas justificada pero no sale el porque o como se logra obetener esto

  (Decisiones elegidas: pedir motivo y nota al marcar; motivo visible para todos y nota restringida; script de migración.)
  ```
