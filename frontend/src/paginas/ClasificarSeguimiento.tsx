import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  useDataProvider,
  useLogoutIfAccessDenied,
  useNotify,
  type HttpError,
  type RaRecord,
} from "react-admin";
import type { dataProvider } from "../dataProvider";

const MAX_DETALLE = 2000;

type Contacto = {
  id: string;
  nombre: string;
  parentesco: string;
  telefono: string;
  prioridad: number;
};

// Lo que usa de GET /seguimientos/:id (issue 20)
type Seguimiento = {
  id: string;
  estado: string;
  fecha_probable_retorno: string | null;
  asistencia: { fecha: string };
  causa: { codigo: string; detalle: string | null } | null;
  contactos: Contacto[];
};

type Props = {
  seguimiento: Seguimiento;
  // Se llama al clasificar, para que la pantalla vuelva a pedir el detalle
  alClasificar: () => void;
};

const PARENTESCOS: Record<string, string> = {
  MADRE: "Madre",
  PADRE: "Padre",
  ABUELO_A: "Abuelo(a)",
  TIO_A: "Tío(a)",
  HERMANO_A: "Hermano(a)",
  TUTOR_LEGAL: "Tutor legal",
  OTRO: "Otro",
};

// [IA] Generado con Claude (prompt #23 en docs/ia/prompts.md). Revisado por: pendiente
// Formulario "Clasificar causa" para Seguimiento.tsx (issue 21): causa, detalle y fecha probable de retorno.
// Al elegir la causa muestra su asesoría para el personal; si la causa notifica a los contactos de emergencia
// (NO_LOC), muestra esos contactos por prioridad para llamarles (la llamada se registra en el issue 22).
// Un caso cerrado ya no se puede clasificar; uno ya clasificado se puede volver a clasificar para corregirlo.
export const ClasificarSeguimiento = ({ seguimiento, alClasificar }: Props) => {
  const api = useDataProvider<typeof dataProvider>();
  const notify = useNotify();
  const logoutIfAccessDenied = useLogoutIfAccessDenied();
  const [causas, setCausas] = useState<RaRecord[]>([]);
  const [causa, setCausa] = useState(seguimiento.causa?.codigo ?? "");
  const [detalle, setDetalle] = useState(seguimiento.causa?.detalle ?? "");
  const [retorno, setRetorno] = useState(
    seguimiento.fecha_probable_retorno ?? "",
  );
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const falla = (error: unknown) => {
    logoutIfAccessDenied(error as Error);
    const { status, body } = error as HttpError;
    if ((status == 400 || status == 409) && body?.message) {
      notify(body.message, { type: "warning" });
    } else if (status != 401) {
      notify("ra.notification.http_error", { type: "error" });
    }
  };

  useEffect(() => {
    api.causasInasistencia().then(setCausas).catch(falla);
    // Solo al abrir el formulario: falla() no cambia el resultado de la carga
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (seguimiento.estado == "CERRADO") {
    return <Typography>Caso cerrado: ya no se puede clasificar.</Typography>;
  }

  const elegida = causas.find((c) => c.codigo == causa);
  const contactos = [...seguimiento.contactos].sort(
    (a, b) => a.prioridad - b.prioridad,
  );
  const errores = {
    causa: causa == "" ? "Elija la causa" : "",
    retorno:
      retorno != "" && retorno < seguimiento.asistencia.fecha
        ? "No puede ser anterior a la fecha de la inasistencia"
        : "",
    detalle:
      detalle.length > MAX_DETALLE ? `Máximo ${MAX_DETALLE} caracteres` : "",
  };
  const hayErrores = Object.values(errores).some((error) => error != "");

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    setIntento(true);
    if (hayErrores) {
      return;
    }
    setEnviando(true);
    try {
      await api.clasificarSeguimiento(seguimiento.id, {
        causa_codigo: causa,
        detalle: detalle.trim() == "" ? null : detalle.trim(),
        fecha_probable_retorno: retorno == "" ? null : retorno,
      });
      notify("Caso clasificado", { type: "success" });
      alClasificar();
    } catch (error) {
      falla(error);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Box component="section" aria-labelledby="clasificar-titulo" sx={{ p: 2 }}>
      <Typography variant="h6" id="clasificar-titulo">
        Clasificar causa
      </Typography>
      <Box
        component="form"
        onSubmit={guardar}
        noValidate
        sx={{ display: "grid", gap: 2, maxWidth: 560, mt: 1 }}
      >
        <TextField
          select
          label="Causa de la inasistencia"
          value={causa}
          onChange={(e) => setCausa(e.target.value)}
          error={intento && errores.causa != ""}
          helperText={intento ? errores.causa : ""}
          required
        >
          {causas.map((c) => (
            <MenuItem key={c.codigo} value={c.codigo}>
              {c.nombre}
            </MenuItem>
          ))}
        </TextField>

        {elegida && (
          <Alert severity="info">
            <strong>Asesoría para el personal: </strong>
            {elegida.asesoria}
            {Number(elegida.requiere_alta) == 1 &&
              " Esta causa requiere alta médica para que el infante pueda volver."}
          </Alert>
        )}

        {elegida && Number(elegida.notifica_emergencia) == 1 && (
          <Box>
            <Typography variant="subtitle1">
              Contactos de emergencia (llamar en este orden)
            </Typography>
            {contactos.length == 0 ? (
              <Alert severity="warning">
                Este infante no tiene contactos de emergencia registrados.
              </Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Prioridad</TableCell>
                    <TableCell>Nombre</TableCell>
                    <TableCell>Parentesco</TableCell>
                    <TableCell>Teléfono</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contactos.map((contacto) => (
                    <TableRow key={contacto.id}>
                      <TableCell>{contacto.prioridad}</TableCell>
                      <TableCell>{contacto.nombre}</TableCell>
                      <TableCell>
                        {PARENTESCOS[contacto.parentesco] ??
                          contacto.parentesco}
                      </TableCell>
                      <TableCell>{contacto.telefono}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        )}

        <TextField
          label="Detalle de la causa"
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          multiline
          minRows={3}
          error={errores.detalle != ""}
          helperText={
            errores.detalle || `${detalle.length}/${MAX_DETALLE} · confidencial`
          }
        />
        <TextField
          label="Fecha probable de retorno"
          type="date"
          value={retorno}
          onChange={(e) => setRetorno(e.target.value)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: seguimiento.asistencia.fecha },
          }}
          error={errores.retorno != ""}
          helperText={errores.retorno}
        />
        <Box>
          <Button type="submit" variant="contained" disabled={enviando}>
            {seguimiento.estado == "CLASIFICADO"
              ? "Guardar clasificación"
              : "Clasificar"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};
