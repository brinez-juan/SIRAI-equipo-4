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
};

export const puedeVer = (
  permitidos: Rol[] | undefined,
  rol: string | undefined,
): boolean => !!rol && !!permitidos && (permitidos as string[]).includes(rol);
