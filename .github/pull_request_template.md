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

**General**
- [ ] La rama sale de `develop` y el PR apunta a `develop`.
- [ ] Mis commits son solo de este issue.

### Pendientes / fuera de alcance
<!-- Lo del plan que no se hizo y por qué, o "Ninguno" -->
