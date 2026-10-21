import { Typography } from "@mui/material";
import { Datagrid, FunctionField, List, type RaRecord } from "react-admin";

// Mismos valores que el ENUM seguimientos.estado de schema.sql
export const ESTADOS_CASO: Record<string, string> = {
  ABIERTO: "Abierto",
  EN_CONTACTO: "En contacto",
  CLASIFICADO: "Clasificado",
  EN_SEGUIMIENTO: "En seguimiento",
  CERRADO: "Cerrado",
};
export const TURNOS: Record<string, string> = {
  MATUTINO: "Matutino",
  VESPERTINO: "Vespertino",
};
export const ZONA = "America/Mexico_City";

// [IA] Generado con Claude (prompt #21 en docs/ia/prompts.md). Revisado por: pendiente
// "AAAA-MM-DD" (un DATE) a DD/MM/AAAA sin pasar por Date, así no se corre un día por la zona horaria.
export const fechaLegible = (fecha: string | null | undefined) =>
  typeof fecha == "string" ? fecha.split("-").reverse().join("/") : "—";

// [IA] Generado con Claude (prompt #21 en docs/ia/prompts.md). Revisado por: pendiente
// Fecha y hora (UTC en el backend) en la hora de México: "21/10/2026, 13:40".
export const fechaHora = (valor: string | null | undefined) =>
  valor
    ? new Date(valor).toLocaleString("es-MX", {
        timeZone: ZONA,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// [IA] Generado con Claude (prompt #21 en docs/ia/prompts.md). Revisado por: pendiente
export const nombreCompleto = (persona: {
  nombre?: string;
  primer_apellido?: string;
  segundo_apellido?: string | null;
  [otro: string]: unknown;
}) =>
  [persona.nombre, persona.primer_apellido, persona.segundo_apellido]
    .filter(Boolean)
    .join(" ");

// [IA] Generado con Claude (prompt #21 en docs/ia/prompts.md). Revisado por: pendiente
// Texto del reintento de llamada (issue 22): "Reintentar a las 13:40" si es hoy, con fecha si es otro día,
// y "Reintento vencido" en negritas cuando ya pasó la hora. Es texto, no solo color.
const Reintento = ({ caso }: { caso: RaRecord }) => {
  if (!caso.siguiente_intento_en) {
    return <Typography variant="body2">—</Typography>;
  }
  const cuando = new Date(caso.siguiente_intento_en);
  const hora = cuando.toLocaleTimeString("es-MX", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
  });
  const mismoDia =
    cuando.toLocaleDateString("en-CA", { timeZone: ZONA }) ==
    new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
  const texto = mismoDia
    ? `a las ${hora}`
    : `el ${fechaHora(caso.siguiente_intento_en)}`;
  return caso.reintento_vencido ? (
    <Typography variant="body2" fontWeight="bold" color="error">
      Reintento vencido (era {texto})
    </Typography>
  ) : (
    <Typography variant="body2">Reintentar {texto}</Typography>
  );
};

// [IA] Generado con Claude (prompt #21 en docs/ia/prompts.md). Revisado por: pendiente
// Bandeja de seguimiento (issue 21): casos no cerrados de mi estancia, en el orden que decide el backend
// (reintentos vencidos primero), por eso las columnas no se pueden ordenar. Clic en un renglón abre el detalle.
// Solo TRABAJO_SOCIAL, MEDICO y DIRECTORA (permisos.ts); DOCENTE no ve seguimientos.
export const Bandeja = () => (
  <List
    title="Bandeja de seguimiento"
    exporter={false}
    empty={
      <Typography sx={{ m: 2 }}>
        No hay casos abiertos en la estancia.
      </Typography>
    }
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <FunctionField
        label="Infante"
        sortable={false}
        render={(caso: RaRecord) => (
          <>
            <Typography variant="body2" fontWeight="bold">
              {nombreCompleto(caso)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {caso.matricula}
            </Typography>
          </>
        )}
      />
      <FunctionField
        label="Falta"
        sortable={false}
        render={(caso: RaRecord) =>
          `${fechaLegible(caso.fecha)} · ${TURNOS[caso.turno] ?? caso.turno}`
        }
      />
      <FunctionField
        label="Motivo"
        sortable={false}
        render={(caso: RaRecord) => caso.estado_nombre}
      />
      <FunctionField
        label="Estado del caso"
        sortable={false}
        render={(caso: RaRecord) => ESTADOS_CASO[caso.estado] ?? caso.estado}
      />
      <FunctionField
        label="Retorno probable"
        sortable={false}
        render={(caso: RaRecord) => fechaLegible(caso.fecha_probable_retorno)}
      />
      <FunctionField
        label="Llamada"
        sortable={false}
        render={(caso: RaRecord) => <Reintento caso={caso} />}
      />
    </Datagrid>
  </List>
);
