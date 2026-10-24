import { useNotify, type HttpError } from "react-admin";

// Traduce los códigos del backend (responderError en db.js) a un aviso claro al guardar:
// 409 = dato duplicado, 400 = dato inválido.
export const useErrorAlGuardar = (duplicado: string) => {
  const notify = useNotify();
  return (error: Error) => {
    const status = (error as HttpError).status;
    if (status == 409) {
      notify(duplicado, { type: "error" });
    } else if (status == 400) {
      notify("Revise los datos: hay un valor inválido.", { type: "error" });
    } else {
      notify("ra.notification.http_error", { type: "error" });
    }
  };
};
