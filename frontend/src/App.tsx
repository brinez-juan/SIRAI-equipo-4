import { Admin, CustomRoutes, Resource, type ResourceProps } from "react-admin";
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
import {
  crearUsuario,
  editarUsuario,
  listarUsuarios,
} from "./recursos/Usuarios";
import { ListarAsistencias } from "./recursos/Asistencias";
import type { ComponentType } from "react";
import { Route } from "react-router-dom";
import { PaseLista } from "./paginas/PaseLista";
import { ESCRITURA, PAGINAS, RECURSOS, puedeVer } from "./permisos";

// Páginas propias por ruta (deben estar también en PAGINAS de permisos.ts, con sus roles).
const COMPONENTES_PAGINA: Record<string, ComponentType> = {
  "pase-lista": PaseLista,
};

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
  Usuarios: {
    list: listarUsuarios,
    create: crearUsuario,
    edit: editarUsuario,
    recordRepresentation: (usuario) =>
      `${usuario.nombre} ${usuario.primer_apellido}`,
  },
  Asistencias: {
    list: ListarAsistencias,
    options: { label: "Historial de asistencia" },
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

// [IA+Humano] Base generada con Claude (prompt #3 en docs/ia/prompts.md), modificada por: pendiente. Modificado con los prompts #9 y #14.
// react-admin llama a getPermissions (el rol) y este render solo monta lo que ese rol puede ver:
// sus <Resource> y sus páginas propias (CustomRoutes, como el pase de lista).
export const App = () => (
  <Admin
    layout={Layout}
    dashboard={Inicio}
    dataProvider={dataProvider}
    authProvider={authProvider}
    i18nProvider={i18nProvider}
    requireAuth
  >
    {(rol: string) => [
      ...Object.keys(COMPONENTES_RECURSO)
        .filter((nombre) => puedeVer(RECURSOS[nombre], rol))
        .map((nombre) => (
          <Resource key={nombre} name={nombre} {...vistasDelRol(nombre, rol)} />
        )),
      <CustomRoutes key="paginas">
        {Object.entries(COMPONENTES_PAGINA)
          .filter(([ruta]) => puedeVer(PAGINAS[ruta], rol))
          .map(([ruta, Pagina]) => (
            <Route key={ruta} path={`/${ruta}`} element={<Pagina />} />
          ))}
      </CustomRoutes>,
    ]}
  </Admin>
);
