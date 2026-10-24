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

// Al crear solo hay guardar.
const BarraGuardar = () => (
  <Toolbar>
    <SaveButton />
  </Toolbar>
);

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

export const ListarRegiones = () => (
  <List sort={{ field: "nombre", order: "ASC" }} filters={[filtroDesactivadas]}>
    <TablaRegiones />
  </List>
);

export const CrearRegion = () => {
  const onError = useErrorAlGuardar(DUPLICADO);
  return (
    <Create title="Nueva región" redirect="list" mutationOptions={{ onError }}>
      <FormularioRegion />
    </Create>
  );
};

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
