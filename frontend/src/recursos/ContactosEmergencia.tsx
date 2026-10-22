import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  useLogoutIfAccessDenied,
  useNotify,
  useRecordContext,
  type HttpError,
} from "react-admin";
import { llamarApi } from "../api";

type Contacto = {
  id: string;
  nombre: string;
  parentesco: string;
  telefono_cifrado: string;
  prioridad: number;
};

const PARENTESCOS: Record<string, string> = {
  MADRE: "Madre",
  PADRE: "Padre",
  ABUELO_A: "Abuelo(a)",
  TIO_A: "Tío(a)",
  HERMANO_A: "Hermano(a)",
  TUTOR_LEGAL: "Tutor legal",
  OTRO: "Otro",
};
const MAX_PRIORIDAD = 10;
// Mismo formato que valida el backend (rutas/contactos.js)
const TELEFONO = /^[0-9+()\s-]{7,20}$/;

const VACIO = { nombre: "", parentesco: "", telefono: "", prioridad: "" };

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Primera prioridad libre de 1 a MAX_PRIORIDAD, para sugerirla al agregar un contacto.
const siguientePrioridad = (contactos: Contacto[]) => {
  const usadas = contactos.map((contacto) => contacto.prioridad);
  for (let prioridad = 1; prioridad <= MAX_PRIORIDAD; prioridad++) {
    if (!usadas.includes(prioridad)) {
      return String(prioridad);
    }
  }
  return "";
};

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Contactos de emergencia en la ficha del infante (debajo del formulario): tabla ordenada por prioridad
// (1 = primero en llamarse) y formulario para agregar o editar. Habla con /Infantes/:id/contactos; el
// teléfono viaja y se guarda cifrado en el backend, aquí solo se ve el que el backend ya descifró.
export const ContactosEmergencia = () => {
  const infante = useRecordContext();
  const notify = useNotify();
  const logoutIfAccessDenied = useLogoutIfAccessDenied();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [datos, setDatos] = useState(VACIO);
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const base = infante ? `/Infantes/${infante.id}/contactos` : null;

  // 401 cierra la sesión (lo decide authProvider.checkError); el resto se avisa con un mensaje claro.
  const manejarError = useCallback(
    (error: unknown, duplicado?: string) => {
      logoutIfAccessDenied(error as Error);
      const { status, body } = error as HttpError;
      if (status == 409 && duplicado) {
        notify(duplicado, { type: "error" });
      } else if (status == 400 && body?.message) {
        notify(body.message, { type: "error" });
      } else if (status == 404) {
        notify("El contacto ya no existe. Se actualizó la lista.", {
          type: "warning",
        });
      } else if (status != 401) {
        notify("ra.notification.http_error", { type: "error" });
      }
    },
    [logoutIfAccessDenied, notify],
  );

  const cargar = useCallback(async () => {
    if (!base) {
      return;
    }
    try {
      const { json } = await llamarApi(base);
      setContactos(json);
    } catch (error) {
      manejarError(error);
    } finally {
      setCargando(false);
    }
  }, [base, manejarError]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (editando == null) {
      setDatos((actual) => ({
        ...actual,
        prioridad: siguientePrioridad(contactos),
      }));
    }
  }, [contactos, editando]);

  const errores = {
    nombre:
      datos.nombre.trim() == "" || datos.nombre.length > 150
        ? "Escriba el nombre (máximo 150 caracteres)"
        : "",
    parentesco: datos.parentesco == "" ? "Elija el parentesco" : "",
    telefono: !TELEFONO.test(datos.telefono.trim())
      ? "Use de 7 a 20 caracteres: números, +, -, paréntesis o espacios"
      : "",
    prioridad:
      !/^\d+$/.test(datos.prioridad) ||
      Number(datos.prioridad) < 1 ||
      Number(datos.prioridad) > MAX_PRIORIDAD
        ? `Escriba un número del 1 al ${MAX_PRIORIDAD}`
        : "",
  };
  const hayErrores = Object.values(errores).some((error) => error != "");

  const limpiar = () => {
    setEditando(null);
    setIntentoGuardar(false);
    setDatos({ ...VACIO, prioridad: siguientePrioridad(contactos) });
  };

  const editar = (contacto: Contacto) => {
    setEditando(contacto.id);
    setIntentoGuardar(false);
    setDatos({
      nombre: contacto.nombre,
      parentesco: contacto.parentesco,
      telefono: contacto.telefono_cifrado,
      prioridad: String(contacto.prioridad),
    });
  };

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    setIntentoGuardar(true);
    if (!base || hayErrores) {
      return;
    }
    setGuardando(true);
    try {
      await llamarApi(editando ? `${base}/${editando}` : base, {
        method: editando ? "PUT" : "POST",
        body: JSON.stringify({
          nombre: datos.nombre.trim(),
          parentesco: datos.parentesco,
          telefono_cifrado: datos.telefono.trim(),
          prioridad: Number(datos.prioridad),
        }),
      });
      notify(editando ? "Contacto actualizado" : "Contacto agregado", {
        type: "success",
      });
      setEditando(null);
      setIntentoGuardar(false);
      setDatos(VACIO);
      await cargar();
    } catch (error) {
      manejarError(
        error,
        "Esa prioridad ya la tiene otro contacto. Elija otra o cambie la de ese contacto.",
      );
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (contacto: Contacto) => {
    if (!base || !window.confirm(`¿Eliminar el contacto ${contacto.nombre}?`)) {
      return;
    }
    try {
      await llamarApi(`${base}/${contacto.id}`, { method: "DELETE" });
      notify("Contacto eliminado", { type: "success" });
      if (editando == contacto.id) {
        setEditando(null);
        setDatos(VACIO);
      }
      await cargar();
    } catch (error) {
      manejarError(error);
      await cargar();
    }
  };

  if (!infante) {
    return null;
  }

  return (
    <Box sx={{ p: 2 }} component="section" aria-labelledby="contactos-titulo">
      <Typography variant="h6" id="contactos-titulo">
        Contactos de emergencia
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Se llama en orden de prioridad: el 1 es el primero.
      </Typography>

      {cargando ? (
        <Typography>Cargando contactos…</Typography>
      ) : contactos.length == 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Este infante aún no tiene contactos de emergencia.
        </Alert>
      ) : (
        <Table size="small" sx={{ mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Prioridad</TableCell>
              <TableCell>Nombre</TableCell>
              <TableCell>Parentesco</TableCell>
              <TableCell>Teléfono</TableCell>
              <TableCell>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {contactos.map((contacto) => (
              <TableRow key={contacto.id} selected={editando == contacto.id}>
                <TableCell>{contacto.prioridad}</TableCell>
                <TableCell>{contacto.nombre}</TableCell>
                <TableCell>
                  {PARENTESCOS[contacto.parentesco] ?? contacto.parentesco}
                </TableCell>
                <TableCell>{contacto.telefono_cifrado}</TableCell>
                <TableCell>
                  <Button
                    size="small"
                    onClick={() => editar(contacto)}
                    aria-label={`Editar a ${contacto.nombre}`}
                  >
                    Editar
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => borrar(contacto)}
                    aria-label={`Eliminar a ${contacto.nombre}`}
                  >
                    Eliminar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Box
        component="form"
        onSubmit={guardar}
        noValidate
        sx={{ display: "grid", gap: 2, maxWidth: 480 }}
      >
        <Typography variant="subtitle1">
          {editando ? "Editar contacto" : "Agregar contacto"}
        </Typography>
        <TextField
          label="Nombre completo"
          value={datos.nombre}
          onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
          error={intentoGuardar && errores.nombre != ""}
          helperText={intentoGuardar ? errores.nombre : ""}
          required
        />
        <TextField
          select
          label="Parentesco"
          value={datos.parentesco}
          onChange={(e) => setDatos({ ...datos, parentesco: e.target.value })}
          error={intentoGuardar && errores.parentesco != ""}
          helperText={intentoGuardar ? errores.parentesco : ""}
          required
        >
          {Object.entries(PARENTESCOS).map(([valor, etiqueta]) => (
            <MenuItem key={valor} value={valor}>
              {etiqueta}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Teléfono"
          type="tel"
          value={datos.telefono}
          onChange={(e) => setDatos({ ...datos, telefono: e.target.value })}
          error={intentoGuardar && errores.telefono != ""}
          helperText={intentoGuardar ? errores.telefono : ""}
          required
        />
        <TextField
          label="Prioridad"
          type="number"
          value={datos.prioridad}
          onChange={(e) => setDatos({ ...datos, prioridad: e.target.value })}
          slotProps={{ htmlInput: { min: 1, max: MAX_PRIORIDAD } }}
          error={intentoGuardar && errores.prioridad != ""}
          helperText={
            intentoGuardar && errores.prioridad != ""
              ? errores.prioridad
              : "1 = primero en llamarse"
          }
          required
        />
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button type="submit" variant="contained" disabled={guardando}>
            {editando ? "Guardar cambios" : "Agregar contacto"}
          </Button>
          {editando && (
            <Button type="button" onClick={limpiar} disabled={guardando}>
              Cancelar
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};
