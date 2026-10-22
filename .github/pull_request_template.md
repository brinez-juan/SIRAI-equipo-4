## Issue <NN> · <título>

Closes #<N>

### Qué se integró
<!-- 2–3 oraciones: qué problema resuelve y qué puede hacer ahora el usuario/rol -->

### Qué contiene
<!-- Endpoints (MÉTODO /ruta · roles), componentes/pantallas, tablas, variables de .env -->

### Cómo probarlo
1. <pasos con un usuario del seed>

### Checklist (obligatorio antes de pedir revisión)

**Seguridad**
- [ ] Todo endpoint nuevo lleva `permitir(...)` y su router está montado debajo de `app.use(autenticar)` y `app.use(registrarPeticion)` en `backend/index.js` (la única ruta pública es `/login`).
- [ ] Los roles de estancia filtran con `req.usuario.estancia_id`, nunca con datos del request.
- [ ] SQL solo con `?` / `mysql.escapeId`; no se devuelve `password_hash` ni campos `_cifrado` sin descifrar.

**Declaración de IA**
- [ ] Cada función, endpoint o componente nuevo tiene su comentario `[IA]`, `[IA+Humano]` o `[Humano]`.
- [ ] Cada prompt usado está registrado con su número en `docs/ia/prompts.md`.

**Diseño** (solo si el PR cambia la interfaz)
<!-- Figma y código se mantienen iguales (issue 43 · D6):
     - Si cambia el diseño: se comenta en el Figma, se hace un plugin de ajuste que solo cambie lo comentado y, en el mismo issue, se cambia el código.
     - Si cambia el código (se agrega o mueve una pantalla): se actualiza la Tabla 6 del inventario y se dibuja con un plugin que agregue sin redibujar.
     - Nunca se vuelve a correr el plugin v3 sobre el archivo del equipo: redibuja todo y deja sueltos los comentarios. -->
- [ ] ¿Coincide con el Figma? Si no, ¿está el ajuste del Figma o el issue que lo corrige?
- [ ] Ningún color escrito en una pantalla: los colores salen de `frontend/src/tema.ts` (`color="error"`, `text.secondary`…).
- [ ] Cada color nuevo se midió contra su fondo: ≥ 4.5:1 en texto y ≥ 3:1 en bordes e íconos, en modo claro y oscuro.

**General**
- [ ] La rama sale de `develop` y el PR apunta a `develop`.
- [ ] Mis commits son solo de este issue.

### Pendientes / fuera de alcance
<!-- Lo del plan que no se hizo y por qué, o "Ninguno" -->
