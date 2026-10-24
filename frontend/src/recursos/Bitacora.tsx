import { Box, Typography } from "@mui/material";
import {
  Datagrid,
  DateInput,
  FunctionField,
  List,
  ListButton,
  ReferenceInput,
  SelectInput,
  Show,
  SimpleShowLayout,
  TextField,
  TextInput,
  TopToolbar,
  type RaRecord,
} from "react-admin";

// Acciones que se registran hoy: las de registrarPeticion (método HTTP) y las de log() en cada ruta
const ACCIONES = [
  { id: "LOGIN", name: "Inicio de sesión" },
  { id: "CREATE", name: "Alta de registro" },
  { id: "UPDATE", name: "Cambio de registro" },
  { id: "SOFT_DELETE", name: "Baja lógica" },
  { id: "REACTIVAR", name: "Reactivar registro" },
  { id: "DESACTIVAR", name: "Desactivar usuario" },
  { id: "READ_CONFIDENCIAL", name: "Consulta confidencial" },
  { id: "GET", name: "Petición GET" },
  { id: "POST", name: "Petición POST" },
  { id: "PUT", name: "Petición PUT" },
  { id: "DELETE", name: "Petición DELETE" },
];
// Mismo ENUM que audit_log.rol
const ROLES = [
  { id: "ADMIN_CENTRAL", name: "Administrador central" },
  { id: "SUPERVISOR", name: "Supervisor" },
  { id: "DIRECTORA", name: "Directora" },
  { id: "TRABAJO_SOCIAL", name: "Trabajo social" },
  { id: "MEDICO", name: "Médico" },
  { id: "DOCENTE", name: "Docente" },
];
const NOMBRE_ACCION = Object.fromEntries(ACCIONES.map((a) => [a.id, a.name]));
const NOMBRE_ROL = Object.fromEntries(ROLES.map((r) => [r.id, r.name]));

// ts se guarda en UTC; se muestra en la hora de México con segundos (la bitácora es fina).
const fechaHora = (valor: string) =>
  new Date(valor).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

// "Inicio de sesión (LOGIN)": nombre legible y el código tal como queda en la base.
const accionLegible = (registro: RaRecord) =>
  NOMBRE_ACCION[registro.accion]
    ? `${NOMBRE_ACCION[registro.accion]} (${registro.accion})`
    : registro.accion;

// usuario_id NULL = proceso del sistema (ej. el cierre automático del issue 18).
const quien = (registro: RaRecord) =>
  registro.usuario_id == null
    ? "Sistema (proceso automático)"
    : (registro.usuario_nombre ?? registro.usuario_id);

const filtros = [
  // GET /Usuarios no busca por texto, así que se elige de la lista (hasta 200 usuarios)
  <ReferenceInput
    key="usuario_id"
    source="usuario_id"
    reference="Usuarios"
    perPage={200}
    sort={{ field: "nombre", order: "ASC" }}
    alwaysOn
  >
    <SelectInput
      label="Usuario"
      optionText={(u: RaRecord) =>
        `${u.nombre} ${u.primer_apellido} (${u.correo})`
      }
    />
  </ReferenceInput>,
  <SelectInput
    key="accion"
    source="accion"
    label="Acción"
    choices={ACCIONES}
    alwaysOn
  />,
  <DateInput key="fecha_gte" source="fecha_gte" label="Desde" alwaysOn />,
  <DateInput key="fecha_lte" source="fecha_lte" label="Hasta" alwaysOn />,
  <SelectInput key="rol" source="rol" label="Rol" choices={ROLES} />,
  <TextInput
    key="entidad"
    source="entidad"
    label="Entidad o ruta (empieza con)"
  />,
];

// Visor de la bitácora (issue 29), solo ADMIN_CENTRAL y solo lectura: lista de lo más reciente a lo más antiguo
// con filtros por usuario, acción y fechas (más rol y entidad). Clic en un renglón abre el detalle. Sirve para
// mostrar en la presentación que cada petición autenticada queda registrada.
export const ListarBitacora = () => (
  <List
    title="Bitácora"
    filters={filtros}
    sort={{ field: "id", order: "DESC" }}
    perPage={25}
    exporter={false}
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <FunctionField
        label="Fecha y hora"
        sortBy="ts"
        render={(r: RaRecord) => fechaHora(r.ts)}
      />
      <FunctionField label="Usuario" sortable={false} render={quien} />
      <FunctionField
        label="Rol"
        sortBy="rol"
        render={(r: RaRecord) => (r.rol ? (NOMBRE_ROL[r.rol] ?? r.rol) : "—")}
      />
      <FunctionField label="Acción" sortBy="accion" render={accionLegible} />
      <TextField source="entidad" label="Entidad o ruta" />
      <FunctionField
        label="Resultado"
        sortable={false}
        render={(r: RaRecord) =>
          r.despues?.status != null
            ? `HTTP ${r.despues.status}`
            : (r.despues?.resultado ?? "—")
        }
      />
      <TextField source="ip" label="IP" emptyText="—" />
    </Datagrid>
  </List>
);

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Muestra un JSON (antes / después) con sangría; los campos cifrados llegan del backend como "[cifrado]".
const Json = ({ valor }: { valor: unknown }) =>
  valor == null ? (
    <Typography variant="body2">—</Typography>
  ) : (
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 1,
        fontSize: 12,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        bgcolor: "action.hover",
        borderRadius: 1,
      }}
    >
      {JSON.stringify(valor, null, 2)}
    </Box>
  );

// Detalle de un registro: quién, qué, cuándo, desde dónde, antes/después y la cadena de hashes
// (hash = SHA-256(hash_prev + registro), ver log() en backend/seguridad.js).
export const VerBitacora = () => (
  <Show
    title="Registro de bitácora"
    actions={
      <TopToolbar>
        <ListButton label="Volver a la bitácora" />
      </TopToolbar>
    }
  >
    <SimpleShowLayout>
      <TextField source="id" label="Número" />
      <FunctionField
        label="Fecha y hora"
        render={(r: RaRecord) => fechaHora(r.ts)}
      />
      <FunctionField label="Usuario" render={quien} />
      <FunctionField
        label="Rol"
        render={(r: RaRecord) => (r.rol ? (NOMBRE_ROL[r.rol] ?? r.rol) : "—")}
      />
      <FunctionField label="Acción" render={accionLegible} />
      <TextField source="entidad" label="Entidad o ruta" />
      <TextField source="entidad_id" label="Id de la entidad" />
      <TextField source="ip" label="IP" emptyText="—" />
      <TextField source="user_agent" label="Navegador" emptyText="—" />
      <TextField source="request_id" label="Id de la petición" emptyText="—" />
      <FunctionField
        label="Antes"
        render={(r: RaRecord) => <Json valor={r.antes} />}
      />
      <FunctionField
        label="Después"
        render={(r: RaRecord) => <Json valor={r.despues} />}
      />
      <TextField
        source="hash_prev"
        label="Hash del registro anterior"
        emptyText="— (primer registro)"
        sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
      />
      <TextField
        source="hash"
        label="Hash de este registro"
        sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
      />
    </SimpleShowLayout>
  </Show>
);
