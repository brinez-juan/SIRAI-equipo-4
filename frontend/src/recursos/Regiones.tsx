import {
  Create,
  Datagrid,
  Edit,
  List,
  SaveButton,
  SimpleForm,
  TextField,
  TextInput,
  Toolbar,
  maxLength,
  required,
} from "react-admin";
import { useErrorAlGuardar } from "./errores";

const DUPLICADO = "Ya existe una región con ese nombre.";

// [IA] Generado con Claude (prompt #8 en docs/ia/prompts.md). Revisado por: pendiente
// Solo guardar: el plan pide lista, crear y editar (sin borrar).
const BarraGuardar = () => (
  <Toolbar>
    <SaveButton />
  </Toolbar>
);

// [IA] Generado con Claude (prompt #8 en docs/ia/prompts.md). Revisado por: pendiente
// Mismos límites que la columna regiones.nombre en schema.sql.
const FormularioRegion = () => (
  <SimpleForm toolbar={<BarraGuardar />}>
    <TextInput
      source="nombre"
      label="Nombre"
      validate={[required(), maxLength(100)]}
    />
  </SimpleForm>
);

// [IA+Humano] Base generada con Claude (prompt #3 en docs/ia/prompts.md), modificada con el prompt #8. Revisado por: pendiente
export const ListarRegiones = () => (
  <List sort={{ field: "nombre", order: "ASC" }}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="id" label="ID" />
      <TextField source="nombre" label="Nombre" />
    </Datagrid>
  </List>
);

// [IA] Generado con Claude (prompt #8 en docs/ia/prompts.md). Revisado por: pendiente
export const CrearRegion = () => {
  const onError = useErrorAlGuardar(DUPLICADO);
  return (
    <Create title="Nueva región" redirect="list" mutationOptions={{ onError }}>
      <FormularioRegion />
    </Create>
  );
};

// [IA] Generado con Claude (prompt #8 en docs/ia/prompts.md). Revisado por: pendiente
// pessimistic: espera la respuesta del backend antes de mostrar el cambio, así un 409 no deja datos falsos en pantalla.
export const EditarRegion = () => {
  const onError = useErrorAlGuardar(DUPLICADO);
  return (
    <Edit
      title="Editar región"
      redirect="list"
      mutationMode="pessimistic"
      mutationOptions={{ onError }}
    >
      <FormularioRegion />
    </Edit>
  );
};
