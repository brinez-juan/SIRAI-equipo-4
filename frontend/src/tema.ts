import {
  defaultDarkTheme,
  defaultLightTheme,
  type RaThemeOptions,
} from "react-admin";
import type { Theme } from "@mui/material";
import type { Preferencias } from "./preferencias";

// Tema de MUI que recibe <Admin>. Parte de los temas de react-admin con la paleta guinda del Figma v3
// (página 00, colección «SIRAI · Colores»). Las preferencias de accesibilidad se aplican encima.

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
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

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Ajustes del Figma que no dependen del color: los comparten los temas claro, oscuro y alto contraste.
// Donde hace falta un color se toma de la paleta de cada tema.
const COMPONENTES_COMUNES: RaThemeOptions["components"] = {
  // Campos de los formularios de react-admin a 400 px, como en el Figma (Editar infante, Agregar tutor).
  // react-admin 5 los pone a todo lo ancho. Solo se limitan los de texto, selección, fecha y búsqueda:
  // los radios e interruptores no, y los formularios de MUI propios (contactos, diálogos) fijan el suyo.
  RaTextInput: { styleOverrides: { root: { maxWidth: 400 } } },
  RaSelectInput: { styleOverrides: { root: { maxWidth: 400 } } },
  RaDateInput: { styleOverrides: { root: { maxWidth: 400 } } },
  RaAutocompleteInput: { styleOverrides: { root: { maxWidth: 400 } } },
  // «ToggleButton (pase de lista)»: texto principal a 14 px. MUI usa 13 px y gris al 54 % en size="small"
  MuiToggleButton: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        color: theme.palette.text.primary,
      }),
      sizeSmall: { fontSize: "0.875rem" },
    },
  },
  // G-03 «No encontrado»: react-admin baja el texto con opacity 0.5 (3.25:1); se usa text.secondary
  RaNotFound: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        "& .RaNotFound-message": {
          opacity: 1,
          color: theme.palette.text.secondary,
        },
      }),
    },
  },
};

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
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
  // [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
  // Componentes de la página 00 del Figma. El aviso de useNotify no se toca: el de info ya sale en
  // #323232 (MUI lo calcula del fondo) y los de éxito, error y advertencia toman la paleta.
  components: {
    ...defaultLightTheme.components,
    ...COMPONENTES_COMUNES,
    // «Opción del menú lateral»: la activa con fondo guinda claro, borde izquierdo de 3 px y negritas.
    // El padding compensa el borde para que el ícono no se mueva al cambiar de opción.
    RaMenuItemLink: {
      styleOverrides: {
        root: {
          "&.RaMenuItemLink-active": {
            backgroundColor: COLORES.primarioTinte,
            borderLeft: `3px solid ${COLORES.primario}`,
            paddingLeft: 13,
            color: COLORES.primario,
            fontWeight: 700,
            "& .RaMenuItemLink-icon": { color: COLORES.primario },
          },
        },
      },
    },
    // Barra de Guardar de los formularios
    RaToolbar: {
      styleOverrides: { root: { backgroundColor: COLORES.barraFormulario } },
    },
    // «Campo» (TextInput, SelectInput, DateInput): fondo gris y línea inferior gris oscuro;
    // al enfocar la línea es guinda (primary) y con error roja, como ya hace MUI.
    MuiFilledInput: {
      styleOverrides: {
        root: {
          backgroundColor: COLORES.campo,
          "&.Mui-focused, &.Mui-disabled": { backgroundColor: COLORES.campo },
          "&::before": { borderBottomColor: COLORES.borde },
        },
      },
    },
    // G-01: fondo guinda oscuro sin el degradado de react-admin, tarjeta centrada y avatar guinda
    // (react-admin pide secondary[500], que la paleta no tiene, y el avatar saldría gris)
    RaLogin: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: COLORES.primarioOscuro,
          justifyContent: "center",
          "& .RaLogin-card": { marginTop: 0 },
          "& .RaLogin-icon": { backgroundColor: COLORES.primario },
        },
      },
    },
    // «Alert» estándar: fondo claro y texto oscuro de cada severidad; el ícono queda en el color
    // fuerte de la paleta (info = azul del foco)
    MuiAlert: {
      styleOverrides: {
        standardInfo: {
          backgroundColor: COLORES.infoFondo,
          color: COLORES.infoTexto,
        },
        standardWarning: {
          backgroundColor: COLORES.advertenciaFondo,
          color: COLORES.advertenciaTexto,
        },
        standardError: {
          backgroundColor: COLORES.errorFondo,
          color: COLORES.errorTexto,
        },
        standardSuccess: {
          backgroundColor: COLORES.exitoFondo,
          color: COLORES.exitoTexto,
        },
      },
    },
  },
};

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Colores del modo oscuro. El Figma no tiene versión oscura: se midieron contra el fondo #313131 de
// react-admin. Sobre el guinda claro el texto va en negro (10.35:1); en blanco sería 2.03:1.
const OSCURO = {
  primario: "#E8A3B6", // 6.41:1 sobre #313131
  primarioTinte: "#45282F", // fondo de la opción activa del menú; el guinda claro encima da 6.48:1
  // El #F44336 de MUI da 3.53:1 como texto y 3.68:1 en el chip «Rojo». Este da 5.06:1 sobre la barra
  // de Guardar (#424242, el fondo más claro donde va texto rojo) y 10.57:1 con texto negro encima.
  error: "#F4A39C",
};

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Tema oscuro guinda. La barra superior queda en guinda oscuro con texto blanco (14.98:1) para que
// SIRAI se reconozca igual en los dos modos: MUI la pintaría gris porque en oscuro ignora secondary.
// Éxito, advertencia e info se quedan con los de MUI para fondo oscuro (≥ 5.5:1); el error se aclara.
const temaGuindaOscuro: RaThemeOptions = {
  ...defaultDarkTheme,
  palette: {
    ...defaultDarkTheme.palette,
    primary: { main: OSCURO.primario, contrastText: COLORES.negro },
    secondary: { main: OSCURO.primario, contrastText: COLORES.negro },
    error: { main: OSCURO.error, contrastText: COLORES.negro },
  },
  components: {
    ...defaultDarkTheme.components,
    ...COMPONENTES_COMUNES,
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: COLORES.primarioOscuro,
          backgroundImage: "none",
          color: "#FFFFFF",
        },
      },
    },
    RaMenuItemLink: {
      styleOverrides: {
        root: {
          "&.RaMenuItemLink-active": {
            backgroundColor: OSCURO.primarioTinte,
            borderLeft: `3px solid ${OSCURO.primario}`,
            paddingLeft: 13,
            color: OSCURO.primario,
            fontWeight: 700,
            "& .RaMenuItemLink-icon": { color: OSCURO.primario },
          },
        },
      },
    },
    RaLogin: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: COLORES.primarioOscuro,
          justifyContent: "center",
          "& .RaLogin-card": { marginTop: 0 },
          "& .RaLogin-icon": { backgroundColor: OSCURO.primario },
        },
      },
    },
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
    ...COMPONENTES_COMUNES,
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

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
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

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
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

// [IA+Humano] Base generada con Claude (prompt #32 en docs/ia/prompts.md), modificada por: pendiente. Modificado con el prompt #43.
// Con alto contraste no hay tema oscuro (no se diseñó): App.tsx pasa darkTheme={null}.
export const crearTemaOscuro = (prefs: Preferencias): RaThemeOptions =>
  conPreferencias(temaGuindaOscuro, prefs, "oscuro");
