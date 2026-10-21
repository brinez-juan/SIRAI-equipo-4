import {
  AutocompleteInput,
  Create,
  Datagrid,
  Edit,
  List,
  ReferenceField,
  ReferenceInput,
  SaveButton,
  SimpleForm,
  TextField,
  TextInput,
  Toolbar,
  maxLength,
  required,
} from "react-admin";
import { useErrorAlGuardar } from "./errores";

const DUPLICADO = "Ya existe una estancia con esa clave.";

// [IA] Generado con Claude (prompt #8 en docs/ia/prompts.md). Revisado por: pendiente
// Solo guardar: el plan pide lista, crear y editar (sin borrar).
const BarraGuardar = () => (
  <Toolbar>
    <SaveButton />
  </Toolbar>
);

// [IA] Generado con Claude (prompt #8 en docs/ia/prompts.md). Revisado por: pendiente
// Límites iguales a las columnas de estancias en schema.sql. Los turnos vienen del seed
// y no se editan aquí; max_sesiones queda fuera de alcance (plan, sección 7).
const FormularioEstancia = () => (
  <SimpleForm toolbar={<BarraGuardar />}>
    <ReferenceInput
      source="region_id"
      reference="Regiones"
      sort={{ field: "nombre", order: "ASC" }}
    >
      <AutocompleteInput
        label="Región"
        optionText="nombre"
        validate={required()}
      />
    </ReferenceInput>
    <TextInput
      source="clave"
      label="Clave"
      helperText="Clave institucional, por ejemplo EBDI-004"
      validate={[required(), maxLength(20)]}
    />
    <TextInput
      source="nombre"
      label="Nombre"
      validate={[required(), maxLength(150)]}
    />
    <TextInput source="direccion" label="Dirección" validate={maxLength(255)} />
  </SimpleForm>
);

// [IA+Humano] Base generada con Claude (prompt #3 en docs/ia/prompts.md), modificada con el prompt #8. Revisado por: pendiente
export const ListarEstancias = () => (
  <List sort={{ field: "clave", order: "ASC" }}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="clave" label="Clave" />
      <TextField source="nombre" label="Nombre" />
      <ReferenceField source="region_id" reference="Regiones" label="Región" />
      <TextField source="direccion" label="Dirección" />
    </Datagrid>
  </List>
);

// [IA] Generado con Claude (prompt #8 en docs/ia/prompts.md). Revisado por: pendiente
export const CrearEstancia = () => {
  const onError = useErrorAlGuardar(DUPLICADO);
  return (
    <Create
      title="Nueva estancia"
      redirect="list"
      mutationOptions={{ onError }}
    >
      <FormularioEstancia />
    </Create>
  );
};

// [IA] Generado con Claude (prompt #8 en docs/ia/prompts.md). Revisado por: pendiente
// pessimistic: espera la respuesta del backend antes de mostrar el cambio, así un 409 no deja datos falsos en pantalla.
export const EditarEstancia = () => {
  const onError = useErrorAlGuardar(DUPLICADO);
  return (
    <Edit
      title="Editar estancia"
      redirect="list"
      mutationMode="pessimistic"
      mutationOptions={{ onError }}
    >
      <FormularioEstancia />
    </Edit>
  );
};
