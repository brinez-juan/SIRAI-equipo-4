import {
  AutocompleteInput,
  Create,
  Datagrid,
  DeleteButton,
  Edit,
  List,
  ReferenceField,
  ReferenceInput,
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

const DUPLICADO = "Ya existe una estancia con esa clave.";

// Al crear solo hay guardar.
const BarraGuardar = () => (
  <Toolbar>
    <SaveButton />
  </Toolbar>
);

// Al editar, además, "Desactivar" (borrado lógico) con confirmación. pessimistic: si el backend responde 409
// (tiene infantes o usuarios activos), la estancia sigue en pantalla y el aviso muestra el mensaje del backend.
const BarraEditar = () => (
  <Toolbar sx={{ justifyContent: "space-between" }}>
    <SaveButton />
    <DeleteButton
      label="Desactivar"
      mutationMode="pessimistic"
      confirmTitle="¿Desactivar la estancia?"
      confirmContent="Dejará de aparecer en las listas, el tablero y los reportes, y ya no cerrará turnos. Se puede volver a activar con «Mostrar desactivadas». Solo se puede si no tiene infantes ni usuarios activos."
    />
  </Toolbar>
);

// Límites iguales a las columnas de estancias en schema.sql. Los turnos vienen del seed
// y no se editan aquí; max_sesiones queda fuera de alcance (plan, sección 7).
const FormularioEstancia = ({ editando = false }: { editando?: boolean }) => (
  <SimpleForm toolbar={editando ? <BarraEditar /> : <BarraGuardar />}>
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

// Con "Mostrar desactivadas" los renglones no abren Editar y llevan el botón Activar.
const TablaEstancias = () => {
  const desactivadas = useMostrandoDesactivadas();
  return (
    <Datagrid
      rowClick={desactivadas ? false : "edit"}
      bulkActionButtons={false}
    >
      <TextField source="clave" label="Clave" />
      <TextField source="nombre" label="Nombre" />
      <ReferenceField
        source="region_id"
        reference="Regiones"
        label="Región"
        link={desactivadas ? false : "edit"}
      />
      <TextField source="direccion" label="Dirección" />
      {desactivadas && (
        <WrapperField label="Acción">
          <BotonActivar />
        </WrapperField>
      )}
    </Datagrid>
  );
};

export const ListarEstancias = () => (
  <List sort={{ field: "clave", order: "ASC" }} filters={[filtroDesactivadas]}>
    <TablaEstancias />
  </List>
);

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
      <FormularioEstancia editando />
    </Edit>
  );
};
