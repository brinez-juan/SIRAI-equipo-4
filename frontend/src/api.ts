import { fetchUtils } from "react-admin";

// [IA] Generado con Claude (prompt #12 en docs/ia/prompts.md). Revisado por: pendiente
// Llamadas a rutas anidadas que el dataProvider de json-server no cubre (ej. /Infantes/:id/contactos).
// Misma autenticación que dataProvider.ts: token en el header "Authentication" y VITE_BACKEND como base.
// Si el backend responde 401 o 403, la pantalla pasa el error a useLogoutIfAccessDenied.
export const llamarApi = (ruta: string, opciones: fetchUtils.Options = {}) => {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  headers.set("Authentication", sessionStorage.getItem("auth") ?? "");
  return fetchUtils.fetchJson(import.meta.env.VITE_BACKEND + ruta, {
    ...opciones,
    headers,
  });
};
