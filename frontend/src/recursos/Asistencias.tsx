import { Typography } from "@mui/material";
import {
  Datagrid,
  DateField,
  DateInput,
  FunctionField,
  List,
  SelectField,
  SelectInput,
  TextField,
  type RaRecord,
} from "react-admin";

const TURNOS = [
  { id: "MATUTINO", name: "Matutino" },
  { id: "VESPERTINO", name: "Vespertino" },
];

// Las horas se guardan en UTC; se muestran en la hora de México, igual que el día del pase de lista.
const HORA = {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
} as const;

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// El backend manda la fecha como "AAAA-MM-DD" (es un DATE); se muestra como DD/MM/AAAA sin pasar por Date,
// así no se corre un día por la zona horaria.
const fechaLegible = (asistencia: RaRecord) =>
  typeof asistencia.fecha == "string"
    ? asistencia.fecha.split("-").reverse().join("/")
    : "";

const filtros = [
  <DateInput key="fecha" source="fecha" label="Día" alwaysOn />,
  <DateInput key="fecha_gte" source="fecha_gte" label="Desde" alwaysOn />,
  <DateInput key="fecha_lte" source="fecha_lte" label="Hasta" alwaysOn />,
  <SelectInput
    key="turno"
    source="turno"
    label="Turno"
    choices={TURNOS}
    alwaysOn
  />,
];

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Motivo de un ausente justificado y, debajo, la nota (el backend solo la manda a DIRECTORA, TRABAJO_SOCIAL y MEDICO).
const Motivo = ({ asistencia }: { asistencia: RaRecord }) =>
  asistencia.justificacion_causa_nombre ? (
    <>
      <Typography variant="body2">
        {asistencia.justificacion_causa_nombre}
      </Typography>
      {asistencia.justificacion_nota && (
        <Typography variant="body2" color="text.secondary">
          {asistencia.justificacion_nota}
        </Typography>
      )}
    </>
  ) : (
    <>—</>
  );

// [IA+Humano] Base generada con Claude (prompt #19 en docs/ia/prompts.md), modificada con el prompt #42. Revisado por: pendiente
// Historial de solo lectura para todos los roles de estancia; el backend siempre filtra por la estancia del token.
// El estado se muestra con su nombre (texto), no solo con color. "Motivo": por qué se justificó la falta.
export const ListarAsistencias = () => (
  <List
    title="Historial de asistencia"
    filters={filtros}
    sort={{ field: "fecha", order: "DESC" }}
    exporter={false}
  >
    <Datagrid rowClick={false} bulkActionButtons={false}>
      <FunctionField label="Fecha" sortBy="fecha" render={fechaLegible} />
      <SelectField source="turno" label="Turno" choices={TURNOS} />
      <TextField source="matricula" label="Matrícula" />
      <FunctionField
        label="Infante"
        sortBy="primer_apellido"
        render={(asistencia: RaRecord) =>
          [
            asistencia.nombre,
            asistencia.primer_apellido,
            asistencia.segundo_apellido,
          ]
            .filter(Boolean)
            .join(" ")
        }
      />
      <TextField source="estado_nombre" label="Estado" sortBy="estado_codigo" />
      <FunctionField
        label="Motivo"
        sortable={false}
        render={(asistencia: RaRecord) => <Motivo asistencia={asistencia} />}
      />
      <DateField
        source="hora_entrada"
        label="Entrada"
        showTime
        showDate={false}
        locales="es-MX"
        options={HORA}
        emptyText="—"
      />
      <DateField
        source="hora_salida"
        label="Salida"
        showTime
        showDate={false}
        locales="es-MX"
        options={HORA}
        emptyText="—"
      />
    </Datagrid>
  </List>
);
