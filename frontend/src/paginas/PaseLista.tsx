import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  Title,
  useLogoutIfAccessDenied,
  useNotify,
  usePermissions,
  type HttpError,
} from "react-admin";
import { llamarApi } from "../api";
import { ESCRITURA, puedeVer } from "../permisos";

type Asistencia = {
  id: string;
  estado_codigo: string;
  hora_entrada: string | null;
  hora_salida: string | null;
};

type Renglon = {
  id: string;
  matricula: string;
  nombre: string;
  primer_apellido: string;
  segundo_apellido: string | null;
  asistencia: Asistencia | null;
};

type PaseDeLista = {
  fecha: string;
  turno: string;
  cerrado: boolean;
  infantes: Renglon[];
};

// Mismos códigos que el catálogo estados_asistencia de schema.sql
const ESTADOS: Record<string, string> = {
  PRESENTE: "Presente",
  AUSENTE_JUSTIFICADO: "Ausente justificado",
  FALTA_INJUSTIFICADA: "Falta injustificada",
  COMISION_MEDICA: "Comisión médica",
  FILTRO_SANITARIO: "Filtro sanitario",
};
const TURNOS: Record<string, string> = {
  MATUTINO: "Matutino",
  VESPERTINO: "Vespertino",
};
const TURNO_INICIAL = "MATUTINO";
// asistencias.fecha es el día local de la estancia
const ZONA = "America/Mexico_City";

// [IA] Generado con Claude (prompt #14 en docs/ia/prompts.md). Revisado por: pendiente
// Fecha de hoy en la zona de la estancia, como "AAAA-MM-DD" (en-CA da ese formato).
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: ZONA });

