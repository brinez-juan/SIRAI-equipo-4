import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from "@mui/material";
import {
  useDataProvider,
  useLogoutIfAccessDenied,
  useNotify,
  usePermissions,
  type HttpError,
} from "react-admin";
import type { dataProvider } from "../dataProvider";

type Props = {
  fecha: string; // AAAA-MM-DD, el día del pase de lista que se muestra
  turno: string;
  // "cerrado" de GET /pase-lista: si ya se cerró, solo se avisa con texto
  cerrado: boolean;
  // Se llama al cerrar, para que la pantalla vuelva a pedir el pase de lista
  alCerrar: () => void;
};

const fechaLarga = (fecha: string) =>
  new Date(fecha + "T00:00:00Z").toLocaleDateString("es-MX", {
    dateStyle: "long",
    timeZone: "UTC",
  });

// [IA] Generado con Claude (prompt #17 en docs/ia/prompts.md). Revisado por: pendiente
// Botón "Cerrar pase de lista" para PaseLista.tsx (issue 14), con confirmación. Solo lo ve la DIRECTORA
// (el backend lo exige de todos modos: otro rol recibe 403). Al confirmar, los infantes sin registro quedan como
// falta injustificada y se abren los seguimientos; después ya no se puede cambiar el pase de lista.
export const CerrarPaseLista = ({ fecha, turno, cerrado, alCerrar }: Props) => {
  const { permissions: rol } = usePermissions();
  const api = useDataProvider<typeof dataProvider>();
  const notify = useNotify();
  const logoutIfAccessDenied = useLogoutIfAccessDenied();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (rol != "DIRECTORA") {
    return null;
  }
  if (cerrado) {
    return <Typography>Pase de lista cerrado</Typography>;
  }

  const cerrar = async () => {
    setEnviando(true);
    try {
      const { faltas, seguimientos } = await api.cerrarPaseLista({
        fecha,
        turno,
      });
      notify(
        `Pase de lista cerrado: ${faltas} falta(s) injustificada(s) y ${seguimientos} seguimiento(s) abierto(s)`,
        { type: "success" },
      );
    } catch (error) {
      logoutIfAccessDenied(error as Error);
      const { status, body } = error as HttpError;
      if ((status == 400 || status == 409) && body?.message) {
        notify(body.message, { type: "warning" });
      } else if (status != 401) {
        notify("ra.notification.http_error", { type: "error" });
      }
    } finally {
      setEnviando(false);
      setConfirmando(false);
      alCerrar();
    }
  };

  return (
    <>
      <Button
        variant="contained"
        color="warning"
        onClick={() => setConfirmando(true)}
      >
        Cerrar pase de lista
      </Button>
      <Dialog
        open={confirmando}
        onClose={() => !enviando && setConfirmando(false)}
        aria-labelledby="cerrar-titulo"
        aria-describedby="cerrar-descripcion"
      >
        <DialogTitle id="cerrar-titulo">¿Cerrar el pase de lista?</DialogTitle>
        <DialogContent>
          <DialogContentText id="cerrar-descripcion">
            Se cerrará el turno {turno.toLowerCase()} del {fechaLarga(fecha)}.
            Los infantes sin registro quedarán como falta injustificada y se
            abrirá un seguimiento por cada inasistencia. Después ya no podrá
            cambiar la asistencia de ese turno.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmando(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            onClick={cerrar}
            variant="contained"
            color="warning"
            disabled={enviando}
          >
            Cerrar pase de lista
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
