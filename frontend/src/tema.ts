import {
  defaultDarkTheme,
  defaultLightTheme,
  type RaThemeOptions,
} from "react-admin";
import type { Preferencias } from "./preferencias";

// Tema de MUI que recibe <Admin>. Por ahora parte de los temas de react-admin; la paleta guinda
// del Figma (issue 32.1 / D1) se cambia aquí sin tocar cómo se aplican las preferencias.

// Foco visible (P7): azul del documento de accesibilidad y una separación del color del fondo
const FOCO = {
  claro: { color: "#1A56DB", separacion: "#FFFFFF" },
  oscuro: { color: "#8AB4F8", separacion: "#121212" },
};

// Alto contraste (≥ 7:1): texto negro, guinda oscuro, bordes de 2 px y foco amarillo con borde negro
const NEGRO = "#000000";
const GUINDA_OSCURO = "#4A1223";
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

// [IA] Generado con Claude (prompt #32 en docs/ia/prompts.md). Revisado por: pendiente
// Anillo de foco: 3 px normal, 4 px con halo si se pide «Resaltar el foco». En alto contraste,
// borde negro con amarillo por fuera para que se vea sobre fondos claros y oscuros.
const anilloDeFoco = (prefs: Preferencias, modo: "claro" | "oscuro") => {
  const grosor = prefs.focoReforzado ? 4 : 3;
  if (prefs.contraste == "alto") {
    return {
      outline: `${grosor}px solid ${NEGRO}`,
      outlineOffset: 0,
      boxShadow: `0 0 0 ${grosor * 2}px ${AMARILLO_FOCO}`,
    };
  }
  const { color, separacion } = FOCO[modo];
  const halo = prefs.focoReforzado ? `, 0 0 0 ${grosor + 6}px ${color}66` : "";
  return {
    outline: `${grosor}px solid ${color}`,
    outlineOffset: 2,
    boxShadow: `0 0 0 2px ${separacion}${halo}`,
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
          // "html *" para ganarle al outline: 0 de los botones de MUI
          "html *:focus-visible": anilloDeFoco(prefs, modo),
        },
      },
      ...(sinAnimaciones
        ? { MuiButtonBase: { defaultProps: { disableRipple: true } } }
        : {}),
    },
  };
};

// [IA] Generado con Claude (prompt #32 en docs/ia/prompts.md). Revisado por: pendiente
export const crearTema = (prefs: Preferencias): RaThemeOptions =>
  conPreferencias(
    prefs.contraste == "alto" ? temaAltoContraste : defaultLightTheme,
    prefs,
    "claro",
  );

// [IA] Generado con Claude (prompt #32 en docs/ia/prompts.md). Revisado por: pendiente
// Con alto contraste no hay tema oscuro (no se diseñó): App.tsx pasa darkTheme={null}.
export const crearTemaOscuro = (prefs: Preferencias): RaThemeOptions =>
  conPreferencias(defaultDarkTheme, prefs, "oscuro");
