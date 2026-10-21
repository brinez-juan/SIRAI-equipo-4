import type { ReactNode } from "react";
import {
  Layout as RALayout,
  CheckForApplicationUpdate,
  Menu,
  usePermissions,
} from "react-admin";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import { PAGINAS, puedeVer } from "./permisos";

// [IA] Generado con Claude (prompt #14 en docs/ia/prompts.md). Revisado por: pendiente
// Menú lateral: Inicio, las páginas propias que el rol puede abrir (PAGINAS de permisos.ts)
// y luego los <Resource> que App.tsx ya filtró por rol.
const MenuPorRol = () => {
  const { permissions: rol } = usePermissions();
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
      <Menu.ResourceItems />
    </Menu>
  );
};

export const Layout = ({ children }: { children: ReactNode }) => (
  <RALayout menu={MenuPorRol}>
    {children}
    <CheckForApplicationUpdate />
  </RALayout>
);
