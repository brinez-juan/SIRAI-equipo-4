import { Datagrid, List, TextField } from "react-admin";

// [IA] Generado con Claude (prompt #3 en docs/ia/prompts.md). Revisado por: pendiente
// Lista mínima para que el menú de ADMIN_CENTRAL tenga contenido; el CRUD completo es del issue de catálogos.
export const listarEstancias = () => (
  <List>
    <Datagrid bulkActionButtons={false}>
      <TextField source="id" label="ID" />
      <TextField source="clave" label="Clave" />
      <TextField source="nombre" label="Nombre" />
      <TextField source="direccion" label="Dirección" />
    </Datagrid>
  </List>
);
