import {
  BooleanInput,
  Create,
  Datagrid,
  Edit,
  List,
  SaveButton,
  SearchInput,
  SimpleForm,
  TextField,
  TextInput,
  Toolbar,
  email,
  maxLength,
  regex,
  required,
  useResourceDefinition,
} from "react-admin";
import { useErrorAlGuardar } from "./errores";

const DUPLICADO = "Ya existe un tutor con esos datos.";

const filtros = [
  <SearchInput
    key="q"
    source="q"
    alwaysOn
    placeholder="Buscar por nombre"
    inputProps={{ "aria-label": "Buscar por nombre" }}
  />,
];

// Mismo formato que valida el backend (rutas/tutores.js): 7 a 20 caracteres entre números, +, -, paréntesis y espacios.
const validarTelefono = [
  required(),
  regex(
    /^[0-9+()\s-]{7,20}$/,
    "Use de 7 a 20 caracteres: números, +, -, paréntesis o espacios",
  ),
];

// required() deja pasar false en una casilla, por eso se compara con true. El backend repite la
// revisión y responde 400 si no llega aceptada.
const debeAceptar = (valor?: boolean) =>
  valor === true
    ? undefined
    : "Debe aceptar el aviso de privacidad y el contacto telefónico";

// Solo guardar: el plan no pide borrar tutores desde la pantalla.
const BarraGuardar = () => (
  <Toolbar>
    <SaveButton />
  </Toolbar>
);

// Límites iguales a las columnas de tutores en schema.sql. El teléfono viaja como "telefono_cifrado"
// y se guarda cifrado.
const CamposTutor = () => (
  <>
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
    <TextInput
      source="telefono_cifrado"
      label="Teléfono"
      type="tel"
      validate={validarTelefono}
    />
    <TextInput
      source="correo"
      label="Correo electrónico"
      type="email"
      validate={[email(), maxLength(150)]}
    />
  </>
);

// Cualquiera de los dos roles que gestionan tutores abre la ficha al dar clic.
export const ListarTutores = () => {
  const { hasEdit } = useResourceDefinition();
  return (
    <List filters={filtros} sort={{ field: "primer_apellido", order: "ASC" }}>
      <Datagrid rowClick={hasEdit ? "edit" : false} bulkActionButtons={false}>
        <TextField source="nombre" label="Nombre(s)" />
        <TextField source="primer_apellido" label="Primer apellido" />
        <TextField source="segundo_apellido" label="Segundo apellido" />
        <TextField source="telefono_cifrado" label="Teléfono" />
        <TextField source="correo" label="Correo electrónico" />
      </Datagrid>
    </List>
  );
};

// La casilla obligatoria solo existe al crear: el consentimiento se registra una vez, con la versión
// vigente del aviso (2026.1). El backend guarda quién lo registró y cuándo.
export const CrearTutor = () => {
  const onError = useErrorAlGuardar(DUPLICADO);
  return (
    <Create title="Nuevo tutor" redirect="list" mutationOptions={{ onError }}>
      <SimpleForm toolbar={<BarraGuardar />}>
        <CamposTutor />
        <BooleanInput
          source="acepta_aviso"
          label="Acepta el aviso de privacidad y el contacto telefónico"
          helperText="Aviso de privacidad, versión 2026.1"
          defaultValue={false}
          validate={debeAceptar}
        />
      </SimpleForm>
    </Create>
  );
};

// pessimistic: espera la respuesta del backend antes de mostrar el cambio, así un error no deja datos falsos en pantalla.
export const EditarTutor = () => {
  const onError = useErrorAlGuardar(DUPLICADO);
  return (
    <Edit
      title="Editar tutor"
      redirect="list"
      mutationMode="pessimistic"
      mutationOptions={{ onError }}
    >
      <SimpleForm toolbar={<BarraGuardar />}>
        <CamposTutor />
      </SimpleForm>
    </Edit>
  );
};
