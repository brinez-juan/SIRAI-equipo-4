import { useState, type MouseEvent } from "react";
import { Button, Menu, MenuItem, Typography } from "@mui/material";
import {
  useDataProvider,
  useLogoutIfAccessDenied,
  useNotify,
  type Identifier,
  type HttpError,
  type RaRecord,
} from "react-admin";
import type { dataProvider } from "../dataProvider";

const PARENTESCOS: Record<string, string> = {
  MADRE: "Madre",
  PADRE: "Padre",
  ABUELO_A: "Abuelo(a)",
  TIO_A: "Tío(a)",
  HERMANO_A: "Hermano(a)",
  TUTOR_LEGAL: "Tutor legal",
  OTRO: "Otro",
};

const nombreTutor = (tutor: RaRecord) =>
  [tutor.nombre, tutor.primer_apellido, tutor.segundo_apellido]
    .filter(Boolean)
    .join(" ");

const horaLocal = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });

type Props = {
  infanteId: Identifier;
  turno: string;
  // Asistencia de hoy de ese infante, tal como la devuelve GET /pase-lista (o null si no tiene)
  asistencia: { estado_codigo: string; hora_salida: string | null } | null;
  // Se llama al registrar la salida, para que la pantalla vuelva a pedir el pase de lista
  alRegistrar: () => void;
};

// [IA] Generado con Claude (prompt #16 en docs/ia/prompts.md). Revisado por: pendiente
// Celda "salida" del renglón de un infante en el pase de lista (issue 14). Solo los presentes tienen botón
// "Registrar salida"; al abrirlo muestra únicamente los tutores con autorizado_recoger. Quien ya salió muestra
// la hora con texto. La autorización real la revisa el backend (403 "Tutor no autorizado").
export const SalidaConTutor = ({
  infanteId,
  turno,
  asistencia,
  alRegistrar,
}: Props) => {
  const api = useDataProvider<typeof dataProvider>();
  const notify = useNotify();
  const logoutIfAccessDenied = useLogoutIfAccessDenied();
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const [tutores, setTutores] = useState<RaRecord[] | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!asistencia || asistencia.estado_codigo != "PRESENTE") {
    return null;
  }
  if (asistencia.hora_salida) {
    return (
      <Typography variant="body2">
        Salió a las {horaLocal(asistencia.hora_salida)}
      </Typography>
    );
  }

  const falla = (error: unknown) => {
    logoutIfAccessDenied(error as Error);
    const { status, body } = error as HttpError;
    if ((status == 403 || status == 409) && body?.message) {
      notify(body.message, { type: "warning" });
    } else if (status != 401) {
      notify("ra.notification.http_error", { type: "error" });
    }
  };

  const abrir = async (evento: MouseEvent<HTMLElement>) => {
    setAncla(evento.currentTarget);
    setTutores(null);
    try {
      const vinculados = await api.tutoresDeInfante(infanteId);
      setTutores(vinculados.filter((t) => Number(t.autorizado_recoger) == 1));
    } catch (error) {
      setAncla(null);
      falla(error);
    }
  };

  const registrar = async (tutor: RaRecord) => {
    setEnviando(true);
    try {
      await api.registrarSalida(infanteId, { tutor_id: tutor.id, turno });
      notify(`Salida registrada con ${nombreTutor(tutor)}`, {
        type: "success",
      });
      setAncla(null);
      alRegistrar();
    } catch (error) {
      setAncla(null);
      falla(error);
      alRegistrar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        onClick={abrir}
        aria-haspopup="menu"
        disabled={enviando}
      >
        Registrar salida
      </Button>
      <Menu
        anchorEl={ancla}
        open={ancla != null}
        onClose={() => setAncla(null)}
      >
        {tutores == null && <MenuItem disabled>Cargando tutores…</MenuItem>}
        {tutores?.length == 0 && (
          <MenuItem disabled>
            Este infante no tiene tutores autorizados para recogerlo
          </MenuItem>
        )}
        {tutores?.map((tutor) => (
          <MenuItem
            key={tutor.id}
            onClick={() => registrar(tutor)}
            disabled={enviando}
          >
            {nombreTutor(tutor)} (
            {PARENTESCOS[tutor.parentesco] ?? tutor.parentesco})
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
