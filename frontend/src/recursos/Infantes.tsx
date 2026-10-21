import {
  Create,
  Datagrid,
  DateField,
  DateInput,
  Edit,
  List,
  SaveButton,
  SearchInput,
  SimpleForm,
  TextField,
  TextInput,
  Toolbar,
  maxLength,
  required,
  useResourceDefinition,
} from "react-admin";
import { useErrorAlGuardar } from "./errores";
import { TutoresDelInfante } from "./TutoresDelInfante";

const DUPLICADO =
  "Ya existe un infante con esa matrícula o ese código de credencial.";

// fecha_nacimiento es DATE, pero llega como "2023-05-10T00:00:00.000Z". En la hora de México
// eso cae el día anterior, así que se muestra en UTC y el formulario usa solo "AAAA-MM-DD".
const soloFecha = (valor: unknown) =>
  typeof valor == "string" ? valor.slice(0, 10) : valor;

const filtros = [
  <SearchInput
    key="q"
    source="q"
    alwaysOn
    placeholder="Buscar por nombre o matrícula"
    inputProps={{ "aria-label": "Buscar por nombre o matrícula" }}
  />,
];

// [IA] Generado con Claude (prompt #9 en docs/ia/prompts.md). Revisado por: pendiente
// Solo guardar: el plan pide lista, crear y editar (sin borrar).
const BarraGuardar = () => (
  <Toolbar>
    <SaveButton />
  </Toolbar>
);

// [IA] Generado con Claude (prompt #9 en docs/ia/prompts.md). Revisado por: pendiente
// Límites iguales a las columnas de infantes en schema.sql. La estancia no se captura:
// el backend la toma del usuario que inició sesión.
const FormularioInfante = () => (
  <SimpleForm toolbar={<BarraGuardar />}>
    <TextInput
      source="matricula"
      label="Matrícula"
      validate={[required(), maxLength(30)]}
    />
    <TextInput
      source="nombre"
      label="Nombre(s)"
      validate={[required(), maxLength(100)]}
    />
    <TextInput
      source="primer_apellido"
      label="Primer apellido"
      validate={[required(), maxLength(100)]}
    />
    <TextInput
      source="segundo_apellido"
      label="Segundo apellido"
      validate={maxLength(100)}
    />
    <DateInput
      source="fecha_nacimiento"
      label="Fecha de nacimiento"
      format={soloFecha}
      validate={required()}
    />
    <TextInput
      source="codigo_credencial"
      label="Código de credencial"
      helperText="Contenido del QR o código de barras de la credencial"
      validate={[required(), maxLength(64)]}
    />
  </SimpleForm>
);

// [IA] Generado con Claude (prompt #9 en docs/ia/prompts.md). Revisado por: pendiente
// Todos los roles de estancia ven la lista; solo quien puede editar (DIRECTORA) abre la ficha al dar clic.
export const ListarInfantes = () => {
  const { hasEdit } = useResourceDefinition();
  return (
    <List filters={filtros} sort={{ field: "primer_apellido", order: "ASC" }}>
      <Datagrid rowClick={hasEdit ? "edit" : false} bulkActionButtons={false}>
        <TextField source="matricula" label="Matrícula" />
        <TextField source="nombre" label="Nombre(s)" />
        <TextField source="primer_apellido" label="Primer apellido" />
        <TextField source="segundo_apellido" label="Segundo apellido" />
        <DateField
          source="fecha_nacimiento"
          label="Fecha de nacimiento"
          locales="es-MX"
          options={{ timeZone: "UTC" }}
        />
      </Datagrid>
    </List>
  );
};

// [IA] Generado con Claude (prompt #9 en docs/ia/prompts.md). Revisado por: pendiente
export const CrearInfante = () => {
  const onError = useErrorAlGuardar(DUPLICADO);
  return (
    <Create title="Nuevo infante" redirect="list" mutationOptions={{ onError }}>
      <FormularioInfante />
    </Create>
  );
};

// [IA] Generado con Claude (prompt #9 en docs/ia/prompts.md). Revisado por: pendiente
// pessimistic: espera la respuesta del backend antes de mostrar el cambio, así un 409 no deja datos falsos en pantalla.
// Modificado con el prompt #11: debajo del formulario va la sección de tutores del infante.
export const EditarInfante = () => {
  const onError = useErrorAlGuardar(DUPLICADO);
  return (
    <Edit
      title="Editar infante"
      redirect="list"
      mutationMode="pessimistic"
      mutationOptions={{ onError }}
    >
      <FormularioInfante />
      <TutoresDelInfante />
    </Edit>
  );
};
