import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
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
import { ESCRITURA, puedeVer } from "../permisos";

const MAX_FOLIO = 50;
const MAX_OBSERVACIONES = 2000;

// Lo que usa de GET /seguimientos/:id (issue 20)
type Seguimiento = {
  id: string;
  estado: string;
  cerrado_en: string | null;
  causa: { nombre: string; requiere_alta: number } | null;
  alta: {
    folio_justificante: string | null;
    emitida_en: string;
    emitida_por_nombre: string;
    observaciones: string | null;
  } | null;
};

type Props = {
  seguimiento: Seguimiento;
  // Se llama al registrar la alta o cerrar el caso, para que la pantalla vuelva a pedir el detalle
  alActualizar: () => void;
};

const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  });

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Secciones "Alta médica" y "Cierre del caso" para Seguimiento.tsx (issue 21). La alta la registran MEDICO y
// DIRECTORA (folio y observaciones confidenciales) y quita el candado "Requiere alta para ingresar" del pase de lista.
// El caso se cierra con confirmación; el botón explica con texto por qué no se puede cerrar (sin clasificar o sin
// la alta que pide su causa). El backend valida lo mismo y responde 409 con su mensaje.
export const AltaYCierre = ({ seguimiento, alActualizar }: Props) => {
  const { permissions: rol } = usePermissions();
  const api = useDataProvider<typeof dataProvider>();
  const notify = useNotify();
  const logoutIfAccessDenied = useLogoutIfAccessDenied();
  const [folio, setFolio] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const falla = (error: unknown) => {
    logoutIfAccessDenied(error as Error);
    const { status, body } = error as HttpError;
    if ((status == 400 || status == 409) && body?.message) {
      notify(body.message, { type: "warning" });
    } else if (status != 401) {
      notify("ra.notification.http_error", { type: "error" });
    }
  };

  const cerrado = seguimiento.estado == "CERRADO";
  const { alta, causa } = seguimiento;
  const requiereAlta = Number(causa?.requiere_alta) == 1;
  const puedeEmitir = puedeVer(ESCRITURA.AltaMedica, rol);
  const errores = {
    folio:
      folio.trim() == ""
        ? "Escriba el folio del justificante"
        : folio.trim().length > MAX_FOLIO
          ? `Máximo ${MAX_FOLIO} caracteres`
          : "",
    observaciones:
      observaciones.length > MAX_OBSERVACIONES
        ? `Máximo ${MAX_OBSERVACIONES} caracteres`
        : "",
  };
  const motivoNoCerrar =
    causa == null
      ? "Clasifique la causa antes de cerrar el caso."
      : requiereAlta && alta == null
        ? "La causa requiere alta médica: no se puede cerrar el caso sin ella."
        : "";

  const registrarAlta = async (evento: FormEvent) => {
    evento.preventDefault();
    setIntento(true);
    if (errores.folio != "" || errores.observaciones != "") {
      return;
    }
    setEnviando(true);
    try {
      await api.registrarAlta(seguimiento.id, {
        folio: folio.trim(),
        observaciones: observaciones.trim() == "" ? null : observaciones.trim(),
      });
      notify("Alta médica registrada", { type: "success" });
      alActualizar();
    } catch (error) {
      falla(error);
    } finally {
      setEnviando(false);
    }
  };

  const cerrar = async () => {
    setEnviando(true);
    try {
      await api.cerrarSeguimiento(seguimiento.id);
      notify("Caso cerrado", { type: "success" });
    } catch (error) {
      falla(error);
    } finally {
      setEnviando(false);
      setConfirmando(false);
      alActualizar();
    }
  };

  return (
    <>
      <Box component="section" aria-labelledby="alta-titulo" sx={{ p: 2 }}>
        <Typography variant="h6" id="alta-titulo">
          Alta médica
        </Typography>
        {alta ? (
          <Box sx={{ mt: 1 }}>
            <Typography>
              <strong>Folio del justificante:</strong>{" "}
              {alta.folio_justificante ?? "Sin folio"}
            </Typography>
            <Typography>
              <strong>Emitida:</strong> {fechaHora(alta.emitida_en)} por{" "}
              {alta.emitida_por_nombre}
            </Typography>
            {alta.observaciones && (
              <Typography>
                <strong>Observaciones:</strong> {alta.observaciones}
              </Typography>
            )}
          </Box>
        ) : cerrado ? (
          <Typography>Caso cerrado sin alta médica.</Typography>
        ) : (
          <>
            {requiereAlta && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Pendiente: la causa «{causa?.nombre}» requiere alta médica. Sin
                ella el infante no puede marcarse como presente.
              </Alert>
            )}
            {puedeEmitir ? (
              <Box
                component="form"
                onSubmit={registrarAlta}
                noValidate
                sx={{ display: "grid", gap: 2, maxWidth: 560, mt: 2 }}
              >
                <TextField
                  label="Folio del justificante"
                  value={folio}
                  onChange={(e) => setFolio(e.target.value)}
                  error={intento && errores.folio != ""}
                  helperText={intento ? errores.folio : ""}
                  required
                  slotProps={{ htmlInput: { maxLength: MAX_FOLIO } }}
                />
                <TextField
                  label="Observaciones"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  multiline
                  minRows={3}
                  error={errores.observaciones != ""}
                  helperText={
                    errores.observaciones ||
                    `${observaciones.length}/${MAX_OBSERVACIONES} · confidencial`
                  }
                />
                <Box>
                  <Button type="submit" variant="contained" disabled={enviando}>
                    Registrar alta médica
                  </Button>
                </Box>
              </Box>
            ) : (
              <Typography sx={{ mt: 1 }}>
                Sin alta médica. La registra Médico o Dirección.
              </Typography>
            )}
          </>
        )}
      </Box>

      <Box component="section" aria-labelledby="cierre-titulo" sx={{ p: 2 }}>
        <Typography variant="h6" id="cierre-titulo">
          Cierre del caso
        </Typography>
        {cerrado ? (
          <Typography sx={{ mt: 1 }}>
            Caso cerrado
            {seguimiento.cerrado_en &&
              ` el ${fechaHora(seguimiento.cerrado_en)}`}
            .
          </Typography>
        ) : (
          <Box sx={{ mt: 1 }}>
            {motivoNoCerrar && (
              <Typography id="cierre-motivo" sx={{ mb: 1 }}>
                {motivoNoCerrar}
              </Typography>
            )}
            <Button
              variant="contained"
              color="warning"
              onClick={() => setConfirmando(true)}
              disabled={motivoNoCerrar != "" || enviando}
              aria-describedby={motivoNoCerrar ? "cierre-motivo" : undefined}
            >
              Cerrar caso
            </Button>
          </Box>
        )}
      </Box>

      <Dialog
        open={confirmando}
        onClose={() => !enviando && setConfirmando(false)}
        aria-labelledby="cerrar-caso-titulo"
        aria-describedby="cerrar-caso-descripcion"
      >
        <DialogTitle id="cerrar-caso-titulo">¿Cerrar el caso?</DialogTitle>
        <DialogContent>
          <DialogContentText id="cerrar-caso-descripcion">
            El caso saldrá de la bandeja de seguimiento. Después ya no se podrá
            clasificar ni registrar su alta médica.
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
            Cerrar caso
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
