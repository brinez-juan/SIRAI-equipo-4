# Comparación visual: Figma v3 contra la app (issue 43 · D5)

Cada pantalla clave tiene dos imágenes en esta carpeta:

- `<ID>-figma.png`: el frame de la página 01 del Figma, sin la ficha de arriba, a 1440 px de ancho.
- `<ID>-app.png`: la app en `feature/43-diseno-figma` a 1440 × 900 con el usuario del seed que usa el frame. K-01 y S-02 son de página completa porque el frame también es más alto.

Usuarios del seed (contraseña `Sirai#2026`): `directora@sirai.mx` para G-01, G-02, S-01, S-02, T-02 y K-01; `docente@sirai.mx` para O-01; `supervisor@sirai.mx` para T-01.

Se permite que difieran (plan, D5): los **datos** (la app usa los del seed real), los **saltos de línea** por el ancho de los textos y la **sombra** exacta de las tarjetas. Además se aceptan los **estados** que dependen de lo que hizo el usuario (botón Guardar deshabilitado mientras el formulario no cambia, campo con foco, corte seleccionado).

## Seguimiento por pantalla (sección 5 del plan)

✔ = coincide con el Figma · ✖ = falta (se anota qué) · ⏳ = falta exportar el frame del Figma

| ID | Pantalla | Colores (D1) | Componentes (D2) | Ajustes (D3) | Captura (D5) |
|---|---|---|---|---|---|
| G-01 | Inicio de sesión | ✔ | ✔ | — | ✔ |
| G-02 | Inicio | ✔ | ✔ | — | ⏳ solo app |
| G-03 | Acceso denegado / no encontrado | ✔ texto a 7.24:1 (corregido en D5) | ✔ | — | — |
| O-01 | Pase de lista | ✔ | ✔ | ✔ aviso sin ícono · Fecha y Turno en una fila | ✔ |
| O-03 | Historial de asistencia | ✔ | ✔ | — | — |
| K-01 | Infantes | ✔ | ✔ | ✔ encabezado «Acción» y ícono en Quitar · campos de 400 px | ✔ |
| K-02 | Tutores | ✔ | ✔ | ✔ campos de 400 px | — |
| K-04 | Estancias | ✔ | ✔ | ✔ campos de 400 px | — |
| K-06 | Regiones | ✔ | ✔ | ✔ campos de 400 px | — |
| S-01 | Bandeja | ✔ | ✔ | — | ⏳ solo app |
| S-02 | Detalle del seguimiento | ✔ | ✔ | — | ⏳ solo app |
| S-05 | Expediente | ✔ | ✔ | ✔ un solo h1 (título interno a h2) | — |
| T-01 | Tablero | ✔ | ✔ | ✔ campo Día a la derecha | ✔ |
| T-02 | Reportes | ✔ | ✔ | ✔ Desde y Hasta junto a los cortes | ✔ con diferencia de columnas (ver abajo) |
| A-01 | Usuarios | ✔ | ✔ | ✔ encabezado «Acción» · campos de 400 px | — |
| A-02 | Bitácora | ✔ | ✔ | — | — |
| X-01 | Preferencias de accesibilidad | ✔ | ✔ | ✔ un solo h1 | — |

Todas las vistas: el título de la barra superior es el único `h1` y se copia al título de la pestaña («Vista · SIRAI»).

## Diferencias encontradas y qué se hizo

| Pantalla | Diferencia | Resolución |
|---|---|---|
| O-01 | Los botones de «Marcar como» salían en gris y a 13 px; en el Figma van en texto principal a 14 px | **Corregido en D5** (`MuiToggleButton` en `tema.ts`, para los tres temas) |
| G-03 | El texto de «No encontrado» salía al 50 % de opacidad (3.25:1) y la barra decía «React Admin» | **Corregido en D5**: `text.secondary` sin opacidad (`RaNotFound`) y `<Admin title="SIRAI">` |
| Modo oscuro | El rojo #F28B82 de D4 daba 4.21:1 sobre la barra de Guardar (#424242), por ejemplo en «Desactivar» de Editar estancia | **Corregido en D5**: error #F4A39C (5.06:1 sobre la barra, 10.57:1 con texto negro) |
| G-03 | Tiene dos `h1`: el de la barra («SIRAI») y el «No encontrado» que pone React Admin | **Aceptada**: quitarlo exige una página propia, que el plan no permite |
| T-02 | El Figma dice «Filtro sanitario» y pone «Falta injustificada» antes de «Comisión médica». La app dice «Rechazo en filtro sanitario» y las ordena al revés | **Se ajusta el Figma** (D6): las columnas salen del catálogo de estados del backend, que es la fuente de verdad |
| K-01, G-01 y todos los formularios | Entre campos hay más espacio que en el Figma (8 px) | **Aceptada**: React Admin reserva el renglón del mensaje de error para que el formulario no salte cuando aparece |
| O-01 | Las filas de la tabla son un poco más altas que en el Figma | **Aceptada**: es el relleno por defecto de la tabla de MUI; no cambia colores, componentes ni textos |
| K-01 | En el Figma, Tutor muestra «Escriba para buscar» | **Aceptada**: MUI muestra ese texto solo cuando el campo tiene el foco |

## Verificación de contraste

axe (regla `color-contrast`) sin fallas en las 21 vistas revisadas (las 12 pantallas clave y G-03, O-03, K-02, K-02 Editar, S-05, K-04, K-04 Editar, K-06 y A-02), en los tres temas: claro, oscuro y alto contraste.

## Pendientes

- **G-02, S-01 y S-02:** falta exportar sus frames del Figma (`<ID>-figma.png`). El MCP de Figma llegó al límite de llamadas del plan Starter. Se exportan a 1x desde el Figma, sin la ficha, y se revisan contra la captura de la app que ya está aquí.
- **Modo oscuro:** las capturas de O-01, K-01 y T-01 en oscuro están en `../modo-oscuro/` para agregarlas a la página 02 del Figma (sección «Modo oscuro»).
