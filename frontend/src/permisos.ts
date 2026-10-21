// [IA] Generado con Claude (prompt #3 en docs/ia/prompts.md). Revisado por: pendiente
// Fuente única de permisos del frontend (tabla 2.5 del plan). Cada issue agrega su línea
// a RECURSOS con los roles que pueden verlo; App.tsx solo lee esta tabla.

export type Rol =
  | "ADMIN_CENTRAL"
  | "SUPERVISOR"
  | "DIRECTORA"
  | "TRABAJO_SOCIAL"
  | "MEDICO"
  | "DOCENTE";

export const TODOS_LOS_ROLES: Rol[] = [
  "ADMIN_CENTRAL",
  "SUPERVISOR",
  "DIRECTORA",
  "TRABAJO_SOCIAL",
  "MEDICO",
  "DOCENTE",
];

// Nombre del <Resource> (igual que en el backend) -> roles que lo ven
export const RECURSOS: Record<string, Rol[]> = {
  Regiones: ["ADMIN_CENTRAL"],
  Estancias: ["ADMIN_CENTRAL"],
  Infantes: ["DIRECTORA", "DOCENTE", "TRABAJO_SOCIAL", "MEDICO"],
  Tutores: ["DIRECTORA", "TRABAJO_SOCIAL"],
  Usuarios: ["ADMIN_CENTRAL"],
  Asistencias: ["DIRECTORA", "DOCENTE", "TRABAJO_SOCIAL", "MEDICO"],
  // Bandeja y detalle de seguimiento (issue 21). DOCENTE no ve notas ni seguimientos (tabla 2.5)
  seguimientos: ["TRABAJO_SOCIAL", "MEDICO", "DIRECTORA"],
};

// [IA] Generado con Claude (prompt #9 en docs/ia/prompts.md). Revisado por: pendiente
// Roles que pueden crear y editar, cuando son menos que los que ven. Si un recurso no aparece
// aquí, escriben los mismos de RECURSOS. Debe coincidir con "escritura" en el backend.
export const ESCRITURA: Record<string, Rol[]> = {
  Infantes: ["DIRECTORA"],
  PaseLista: ["DOCENTE", "DIRECTORA"],
  // Issue 24: emiten la alta médica (cerrar el caso lo pueden todos los que ven el seguimiento)
  AltaMedica: ["MEDICO", "DIRECTORA"],
};

// [IA] Generado con Claude (prompt #14 en docs/ia/prompts.md). Revisado por: pendiente
// Páginas propias (no son <Resource>): ruta -> roles que la ven en el menú y pueden abrirla.
export const PAGINAS: Record<string, Rol[]> = {
  "pase-lista": ["DOCENTE", "DIRECTORA", "TRABAJO_SOCIAL", "MEDICO"],
  // Expediente imprimible (issue 25); se abre desde el detalle del seguimiento, no desde el menú
  "expediente/:infanteId": ["TRABAJO_SOCIAL", "MEDICO", "DIRECTORA"],
};

// Tablero semáforo (issue 27): es su pantalla de Inicio, no una ruta propia. Debe coincidir con backend/rutas/tablero.js
export const TABLERO: Rol[] = ["SUPERVISOR", "ADMIN_CENTRAL"];

export const puedeVer = (
  permitidos: Rol[] | undefined,
  rol: string | undefined,
): boolean => !!rol && !!permitidos && (permitidos as string[]).includes(rol);