// [IA] Generado con Claude (prompt #14 en docs/ia/prompts.md). Revisado por: pendiente
// "07:32" a partir de la fecha UTC que manda el backend.
const hora = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleTimeString("es-MX", {
        timeZone: ZONA,
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

// [IA] Generado con Claude (prompt #14 en docs/ia/prompts.md). Revisado por: pendiente
// Texto del estado actual del renglón: el estado no se comunica solo con color.
const textoEstado = (asistencia: Asistencia | null) => {
  if (!asistencia) {
    return "Sin registro";
  }
  const nombre = ESTADOS[asistencia.estado_codigo] ?? asistencia.estado_codigo;
  return asistencia.hora_entrada
    ? `${nombre} (entrada ${hora(asistencia.hora_entrada)})`
    : nombre;
};

// [IA] Generado con Claude (prompt #14 en docs/ia/prompts.md). Revisado por: pendiente
// Pase de lista del día (issue 14): fecha de hoy y turno matutino ya seleccionados. El flujo rápido es
// "Marcar todos presentes" (1 clic) y luego 1 clic por cada excepción. DOCENTE y DIRECTORA capturan;
// TRABAJO_SOCIAL y MEDICO solo consultan. Habla con GET/PUT /pase-lista y POST /pase-lista/todos-presentes.
export const PaseLista = () => {
  const notify = useNotify();
  const logoutIfAccessDenied = useLogoutIfAccessDenied();
  const { permissions: rol } = usePermissions();
  const puedeCapturar = puedeVer(ESCRITURA.PaseLista, rol);
  const [fecha, setFecha] = useState(hoy);
  // El seed solo opera MATUTINO; si la estancia no opera el turno elegido, el backend responde 400 con su mensaje
  const [turno, setTurno] = useState(TURNO_INICIAL);
  const [pase, setPase] = useState<PaseDeLista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);

  // 401 cierra la sesión (authProvider.checkError); 409 (turno cerrado) y 400 traen su mensaje del backend.
  const manejarError = useCallback(
    (error: unknown) => {
      logoutIfAccessDenied(error as Error);
      const { status, body } = error as HttpError;
      if ((status == 409 || status == 400) && body?.message) {
        notify(body.message, { type: "error" });
      } else if (status == 404) {
        notify("El infante ya no está en el padrón. Se actualizó la lista.", {
          type: "warning",
        });
      } else if (status != 401) {
        notify("ra.notification.http_error", { type: "error" });
      }
    },
    [logoutIfAccessDenied, notify],
  );

  const cargar = useCallback(async () => {
    const consulta = new URLSearchParams({ fecha, turno });
    try {
      const { json } = await llamarApi(`/pase-lista?${consulta}`);
      setPase(json);
    } catch (error) {
      manejarError(error);
      setPase(null);
    } finally {
      setCargando(false);
    }
  }, [fecha, turno, manejarError]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const marcar = async (infante: Renglon, estado: string) => {
    if (!pase || estado == infante.asistencia?.estado_codigo) {
      return;
    }
    setGuardando(infante.id);
    try {
      const { json } = await llamarApi(
        `/pase-lista/${encodeURIComponent(infante.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            fecha: pase.fecha,
            turno: pase.turno,
            estado_codigo: estado,
          }),
        },
      );
      setPase(
        (actual) =>
          actual && {
            ...actual,
            infantes: actual.infantes.map((renglon) =>
              renglon.id == infante.id
                ? { ...renglon, asistencia: json }
                : renglon,
            ),
          },
      );
    } catch (error) {
      manejarError(error);
      cargar();
    } finally {
      setGuardando(null);
    }
  };

  const todosPresentes = async () => {
    if (!pase) {
      return;
    }
    setGuardando("todos");
    try {
      const { json } = await llamarApi("/pase-lista/todos-presentes", {
        method: "POST",
        body: JSON.stringify({ fecha: pase.fecha, turno: pase.turno }),
      });
      notify(
        json.marcados == 1
          ? "Se marcó 1 infante como presente."
          : `Se marcaron ${json.marcados} infantes como presentes.`,
        { type: "success" },
      );
    } catch (error) {
      manejarError(error);
    } finally {
      setGuardando(null);
      cargar();
    }
  };

  const pendientes = pase?.infantes.filter((i) => !i.asistencia).length ?? 0;
  const bloqueado = !puedeCapturar || !pase || pase.cerrado;

  return (
    <Card sx={{ mt: 2 }}>
      <Title title="Pase de lista" />
      <CardContent>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 2,
            alignItems: "center",
            mb: 2,
          }}
        >
          <TextField
            label="Fecha"
            type="date"
            value={fecha}
            onChange={(evento) =>
              evento.target.value && setFecha(evento.target.value)
            }
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
          />
          <TextField
            select
            label="Turno"
            value={turno}
            onChange={(evento) => setTurno(evento.target.value)}
            size="small"
            sx={{ minWidth: 160 }}
          >
            {Object.entries(TURNOS).map(([codigo, nombre]) => (
              <MenuItem key={codigo} value={codigo}>
                {nombre}
              </MenuItem>
            ))}
          </TextField>
          {puedeCapturar && (
            <Button
              variant="contained"
              size="large"
              onClick={todosPresentes}
              disabled={bloqueado || pendientes == 0 || guardando != null}
            >
              Marcar todos presentes
              {pase && !pase.cerrado && pendientes > 0 && ` (${pendientes})`}
            </Button>
          )}
        </Box>

        {pase?.cerrado && (
          <Alert severity="info" sx={{ mb: 2 }}>
            El pase de lista de este turno ya se cerró. Solo se puede consultar.
          </Alert>
        )}
        {!puedeCapturar && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Su rol solo puede consultar el pase de lista.
          </Alert>
        )}

        {cargando ? (
          <Typography>Cargando…</Typography>
        ) : !pase ? (
          <Alert severity="error">No se pudo cargar el pase de lista.</Alert>
        ) : pase.infantes.length == 0 ? (
          <Typography>No hay infantes registrados en la estancia.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Infante</TableCell>
                <TableCell>Estado actual</TableCell>
                <TableCell>Marcar como</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pase.infantes.map((infante) => {
                const nombre = [
                  infante.nombre,
                  infante.primer_apellido,
                  infante.segundo_apellido,
                ]
                  .filter(Boolean)
                  .join(" ");
                const actual = infante.asistencia?.estado_codigo ?? null;
                return (
                  <TableRow key={infante.id}>
                    <TableCell>
                      <Typography fontWeight="bold">{nombre}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {infante.matricula}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        fontWeight={infante.asistencia ? "bold" : "normal"}
                      >
                        {textoEstado(infante.asistencia)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        color="primary"
                        value={actual}
                        aria-label={`Estado de asistencia de ${nombre}`}
                        disabled={bloqueado || guardando != null}
                        onChange={(_, estado) =>
                          estado && marcar(infante, estado)
                        }
                        sx={{ flexWrap: "wrap" }}
                      >
                        {Object.entries(ESTADOS).map(([codigo, texto]) => (
                          <ToggleButton
                            key={codigo}
                            value={codigo}
                            sx={{ textTransform: "none" }}
                          >
                            {codigo == actual ? `✓ ${texto}` : texto}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
