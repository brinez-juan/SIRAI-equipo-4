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

// [IA] Generado con Claude (prompt #11 en docs/ia/prompts.md). Revisado por: pendiente
// Además del CRUD de react-admin, las rutas anidadas /Infantes/:id/tutores (issue 11).
// Se usan con useDataProvider<typeof dataProvider>().
export const dataProvider = {
  ...jsonServerProvider(import.meta.env.VITE_BACKEND, fetchJsonUtil),
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
  // [IA] Generado con Claude (prompt #16 en docs/ia/prompts.md). Revisado por: pendiente
  // Salida con tutor autorizado (issue 16). El día es hoy: lo calcula el backend.
  registrarSalida: (
    infanteId: Identifier,
    datos: { tutor_id: Identifier; turno: string },
  ) =>
    fetchJsonUtil(
      `${import.meta.env.VITE_BACKEND}/pase-lista/${encodeURIComponent(infanteId)}/salida`,
      { method: "PUT", body: JSON.stringify(datos) },
    ).then(({ json }) => json as RaRecord),
};
