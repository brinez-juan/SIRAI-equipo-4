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
import { ESCRITURA, LEEN_NOTA_JUSTIFICACION, puedeVer } from "../permisos";
import {
  JustificarInasistencia,
  type JustificacionCapturada,
  type Motivo,
} from "./JustificarInasistencia";

// Feature 42: por qué se justificó. "nota" solo llega a los roles de LEEN_NOTA_JUSTIFICACION.
type Justificacion = {
  causa_codigo: string;
  causa_nombre: string;
  nota?: string | null;
};

type Asistencia = {
  id: string;
  estado_codigo: string;
  justificacion: Justificacion | null;
  hora_entrada: string | null;
  hora_salida: string | null;
};

type Renglon = {
  id: string;
  matricula: string;
  nombre: string;
  primer_apellido: string;
  segundo_apellido: string | null;
  // Candado del issue 24: no se le puede marcar Presente hasta que tenga alta médica
  requiere_alta: boolean;
  asistencia: Asistencia | null;
};

type PaseDeLista = {
  fecha: string;
  turno: string;
  cerrado: boolean;
  // Catálogo del diálogo de justificación (DOCENTE no puede leer GET /causas)
  motivos_justificacion: Motivo[];
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
// El estado que pide motivo (feature 42)
const JUSTIFICADO = "AUSENTE_JUSTIFICADO";
// Mismo texto que el 409 de PUT /pase-lista (issue 24)
const REQUIERE_ALTA = "Requiere alta para ingresar.";
// asistencias.fecha es el día local de la estancia
const ZONA = "America/Mexico_City";

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Fecha de hoy en la zona de la estancia, como "AAAA-MM-DD" (en-CA da ese formato).
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: ZONA });

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// "07:32" a partir de la fecha UTC que manda el backend.
const hora = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleTimeString("es-MX", {
        timeZone: ZONA,
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Texto del estado actual del renglón: el estado no se comunica solo con color.
// Un ausente justificado dice también el motivo: "Ausente justificado — Enfermedad en casa".
const textoEstado = (asistencia: Asistencia | null) => {
  if (!asistencia) {
    return "Sin registro";
  }
  const nombre = ESTADOS[asistencia.estado_codigo] ?? asistencia.estado_codigo;
  if (asistencia.justificacion) {
    return `${nombre} — ${asistencia.justificacion.causa_nombre}`;
  }
  return asistencia.hora_entrada
    ? `${nombre} (entrada ${hora(asistencia.hora_entrada)})`
    : nombre;
};

// [IA+Humano] Base generada con Claude (prompt #14), modificada con el prompt #24 (candado de reingreso)
// Pase de lista del día (issue 14): fecha de hoy y turno matutino ya seleccionados. El flujo rápido es
// "Marcar todos presentes" (1 clic) y luego 1 clic por cada excepción. DOCENTE y DIRECTORA capturan;
// TRABAJO_SOCIAL y MEDICO solo consultan. Habla con GET/PUT /pase-lista y POST /pase-lista/todos-presentes.
// Issue 24: el renglón de un infante con candado dice "Requiere alta para ingresar" y no deja marcarlo Presente.
// Feature 42 (prompt #42): Ausente justificado pide el motivo en un diálogo; el renglón muestra el motivo, la nota
// (solo a quien la puede leer) y "Cambiar motivo".
export const PaseLista = () => {
  const notify = useNotify();
  const logoutIfAccessDenied = useLogoutIfAccessDenied();
  const { permissions: rol } = usePermissions();
  const puedeCapturar = puedeVer(ESCRITURA.PaseLista, rol);
  const leeNota = puedeVer(LEEN_NOTA_JUSTIFICACION, rol);
  // Renglón cuyo diálogo "Justificar inasistencia" está abierto (feature 42)
  const [justificando, setJustificando] = useState<Renglon | null>(null);
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

  // [IA+Humano] Base generada con Claude (prompt #14), modificada con el prompt #42
  // Ausente justificado no se guarda directo: primero abre el diálogo para el motivo.
  const marcar = (infante: Renglon, estado: string) => {
    if (!pase || estado == infante.asistencia?.estado_codigo) {
      return;
    }
    if (estado == JUSTIFICADO) {
      setJustificando(infante);
      return;
    }
    guardarEstado(infante, estado);
  };

  const guardarEstado = async (
    infante: Renglon,
    estado: string,
    justificacion?: JustificacionCapturada,
  ) => {
    if (!pase) {
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
            justificacion,
          }),
        },
      );
      setJustificando(null);
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
      const marcados =
        json.marcados == 1
          ? "Se marcó 1 infante como presente."
          : `Se marcaron ${json.marcados} infantes como presentes.`;
      notify(
        json.requieren_alta > 0
          ? `${marcados} ${json.requieren_alta} no se marcaron porque requieren alta médica para ingresar.`
          : marcados,
        { type: json.requieren_alta > 0 ? "warning" : "success" },
      );
    } catch (error) {
      manejarError(error);
    } finally {
      setGuardando(null);
      cargar();
    }
  };

  const pendientes =
    pase?.infantes.filter((i) => !i.asistencia && !i.requiere_alta).length ?? 0;
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
          {/* fullWidth={false}: react-admin pone todos los campos a lo ancho; aquí van en una fila como en el Figma */}
          <TextField
            label="Fecha"
            type="date"
            value={fecha}
            onChange={(evento) =>
              evento.target.value && setFecha(evento.target.value)
            }
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
            fullWidth={false}
          />
          <TextField
            select
            label="Turno"
            value={turno}
            onChange={(evento) => setTurno(evento.target.value)}
            size="small"
            fullWidth={false}
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
                      {infante.asistencia?.justificacion?.nota && (
                        <Typography variant="body2" color="text.secondary">
                          Nota: {infante.asistencia.justificacion.nota}
                        </Typography>
                      )}
                      {actual == JUSTIFICADO && !bloqueado && (
                        <Button
                          size="small"
                          onClick={() => setJustificando(infante)}
                          disabled={guardando != null}
                          aria-label={`Cambiar motivo de ${nombre}`}
                        >
                          Cambiar motivo
                        </Button>
                      )}
                      {/* Solo texto en negritas y color de advertencia, sin ícono (revisión del Figma v3.1) */}
                      {infante.requiere_alta && (
                        <Typography
                          id={`alta-${infante.id}`}
                          variant="body2"
                          color="warning.main"
                          fontWeight="bold"
                        >
                          {REQUIERE_ALTA}
                        </Typography>
                      )}
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
                            disabled={
                              codigo == "PRESENTE" && infante.requiere_alta
                            }
                            aria-describedby={
                              codigo == "PRESENTE" && infante.requiere_alta
                                ? `alta-${infante.id}`
                                : undefined
                            }
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
        {justificando && pase && (
          <JustificarInasistencia
            key={justificando.id}
            infante={[
              justificando.nombre,
              justificando.primer_apellido,
              justificando.segundo_apellido,
            ]
              .filter(Boolean)
              .join(" ")}
            motivos={pase.motivos_justificacion}
            motivoActual={justificando.asistencia?.justificacion?.causa_codigo}
            notaActual={justificando.asistencia?.justificacion?.nota}
            leeNota={leeNota}
            enviando={guardando != null}
            alCancelar={() => setJustificando(null)}
            alGuardar={(justificacion) =>
              guardarEstado(justificando, JUSTIFICADO, justificacion)
            }
          />
        )}
      </CardContent>
    </Card>
  );
};
