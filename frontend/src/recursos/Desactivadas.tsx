import RestoreIcon from "@mui/icons-material/Restore";
import { useState } from "react";
import {
  BooleanInput,
  Button,
  useDataProvider,
  useListContext,
  useNotify,
  useRecordContext,
  useRefresh,
  useResourceContext,
  type HttpError,
} from "react-admin";
import type { dataProvider } from "../dataProvider";

// [IA] Generado con Claude (prompt #41 en docs/ia/prompts.md). Revisado por: pendiente
// Interruptor de la lista de regiones y estancias: encendido, el backend responde solo las desactivadas
// (?desactivadas=true en crud.js).
export const filtroDesactivadas = (
  <BooleanInput
    key="desactivadas"
    source="desactivadas"
    label="Mostrar desactivadas"
    alwaysOn
  />
);

// [IA] Generado con Claude (prompt #41 en docs/ia/prompts.md). Revisado por: pendiente
// true si la lista está mostrando las desactivadas. Esas no se abren en Editar (el backend responde 404).
export const useMostrandoDesactivadas = () =>
  !!useListContext().filterValues?.desactivadas;

// [IA] Generado con Claude (prompt #41 en docs/ia/prompts.md). Revisado por: pendiente
// Botón "Activar" de cada renglón desactivado. Si el backend responde 409 (una estancia cuya región sigue
// desactivada) muestra su mensaje; al activar, refresca la lista y el registro sale de las desactivadas.
export const BotonActivar = () => {
  const registro = useRecordContext();
  const recurso = useResourceContext();
  const api = useDataProvider<typeof dataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [enviando, setEnviando] = useState(false);
  if (!registro || !recurso) {
    return null;
  }
  const activar = async () => {
    setEnviando(true);
    try {
      await api.activar(recurso, registro.id);
      notify("Se activó de nuevo.", { type: "success" });
      refresh();
    } catch (error) {
      const { status, body } = error as HttpError;
      notify(
        status == 409 && body?.message
          ? body.message
          : "ra.notification.http_error",
        { type: "error" },
      );
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Button label="Activar" onClick={activar} disabled={enviando}>
      <RestoreIcon />
    </Button>
  );
};
