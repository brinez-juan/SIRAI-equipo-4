import { Datagrid, List, TextField } from "react-admin";

// [IA] Generado con Claude (prompt #3 en docs/ia/prompts.md). Revisado por: pendiente
// Lista mínima para que el menú de ADMIN_CENTRAL tenga contenido; el CRUD completo es del issue de catálogos.
export const listarRegiones = () => (
  <List>
    <Datagrid bulkActionButtons={false}>
      <TextField source="id" label="ID" />
      <TextField source="nombre" label="Nombre" />
    </Datagrid>
  </List>
);
