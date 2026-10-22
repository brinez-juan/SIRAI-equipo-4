import { Card, CardContent, Typography } from "@mui/material";
import { useGetIdentity, usePermissions, Title } from "react-admin";
import { TABLERO, puedeVer } from "../permisos";
import { Tablero } from "./Tablero";

const ROLES: Record<string, string> = {
  ADMIN_CENTRAL: "Administración central",
  SUPERVISOR: "Supervisión",
  DIRECTORA: "Dirección de estancia",
  TRABAJO_SOCIAL: "Trabajo social",
  MEDICO: "Médico",
  DOCENTE: "Docente",
};

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Pantalla de inicio: confirma quién entró y con qué rol; el menú de la izquierda ya viene filtrado.
// Modificado con el prompt #27: para SUPERVISOR y ADMIN_CENTRAL la pantalla principal es el tablero semáforo.
export const Inicio = () => {
  const { data: identidad } = useGetIdentity();
  const { permissions: rol } = usePermissions();
  if (puedeVer(TABLERO, rol)) {
    return <Tablero />;
  }
  return (
    <Card sx={{ mt: 2 }}>
      <Title title="Inicio" />
      <CardContent>
        <Typography variant="h5">
          Bienvenido(a), {identidad?.fullName}
        </Typography>
        <Typography color="text.secondary">Rol: {ROLES[rol] ?? rol}</Typography>
      </CardContent>
    </Card>
  );
};
