import { Admin, Resource, type ResourceProps } from "react-admin";
import { Layout } from "./Layout";
import { dataProvider } from "./dataProvider";
import authProvider from "./authProvider";
import { i18nProvider } from "./i18n";
import { Inicio } from "./paginas/Inicio";
import { listarRegiones } from "./recursos/Regiones";
import { listarEstancias } from "./recursos/Estancias";
import {
  crearUsuario,
  editarUsuario,
  listarUsuarios,
} from "./recursos/Usuarios";
import { RECURSOS, puedeVer } from "./permisos";

// Cada issue agrega aquí su línea (y su entrada en permisos.ts con los roles).
const COMPONENTES_RECURSO: Record<string, Omit<ResourceProps, "name">> = {
  Regiones: { list: listarRegiones },
  Estancias: { list: listarEstancias },
  Usuarios: {
    list: listarUsuarios,
    create: crearUsuario,
    edit: editarUsuario,
    recordRepresentation: (r) => `${r.nombre} ${r.primer_apellido}`,
  },
};

// [IA+Humano] Base generada con Claude (prompt #3 en docs/ia/prompts.md), modificada por: pendiente
// react-admin llama a getPermissions (el rol) y este render solo monta lo que ese rol puede ver.
export const App = () => (
  <Admin
    layout={Layout}
    dashboard={Inicio}
    dataProvider={dataProvider}
    authProvider={authProvider}
    i18nProvider={i18nProvider}
    requireAuth
  >
    {(rol: string) =>
      Object.keys(COMPONENTES_RECURSO)
        .filter((nombre) => puedeVer(RECURSOS[nombre], rol))
        .map((nombre) => (
          <Resource
            key={nombre}
            name={nombre}
            {...COMPONENTES_RECURSO[nombre]}
          />
        ))
    }
  </Admin>
);
