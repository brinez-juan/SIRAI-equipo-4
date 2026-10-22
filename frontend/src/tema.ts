import {
  defaultDarkTheme,
  defaultLightTheme,
  type RaThemeOptions,
} from "react-admin";
import type { Preferencias } from "./preferencias";

// Tema de MUI que recibe <Admin>. Parte de los temas de react-admin con la paleta guinda del Figma v3
// (página 00, colección «SIRAI · Colores»). Las preferencias de accesibilidad se aplican encima.

// [IA] Generado con Claude (prompt #43 en docs/ia/prompts.md). Revisado por: pendiente
// Variables de color del Figma. Si un color cambia en el Figma, se cambia aquí y en ningún otro lado:
// ninguna pantalla escribe colores, todas usan las claves del tema (color="error", text.secondary…).
export const COLORES = {
  primario: "#691C32",
  primarioOscuro: "#4A1223",
  primarioTinte: "#F1E6EA",
  exito: "#235B4E",
  exitoFondo: "#E6F2EF",
  exitoTexto: "#1B4A3F",
  advertencia: "#7A5B2A",
  advertenciaFondo: "#FBF3E4",
  advertenciaTexto: "#5A4220",
  error: "#B42318",
  errorFondo: "#FEE4E2",
  errorTexto: "#7A1A12",
  foco: "#1A56DB",
  infoFondo: "#EEF3FD",
  infoTexto: "#0B3A9E",
  texto: "#1C1B1F",
  texto2: "#4B5563",
  borde: "#767B84",
  linea: "#E0E0E0",
  campo: "#F0F0F0",
  fondo: "#FAFAFA",
  papel: "#FFFFFF",
  barraFormulario: "#F5F5F5",
  aviso: "#323232",
  negro: "#000000",
};

// [IA] Generado con Claude (prompt #43 en docs/ia/prompts.md). Revisado por: pendiente
// Paleta guinda sobre el tema claro de react-admin. secondary también es guinda porque la barra
// superior de react-admin usa color="secondary". info es el azul del foco (avisos y alertas de info).
const temaGuinda: RaThemeOptions = {
  ...defaultLightTheme,
  palette: {
    ...defaultLightTheme.palette,
    primary: {
      main: COLORES.primario,
      dark: COLORES.primarioOscuro,
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: COLORES.primario,
      dark: COLORES.primarioOscuro,
      contrastText: "#FFFFFF",
    },
    success: { main: COLORES.exito, contrastText: "#FFFFFF" },
    warning: { main: COLORES.advertencia, contrastText: "#FFFFFF" },
    error: { main: COLORES.error, contrastText: "#FFFFFF" },
    info: { main: COLORES.foco, contrastText: "#FFFFFF" },
    text: { primary: COLORES.texto, secondary: COLORES.texto2 },
    divider: COLORES.linea,
    background: { default: COLORES.fondo, paper: COLORES.papel },
  },
};

// Foco visible (P7): azul del documento de accesibilidad y una separación del color del fondo
const FOCO = {
  claro: { color: COLORES.foco, separacion: "#FFFFFF" },
  oscuro: { color: "#8AB4F8", separacion: "#121212" },
};

// Alto contraste (≥ 7:1): texto negro, guinda oscuro, bordes de 2 px y foco amarillo con borde negro
const NEGRO = COLORES.negro;
const GUINDA_OSCURO = COLORES.primarioOscuro;
const AMARILLO_FOCO = "#FFD400";

const temaAltoContraste: RaThemeOptions = {
  ...defaultLightTheme,
  palette: {
    primary: { main: GUINDA_OSCURO, contrastText: "#FFFFFF" },
    secondary: { main: GUINDA_OSCURO, contrastText: "#FFFFFF" },
    text: { primary: NEGRO, secondary: NEGRO },
    divider: NEGRO,
    background: { default: "#FFFFFF", paper: "#FFFFFF" },
  },
  components: {
    ...defaultLightTheme.components,
    MuiFilledInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          boxShadow: `inset 0 0 0 2px ${NEGRO}`,
          "&:hover, &.Mui-focused": { backgroundColor: "#FFFFFF" },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderWidth: 2, borderColor: NEGRO },
      },
    },
    MuiButton: {
      styleOverrides: {
        outlined: { borderWidth: 2, "&:hover": { borderWidth: 2 } },
      },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderBottomColor: NEGRO } },
    },
    MuiLink: { defaultProps: { underline: "always" } },
    RaToolbar: {
      styleOverrides: {
        root: { backgroundColor: "#FFFFFF", borderTop: `2px solid ${NEGRO}` },
      },
    },
  },
};

