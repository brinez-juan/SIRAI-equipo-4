import { Alert, Box, Card, Typography } from "@mui/material";
import {
  BooleanInput,
  RadioButtonGroupInput,
  SimpleForm,
  Title,
  useNotify,
} from "react-admin";
import type { FieldValues } from "react-hook-form";
import {
  ESCALAS,
  guardarPreferencias,
  leerPreferencias,
} from "../preferencias";

const TAMANOS = ESCALAS.map((escala) => ({
  id: escala,
  name: escala == 100 ? "100 % (normal)" : `${escala} %`,
}));

const CONTRASTES = [
  { id: "normal", name: "Normal" },
  { id: "alto", name: "Alto contraste" },
];

// [IA] Generado con Claude (prompt #32 en docs/ia/prompts.md). Revisado por: pendiente
// Pantalla X-01 (Figma): list del <Resource name="preferencias">, como el formulario de perfil del
// Reporte de Hooks. No usa dataProvider: SimpleForm guarda en el navegador y la página se recarga
// para que App.tsx arme el tema con las preferencias nuevas.
export const PreferenciasForm = () => {
  const notify = useNotify();
  const guardar = (datos: FieldValues) => {
    try {
      guardarPreferencias(datos);
    } catch {
      notify(
        "No se pudieron guardar las preferencias: este navegador bloquea el almacenamiento.",
        { type: "error" },
      );
      return;
    }
    notify("Preferencias guardadas. Se aplican al recargar la página.", {
      type: "success",
    });
    // 1.5 s para que el aviso alcance a leerse
    setTimeout(() => window.location.reload(), 1500);
  };
  return (
    <Card sx={{ mt: 2 }}>
      <Title title="Preferencias de accesibilidad" />
      <Box sx={{ px: 2, pt: 2 }}>
        <Typography variant="h5" component="h1">
          Preferencias de accesibilidad
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Ajuste cómo se ve SIRAI. Los cambios se aplican en todas las
          pantallas, también en el inicio de sesión.
        </Typography>
      </Box>
      <SimpleForm onSubmit={guardar} defaultValues={leerPreferencias()}>
        <RadioButtonGroupInput
          source="escala"
          label="Tamaño del texto"
          choices={TAMANOS}
          helperText="Agranda toda la letra de SIRAI. También puede usar el zoom del navegador (Ctrl y +)."
        />
        <RadioButtonGroupInput
          source="contraste"
          label="Contraste"
          choices={CONTRASTES}
          helperText="Alto contraste usa texto negro, bordes gruesos y foco amarillo. El modo oscuro se cambia con el botón de sol y luna de la barra superior."
        />
        <BooleanInput
          source="focoReforzado"
          label="Resaltar el foco"
          helperText="Dibuja un borde grueso alrededor del control en el que está al navegar con Tab."
        />
        <BooleanInput
          source="reducirAnimaciones"
          label="Reducir animaciones"
          helperText="Quita transiciones y efectos al hacer clic. Se enciende solo si su sistema ya lo pide."
        />
        <Alert severity="info">
          Las preferencias se guardan en este navegador, no en su cuenta. Si usa
          otra computadora, ajústelas de nuevo.
        </Alert>
      </SimpleForm>
    </Card>
  );
};
