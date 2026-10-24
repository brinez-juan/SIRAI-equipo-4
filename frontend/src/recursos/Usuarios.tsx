import { useWatch } from "react-hook-form";
import {
  BooleanField,
  Button,
  Create,
  Datagrid,
  Edit,
  EmailField,
  FunctionField,
  List,
  PasswordInput,
  ReferenceField,
  ReferenceInput,
  SaveButton,
  SelectField,
  SelectInput,
  SimpleForm,
  TextField,
  TextInput,
  Toolbar,
  TopToolbar,
  WrapperField,
  email,
  required,
  useNotify,
  useRecordContext,
  useUpdate,
  type RaRecord,
} from "react-admin";

// Mismo orden y nombres que el ENUM de usuarios.rol
const ROLES = [
  { id: "DOCENTE", name: "Docente" },
  { id: "TRABAJO_SOCIAL", name: "Trabajo social" },
  { id: "MEDICO", name: "Médico" },
  { id: "DIRECTORA", name: "Directora" },
  { id: "SUPERVISOR", name: "Supervisor" },
  { id: "ADMIN_CENTRAL", name: "Administrador central" },
];

// Roles que llevan estancia (chk_usuarios_alcance); SUPERVISOR lleva región; ADMIN_CENTRAL ninguna
const ROLES_ESTANCIA = ["DOCENTE", "TRABAJO_SOCIAL", "MEDICO", "DIRECTORA"];

// Antes de enviar, limpia la estancia o región que no le toca al rol (por si se cambió de rol
// en el formulario) para no chocar con chk_usuarios_alcance en el backend.
const ajustarAlcance = (data: RaRecord) => ({
  ...data,
  estancia_id: ROLES_ESTANCIA.includes(data.rol) ? data.estancia_id : null,
  region_id: data.rol == "SUPERVISOR" ? (data.region_id ?? null) : null,
});

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Activa o desactiva al usuario del registro actual. El backend no borra usuarios (issue 05).
const BotonActivo = () => {
  const record = useRecordContext();
  const notify = useNotify();
  const [update, { isPending }] = useUpdate();
  if (!record) return null;
  const activo = !!record.activo;
  return (
    <Button
      label={activo ? "Desactivar" : "Activar"}
      color={activo ? "error" : "primary"}
      disabled={isPending}
      onClick={(evento) => {
        evento.stopPropagation(); // que no abra la edición al hacer clic en la fila
        update(
          "Usuarios",
          {
            id: record.id,
            data: { activo: activo ? 0 : 1 },
            previousData: record,
          },
          {
            mutationMode: "pessimistic",
            onSuccess: () =>
              notify(activo ? "Usuario desactivado" : "Usuario activado"),
            onError: (error) =>
              notify((error as Error).message, { type: "error" }),
          },
        );
      }}
    />
  );
};

export const listarUsuarios = () => (
  <List sort={{ field: "nombre", order: "ASC" }}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <FunctionField
        label="Nombre"
        sortBy="nombre"
        render={(r: RaRecord) =>
          [r.nombre, r.primer_apellido, r.segundo_apellido]
            .filter(Boolean)
            .join(" ")
        }
      />
      <EmailField source="correo" label="Correo" />
      <SelectField source="rol" label="Rol" choices={ROLES} />
      <ReferenceField
        source="estancia_id"
        reference="Estancias"
        label="Estancia"
        link={false}
        emptyText="—"
      >
        <TextField source="nombre" />
      </ReferenceField>
      <BooleanField source="activo" label="Activo" looseValue />
      <WrapperField label="Acción">
        <BotonActivo />
      </WrapperField>
    </Datagrid>
  </List>
);

// Muestra estancia o región según el rol elegido en el formulario
const CamposAlcance = () => {
  const rol = useWatch({ name: "rol" });
  if (ROLES_ESTANCIA.includes(rol)) {
    return (
      <ReferenceInput
        source="estancia_id"
        reference="Estancias"
        sort={{ field: "nombre", order: "ASC" }}
        perPage={100}
      >
        <SelectInput
          label="Estancia"
          optionText="nombre"
          validate={required()}
        />
      </ReferenceInput>
    );
  }
  if (rol == "SUPERVISOR") {
    return (
      <ReferenceInput
        source="region_id"
        reference="Regiones"
        sort={{ field: "nombre", order: "ASC" }}
        perPage={100}
      >
        <SelectInput label="Región" optionText="nombre" />
      </ReferenceInput>
    );
  }
  return null;
};

// Campos comunes de crear y editar. Al crear la contraseña es obligatoria; al editar, vacía = no cambia.
const CamposUsuario = ({ esNuevo }: { esNuevo: boolean }) => (
  <>
    <TextInput source="nombre" label="Nombre" validate={required()} />
    <TextInput
      source="primer_apellido"
      label="Primer apellido"
      validate={required()}
    />
    <TextInput source="segundo_apellido" label="Segundo apellido" />
    <TextInput
      source="correo"
      label="Correo"
      type="email"
      validate={[required(), email()]}
    />
    <PasswordInput
      source="password"
      label={esNuevo ? "Contraseña" : "Nueva contraseña"}
      helperText={esNuevo ? false : "Déjala vacía para no cambiarla"}
      validate={esNuevo ? required() : undefined}
      autoComplete="new-password"
    />
    <SelectInput
      source="rol"
      label="Rol"
      choices={ROLES}
      validate={required()}
    />
    <CamposAlcance />
  </>
);

// Al editar solo se guarda: no hay botón de eliminar, se desactiva con BotonActivo
const BarraEditar = () => (
  <Toolbar>
    <SaveButton />
  </Toolbar>
);

export const crearUsuario = () => (
  <Create transform={ajustarAlcance} redirect="list">
    <SimpleForm>
      <CamposUsuario esNuevo />
    </SimpleForm>
  </Create>
);

// pessimistic: espera la respuesta del backend para mostrar sus mensajes (rol/alcance, correo repetido)
export const editarUsuario = () => (
  <Edit
    transform={ajustarAlcance}
    mutationMode="pessimistic"
    redirect="list"
    actions={
      <TopToolbar>
        <BotonActivo />
      </TopToolbar>
    }
  >
    <SimpleForm toolbar={<BarraEditar />}>
      <CamposUsuario esNuevo={false} />
    </SimpleForm>
  </Edit>
);