// «Resaltar el foco»: amarillo fosforescente, igual en todos los controles, modos y contrastes
const AMARILLO_FOSFORESCENTE = "#FFFF00";

// [IA] Generado con Claude (prompt #32 en docs/ia/prompts.md). Revisado por: pendiente
// Anillo de foco. Normal: 3 px azul con separación. Alto contraste: borde negro con amarillo por fuera.
// «Resaltar el foco»: 4 px amarillo fosforescente entre dos bordes negros, para que se vea igual
// sobre fondos claros, oscuros y de cualquier color.
const anilloDeFoco = (prefs: Preferencias, modo: "claro" | "oscuro") => {
  if (prefs.focoReforzado) {
    return {
      outline: `4px solid ${AMARILLO_FOSFORESCENTE}`,
      outlineOffset: 2,
      boxShadow: `0 0 0 2px ${NEGRO}, 0 0 0 8px ${NEGRO}`,
    };
  }
  if (prefs.contraste == "alto") {
    return {
      outline: `3px solid ${NEGRO}`,
      outlineOffset: 0,
      boxShadow: `0 0 0 6px ${AMARILLO_FOCO}`,
    };
  }
  const { color, separacion } = FOCO[modo];
  return {
    outline: `3px solid ${color}`,
    outlineOffset: 2,
    boxShadow: `0 0 0 2px ${separacion}`,
  };
};

// [IA] Generado con Claude (prompt #32 en docs/ia/prompts.md). Revisado por: pendiente
// Aplica las preferencias sobre un tema base. Todo pasa por el tema de MUI; no se toca el DOM.
// - Tamaño del texto: MUI mide en rem, así que basta con cambiar el font-size de <html>.
// - Reducir animaciones: si el usuario lo pide o si el sistema operativo lo pide.
const conPreferencias = (
  base: RaThemeOptions,
  prefs: Preferencias,
  modo: "claro" | "oscuro",
): RaThemeOptions => {
  const sinAnimaciones =
    prefs.reducirAnimaciones ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return {
    ...base,
    ...(sinAnimaciones ? { transitions: { create: () => "none" } } : {}),
    components: {
      ...base.components,
      MuiCssBaseline: {
        styleOverrides: {
          html: { fontSize: `${prefs.escala}%` },
          // "html *" para ganarle al outline: 0 de los botones de MUI. .Mui-focusVisible es el control
          // visible de radios, casillas e interruptores: el <input> que recibe el foco es invisible.
          "html *:focus-visible, html .Mui-focusVisible": anilloDeFoco(
            prefs,
            modo,
          ),
          // Con «Resaltar el foco» se quita la onda de color de MUI al enfocar: solo queda el amarillo
          ...(prefs.focoReforzado
            ? { "html .MuiTouchRipple-ripplePulsate": { display: "none" } }
            : {}),
        },
      },
      ...(sinAnimaciones
        ? { MuiButtonBase: { defaultProps: { disableRipple: true } } }
        : {}),
    },
  };
};

// [IA+Humano] Base generada con Claude (prompt #32 en docs/ia/prompts.md), modificada por: pendiente. Modificado con el prompt #43.
export const crearTema = (prefs: Preferencias): RaThemeOptions =>
  conPreferencias(
    prefs.contraste == "alto" ? temaAltoContraste : temaGuinda,
    prefs,
    "claro",
  );

// [IA] Generado con Claude (prompt #32 en docs/ia/prompts.md). Revisado por: pendiente
// Con alto contraste no hay tema oscuro (no se diseñó): App.tsx pasa darkTheme={null}.
export const crearTemaOscuro = (prefs: Preferencias): RaThemeOptions =>
  conPreferencias(defaultDarkTheme, prefs, "oscuro");
