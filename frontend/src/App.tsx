import { Admin, Resource, type ResourceProps } from "react-admin";
import { Layout } from "./Layout";
import { dataProvider } from "./dataProvider";
import authProvider from "./authProvider";
import { i18nProvider } from "./i18n";
import { Inicio } from "./paginas/Inicio";
import { ListarRegiones, CrearRegion, EditarRegion } from "./recursos/Regiones";
import {
  ListarEstancias,
  CrearEstancia,
  EditarEstancia,
} from "./recursos/Estancias";
import {
  ListarInfantes,
  CrearInfante,
  EditarInfante,
} from "./recursos/Infantes";
import { ListarTutores, CrearTutor, EditarTutor } from "./recursos/Tutores";
import { ESCRITURA, RECURSOS, puedeVer } from "./permisos";

// Cada issue agrega aquí su línea (y su entrada en permisos.ts con los roles).
// recordRepresentation: lo que se muestra cuando otro recurso apunta a este (ej. la región de una estancia).
const COMPONENTES_RECURSO: Record<string, Omit<ResourceProps, "name">> = {
  Regiones: {
    list: ListarRegiones,
    create: CrearRegion,
    edit: EditarRegion,
    recordRepresentation: "nombre",
  },
  Estancias: {
    list: ListarEstancias,
    create: CrearEstancia,
    edit: EditarEstancia,
    recordRepresentation: "nombre",
  },
  Infantes: {
    list: ListarInfantes,
    create: CrearInfante,
    edit: EditarInfante,
    recordRepresentation: (infante) =>
      `${infante.nombre} ${infante.primer_apellido}`,
  },
  Tutores: {
    list: ListarTutores,
    create: CrearTutor,
    edit: EditarTutor,
    recordRepresentation: (tutor) => `${tutor.nombre} ${tutor.primer_apellido}`,
  },
};

// [IA] Generado con Claude (prompt #9 en docs/ia/prompts.md). Revisado por: pendiente
// Quita create y edit a los roles que solo consultan (tabla ESCRITURA de permisos.ts);
// así react-admin no muestra el botón Crear ni abre el formulario de edición.
const vistasDelRol = (nombre: string, rol: string) => {
  const { create, edit, ...resto } = COMPONENTES_RECURSO[nombre];
  return puedeVer(ESCRITURA[nombre] ?? RECURSOS[nombre], rol)
    ? { create, edit, ...resto }
    : resto;
};

// [IA+Humano] Base generada con Claude (prompt #3 en docs/ia/prompts.md), modificada por: pendiente. Modificado con el prompt #9.
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
          <Resource key={nombre} name={nombre} {...vistasDelRol(nombre, rol)} />
        ))
    }
  </Admin>
);
