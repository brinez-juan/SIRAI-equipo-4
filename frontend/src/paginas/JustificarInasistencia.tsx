import { useState, type FormEvent } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";

// Mismo tope que MAX_NOTA en backend/rutas/asistencia.js
const MAX_NOTA = 500;

export type Motivo = { codigo: string; nombre: string };

// Lo que se manda en el PUT /pase-lista como "justificacion". Sin nota, el backend conserva la que ya tenía.
export type JustificacionCapturada = { causa_codigo: string; nota?: string };

type Props = {
  // Nombre del infante que se está justificando; null cierra el diálogo
  infante: string | null;
  motivos: Motivo[];
  // Motivo que ya tenía, si se está cambiando
  motivoActual?: string;
  // Nota que ya tenía; solo llega a los roles que la pueden leer
  notaActual?: string | null;
  // El rol puede leer la nota después (DIRECTORA); si no (DOCENTE), se le avisa que no la volverá a ver
  leeNota: boolean;
  enviando: boolean;
  alCancelar: () => void;
  alGuardar: (justificacion: JustificacionCapturada) => void;
};

// [IA] Generado con Claude (prompt #42 en docs/ia/prompts.md). Revisado por: pendiente
// Diálogo "Justificar inasistencia" del pase de lista (feature 42): al marcar Ausente justificado pide el motivo
// (obligatorio, del catálogo que manda GET /pase-lista) y una nota opcional, que el backend guarda cifrada.
// Con "Cambiar motivo" se abre con lo que ya tenía; una nota vacía conserva la anterior.
export const JustificarInasistencia = ({
  infante,
  motivos,
  motivoActual,
  notaActual,
  leeNota,
  enviando,
  alCancelar,
  alGuardar,
}: Props) => {
  const [motivo, setMotivo] = useState(motivoActual ?? "");
  const [nota, setNota] = useState(notaActual ?? "");
  const [intento, setIntento] = useState(false);
  const errores = {
    motivo: motivo == "" ? "Elija el motivo" : "",
    nota: nota.length > MAX_NOTA ? `Máximo ${MAX_NOTA} caracteres` : "",
  };

  const guardar = (evento: FormEvent) => {
    evento.preventDefault();
    setIntento(true);
    if (errores.motivo || errores.nota) {
      return;
    }
    alGuardar(
      nota.trim() == ""
        ? { causa_codigo: motivo }
        : { causa_codigo: motivo, nota: nota.trim() },
    );
  };

  const ayudaNota =
    errores.nota ||
    (leeNota
      ? `${nota.length}/${MAX_NOTA} · confidencial: solo la ven Dirección, Trabajo social y Médico`
      : `${nota.length}/${MAX_NOTA} · confidencial: después no podrá verla (solo Dirección, Trabajo social y Médico)` +
        (motivoActual ? ". Déjela vacía para conservar la anterior" : ""));

  return (
    <Dialog
      open={infante != null}
      onClose={() => !enviando && alCancelar()}
      aria-labelledby="justificar-titulo"
      aria-describedby="justificar-descripcion"
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={guardar} noValidate>
        <DialogTitle id="justificar-titulo">
          Justificar inasistencia
        </DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2 }}>
          <DialogContentText id="justificar-descripcion">
            ¿Por qué se justifica la falta de {infante}?
          </DialogContentText>
          <TextField
            select
            label="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            error={intento && errores.motivo != ""}
            helperText={intento ? errores.motivo : ""}
            required
            autoFocus
          >
            {motivos.map((m) => (
              <MenuItem key={m.codigo} value={m.codigo}>
                {m.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Nota (opcional)"
            placeholder="Por ejemplo: la mamá avisó por teléfono que tiene fiebre"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            multiline
            minRows={2}
            error={errores.nota != ""}
            helperText={ayudaNota}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={alCancelar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={enviando}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
