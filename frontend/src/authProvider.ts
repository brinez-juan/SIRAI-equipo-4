import { AuthProvider } from "react-admin";

const LLAVES = ["auth", "rol", "nombre", "id"];

// [IA] Generado con Claude (prompt #F3-1 en docs/ia/prompts.md). Revisado por: pendiente
const limpiarSesion = () =>
  LLAVES.forEach((llave) => sessionStorage.removeItem(llave));

// [IA] Generado con Claude (prompt #F3-1 en docs/ia/prompts.md). Revisado por: pendiente
// Sesión contra POST /login del backend. Guarda token, rol y nombre en sessionStorage.
const authProvider: AuthProvider = {
  login: async ({ username, password }) => {
    const request = new Request(import.meta.env.VITE_BACKEND + "/login", {
      method: "POST",
      body: JSON.stringify({ username: username, password: password }),
      headers: new Headers({ "Content-Type": "application/json" }),
    });
    try {
      const res = await fetch(request);
      if (res.status < 200 || res.status >= 300) {
        throw new Error(res.statusText);
      }
      const auth = await res.json();
      sessionStorage.setItem("auth", auth.token);
      sessionStorage.setItem("rol", auth.rol);
      sessionStorage.setItem("nombre", auth.nombre);
      sessionStorage.setItem("id", String(auth.id));
    } catch {
      throw new Error("Usuario o contraseña incorrectos");
    }
  },
  logout: () => {
    limpiarSesion();
    return Promise.resolve();
  },
  checkAuth: () =>
    sessionStorage.getItem("auth") ? Promise.resolve() : Promise.reject(),
  // 401 = token vencido o inválido: se cierra la sesión y react-admin manda al login.
  // 403 = el rol no tiene permiso para esa petición: se muestra el error sin cerrar sesión.
  checkError: (error) => {
    if (error.status == 401) {
      limpiarSesion();
      return Promise.reject();
    }
    return Promise.resolve();
  },
  getPermissions: () => Promise.resolve(sessionStorage.getItem("rol")),
  getIdentity: () => {
    const id = sessionStorage.getItem("id");
    if (!id) {
      return Promise.reject();
    }
    return Promise.resolve({
      id: id,
      fullName: sessionStorage.getItem("nombre") ?? "",
    });
  },
};

export default authProvider;
