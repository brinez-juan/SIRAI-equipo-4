import {
  Create,
  Datagrid,
  DeleteButton,
  Edit,
  List,
  SaveButton,
  SimpleForm,
  TextField,
  TextInput,
  Toolbar,
  WrapperField,
  maxLength,
  required,
} from "react-admin";
import { useErrorAlGuardar } from "./errores";
import {
  BotonActivar,
  filtroDesactivadas,
  useMostrandoDesactivadas,
} from "./Desactivadas";

const DUPLICADO = "Ya existe una región con ese nombre.";

// [IA] Generado con Claude (prompt #8 en docs/ia/prompts.md). Revisado por: pendiente
// Al crear solo hay guardar.
const BarraGuardar = () => (
  <Toolbar>
    <SaveButton />
  </Toolbar>
);

// [IA] Generado con Claude (prompt #41 en docs/ia/prompts.md). Revisado por: pendiente
// Al editar, además, "Desactivar" (borrado lógico) con confirmación. pessimistic: si el backend responde 409
// (tiene estancias o supervisores activos), la región sigue en pantalla y el aviso muestra el mensaje del backend.
const BarraEditar = () => (
  <Toolbar sx={{ justifyContent: "space-between" }}>
    <SaveButton />
    <DeleteButton
      label="Desactivar"
      mutationMode="pessimistic"
      confirmTitle="¿Desactivar la región?"
      confirmContent="Dejará de aparecer en las listas y ya no se podrá asignar. Se puede volver a activar con «Mostrar desactivadas». Solo se puede si no tiene estancias ni supervisores activos."
    />
  </Toolbar>
);

// [IA] Generado con Claude (prompt #8 en docs/ia/prompts.md), modificado con el prompt #41. Revisado por: pendiente
// Mismos límites que la columna regiones.nombre en schema.sql.
const FormularioRegion = ({ editando = false }: { editando?: boolean }) => (
  <SimpleForm toolbar={editando ? <BarraEditar /> : <BarraGuardar />}>
    <TextInput
      source="nombre"
      label="Nombre"
      validate={[required(), maxLength(100)]}
    />
  </SimpleForm>
);

// [IA] Generado con Claude (prompt #41 en docs/ia/prompts.md). Revisado por: pendiente
// Con "Mostrar desactivadas" los renglones no abren Editar y llevan el botón Activar.
const TablaRegiones = () => {
  const desactivadas = useMostrandoDesactivadas();
  return (
    <Datagrid
      rowClick={desactivadas ? false : "edit"}
      bulkActionButtons={false}
    >
      <TextField source="id" label="ID" />
      <TextField source="nombre" label="Nombre" />
      {desactivadas && (
        <WrapperField label="Acción">
          <BotonActivar />
        </WrapperField>
      )}
    </Datagrid>
  );
};

// [IA+Humano] Base generada con Claude (prompt #3 en docs/ia/prompts.md), modificada con los prompts #8 y #41. Revisado por: pendiente
export const ListarRegiones = () => (
  <List sort={{ field: "nombre", order: "ASC" }} filters={[filtroDesactivadas]}>
    <TablaRegiones />
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
      <FormularioRegion editando />
    </Edit>
  );
};
