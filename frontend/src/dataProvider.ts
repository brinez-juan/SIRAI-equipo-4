import { fetchUtils, type Identifier, type RaRecord } from "react-admin";
import jsonServerProvider from "ra-data-json-server";

const fetchJsonUtil = (url: string, options: fetchUtils.Options = {}) => {
  if (!options.headers) {
    options.headers = new Headers({ Accept: "application/json" });
  }
  (options.headers as Headers).set(
    "Authentication",
    sessionStorage.getItem("auth") ?? "",
  );
  return fetchUtils.fetchJson(url, options);
};

const tutoresUrl = (infanteId: Identifier) =>
  `${import.meta.env.VITE_BACKEND}/Infantes/${encodeURIComponent(infanteId)}/tutores`;

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Además del CRUD de react-admin, las rutas anidadas /Infantes/:id/tutores (issue 11).
// Se usan con useDataProvider<typeof dataProvider>().
export const dataProvider = {
  ...jsonServerProvider(import.meta.env.VITE_BACKEND, fetchJsonUtil),
  // [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
  // Vuelve a activar una región o estancia desactivada (POST /<recurso>/:id/activar).
  activar: (resource: string, id: Identifier) =>
    fetchJsonUtil(
      `${import.meta.env.VITE_BACKEND}/${resource}/${encodeURIComponent(id)}/activar`,
      { method: "POST" },
    ).then(({ json }) => json as RaRecord),
  tutoresDeInfante: (infanteId: Identifier) =>
    fetchJsonUtil(tutoresUrl(infanteId)).then(({ json }) => json as RaRecord[]),
  vincularTutor: (
    infanteId: Identifier,
    datos: {
      tutor_id: Identifier;
      parentesco: string;
      autorizado_recoger: boolean;
    },
  ) =>
    fetchJsonUtil(tutoresUrl(infanteId), {
      method: "POST",
      body: JSON.stringify(datos),
    }).then(({ json }) => json as RaRecord),
  desvincularTutor: (infanteId: Identifier, tutorId: Identifier) =>
    fetchJsonUtil(`${tutoresUrl(infanteId)}/${encodeURIComponent(tutorId)}`, {
      method: "DELETE",
    }),
  // [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
  // Catálogo de causas con su asesoría y clasificación de un seguimiento (issue 23).
  causasInasistencia: () =>
    fetchJsonUtil(`${import.meta.env.VITE_BACKEND}/causas`).then(
      ({ json }) => json as RaRecord[],
    ),
  clasificarSeguimiento: (
    seguimientoId: Identifier,
    datos: {
      causa_codigo: string;
      detalle: string | null;
      fecha_probable_retorno: string | null;
    },
  ) =>
    fetchJsonUtil(
      `${import.meta.env.VITE_BACKEND}/seguimientos/${encodeURIComponent(seguimientoId)}/clasificar`,
      { method: "PUT", body: JSON.stringify(datos) },
    ).then(({ json }) => json as RaRecord),
  // [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
  // Alta médica y cierre de un seguimiento (issue 24).
  registrarAlta: (
    seguimientoId: Identifier,
    datos: { folio: string; observaciones: string | null },
  ) =>
    fetchJsonUtil(
      `${import.meta.env.VITE_BACKEND}/seguimientos/${encodeURIComponent(seguimientoId)}/alta`,
      { method: "POST", body: JSON.stringify(datos) },
    ).then(({ json }) => json as RaRecord),
  cerrarSeguimiento: (seguimientoId: Identifier) =>
    fetchJsonUtil(
      `${import.meta.env.VITE_BACKEND}/seguimientos/${encodeURIComponent(seguimientoId)}/cerrar`,
      { method: "PUT" },
    ).then(({ json }) => json as RaRecord),
  // [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
  // Cierre del pase de lista (issue 17): faltas para quien no tiene registro y seguimientos para quien los genera.
  cerrarPaseLista: (datos: { fecha: string; turno: string }) =>
    fetchJsonUtil(`${import.meta.env.VITE_BACKEND}/cierres`, {
      method: "POST",
      body: JSON.stringify(datos),
    }).then(
      ({ json }) =>
        json as { cierre: RaRecord; faltas: number; seguimientos: number },
    ),
  // [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
  // Salida con tutor autorizado (issue 16). El día es hoy: lo calcula el backend.
  registrarSalida: (
    infanteId: Identifier,
    datos: { tutor_id: Identifier; turno: string },
  ) =>
    fetchJsonUtil(
      `${import.meta.env.VITE_BACKEND}/pase-lista/${encodeURIComponent(infanteId)}/salida`,
      { method: "PUT", body: JSON.stringify(datos) },
    ).then(({ json }) => json as RaRecord),
  // [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
  // Registrar una llamada de un seguimiento (issue 22): a un tutor o a un contacto de emergencia (solo uno).
  registrarLlamada: (
    seguimientoId: Identifier,
    datos: {
      tutor_id?: Identifier;
      contacto_emergencia_id?: Identifier;
      resultado: string;
      notas?: string;
    },
  ) =>
    fetchJsonUtil(
      `${import.meta.env.VITE_BACKEND}/seguimientos/${encodeURIComponent(seguimientoId)}/llamadas`,
      { method: "POST", body: JSON.stringify(datos) },
    ).then(({ json }) => json as RaRecord),
  // [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
  // Tablero semáforo (issue 26/27): una fila anónima por estancia del día pedido (AAAA-MM-DD).
  tablero: (fecha: string) =>
    fetchJsonUtil(
      `${import.meta.env.VITE_BACKEND}/tablero?fecha=${encodeURIComponent(fecha)}`,
    ).then(
      ({ json }) =>
        json as {
          estancia: string;
          total: number;
          presentes: number;
          porcentaje: number | null;
          semaforo: string;
        }[],
    ),
};
