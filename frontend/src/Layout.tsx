import { forwardRef, useEffect, type ReactNode } from "react";
import {
  Layout as RALayout,
  AppBar,
  CheckForApplicationUpdate,
  Logout,
  Menu,
  TitlePortal,
  UserMenu,
  useGetIdentity,
  usePermissions,
  useResourceDefinitions,
  useUserMenu,
} from "react-admin";
import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import { Link } from "react-router-dom";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import AssessmentIcon from "@mui/icons-material/Assessment";
import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import { PAGINAS, puedeVer } from "./permisos";

// Recursos que se abren desde el menú del usuario y no desde el menú lateral
const FUERA_DEL_MENU_LATERAL = ["preferencias"];

// [IA+Humano] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Menú lateral: Inicio, las páginas propias que el rol puede abrir (PAGINAS de permisos.ts)
// y luego los <Resource> que App.tsx ya filtró por rol. Es lo mismo que <Menu.ResourceItems />,
// pero sin los recursos de FUERA_DEL_MENU_LATERAL.
const MenuPorRol = () => {
  const { permissions: rol } = usePermissions();
  const recursos = useResourceDefinitions();
  return (
    <Menu>
      <Menu.DashboardItem />
      {puedeVer(PAGINAS["pase-lista"], rol) && (
        <Menu.Item
          to="/pase-lista"
          primaryText="Pase de lista"
          leftIcon={<FactCheckIcon />}
        />
      )}
      {puedeVer(PAGINAS.reportes, rol) && (
        <Menu.Item
          to="/reportes"
          primaryText="Reportes de asistencia"
          leftIcon={<AssessmentIcon />}
        />
      )}
      {Object.keys(recursos)
        .filter(
          (nombre) =>
            recursos[nombre].hasList &&
            !FUERA_DEL_MENU_LATERAL.includes(nombre),
        )
        .map((nombre) => (
          <Menu.ResourceItem key={nombre} name={nombre} />
        ))}
    </Menu>
  );
};

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Opción del menú del usuario que abre la pantalla X-01. forwardRef porque el menú de MUI le pasa
// una referencia para moverse con las flechas; onClose cierra el menú al elegirla.
const OpcionPreferencias = forwardRef<HTMLAnchorElement>((props, ref) => {
  const { onClose } = useUserMenu() ?? {};
  return (
    <MenuItem
      {...props}
      ref={ref}
      component={Link}
      to="/preferencias"
      onClick={onClose}
    >
      <ListItemIcon>
        <AccessibilityNewIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Preferencias de accesibilidad</ListItemText>
    </MenuItem>
  );
});
OpcionPreferencias.displayName = "OpcionPreferencias";

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Menú del usuario (arriba a la derecha). label={nombre}: el botón se anuncia con el nombre de la
// persona y no con «Perfil» (corrección P2 del issue 32).
const MenuDelUsuario = () => {
  const { data: identidad } = useGetIdentity();
  return (
    <UserMenu label={identidad?.fullName}>
      <OpcionPreferencias />
      <Logout />
    </UserMenu>
  );
};

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// El título de cada vista (el que react-admin pone en la barra) es el único h1 de la página (P4);
// los títulos dentro de las páginas empiezan en h2. Se ve igual: solo cambia la etiqueta.
const BarraSuperior = () => (
  <AppBar userMenu={<MenuDelUsuario />}>
    <TitlePortal component="h1" className="RaAppBar-title" />
  </AppBar>
);

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Título de la pestaña del navegador por vista (P3): copia el título de la barra superior,
// por ejemplo «Pase de lista · SIRAI». react-admin no cambia document.title por su cuenta.
const TituloDeLaPestana = () => {
  useEffect(() => {
    const titulo = document.getElementById("react-admin-title");
    if (!titulo) return;
    const copiar = () => {
      const texto = titulo.textContent?.trim();
      // Las vistas sin título propio muestran el de <Admin title="SIRAI">: no se repite
      document.title = texto && texto != "SIRAI" ? `${texto} · SIRAI` : "SIRAI";
    };
    copiar();
    const observador = new MutationObserver(copiar);
    observador.observe(titulo, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observador.disconnect();
  }, []);
  return null;
};

export const Layout = ({ children }: { children: ReactNode }) => (
  <RALayout menu={MenuPorRol} appBar={BarraSuperior}>
    {children}
    <TituloDeLaPestana />
    <CheckForApplicationUpdate />
  </RALayout>
);
