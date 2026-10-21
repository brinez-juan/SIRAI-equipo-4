import { Card, CardContent, Typography } from "@mui/material";
import { useGetIdentity, usePermissions, Title } from "react-admin";

const ROLES: Record<string, string> = {
  ADMIN_CENTRAL: "Administración central",
  SUPERVISOR: "Supervisión",
  DIRECTORA: "Dirección de estancia",
  TRABAJO_SOCIAL: "Trabajo social",
  MEDICO: "Médico",
  DOCENTE: "Docente",
};

// [IA] Generado con Claude (prompt #F3-1 en docs/ia/prompts.md). Revisado por: pendiente
// Pantalla de inicio: confirma quién entró y con qué rol; el menú de la izquierda ya viene filtrado.
export const Inicio = () => {
  const { data: identidad } = useGetIdentity();
  const { permissions: rol } = usePermissions();
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
