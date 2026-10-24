import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import CircleIcon from "@mui/icons-material/Circle";
import { Title, useDataProvider } from "react-admin";
import type { dataProvider } from "../dataProvider";
import { ZONA } from "./Bandeja";

type Fila = Awaited<ReturnType<typeof dataProvider.tablero>>[number];

// Cada cuánto se vuelve a pedir el tablero
const REFRESCO_MS = 60_000;

// Mismos valores que semaforo() en backend/rutas/tablero.js
const SEMAFOROS: Record<
  string,
  { texto: string; color: "success" | "warning" | "error" | "default" }
> = {
  VERDE: { texto: "Verde", color: "success" },
  AMARILLO: { texto: "Amarillo", color: "warning" },
  ROJO: { texto: "Rojo", color: "error" },
  SIN_DATOS: { texto: "Sin datos", color: "default" },
};

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: ZONA });

// Indicador con color y texto ("Verde – 93 %"): el color solo no basta para accesibilidad.
// El porcentaje ya viene truncado a un decimal del backend; aquí no se redondea.
const Semaforo = ({ fila }: { fila: Fila }) => {
  const semaforo = SEMAFOROS[fila.semaforo] ?? SEMAFOROS.SIN_DATOS;
  const texto =
    fila.porcentaje == null
      ? semaforo.texto
      : `${semaforo.texto} – ${Number(fila.porcentaje).toLocaleString("es-MX", { maximumFractionDigits: 1 })} %`;
  return (
    <Chip
      icon={<CircleIcon aria-hidden />}
      label={texto}
      color={semaforo.color}
      variant={semaforo.color == "default" ? "outlined" : "filled"}
      sx={{ fontWeight: "bold" }}
    />
  );
};

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Tablero semáforo (issue 27): asistencia por estancia de un día (hoy por defecto), sin datos de infantes.
// Es la pantalla de Inicio de SUPERVISOR (su región) y ADMIN_CENTRAL (todas); se refresca cada 60 s.
// Modificado con el prompt #40: tabla de MUI en vez de <Datagrid>. Inicio no es un <Resource> y Datagrid
// exige uno (useCanAccess lanzaba un error y react-admin mostraba "Algo salió mal").
export const Tablero = () => {
  const api = useDataProvider<typeof dataProvider>();
  const [fecha, setFecha] = useState(hoy);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);

  useEffect(() => {
    let vigente = true;
    const cargar = () =>
      api
        .tablero(fecha)
        .then((datos) => {
          if (!vigente) return;
          setFilas(datos);
          setError(null);
          setActualizado(new Date());
        })
        .catch((e: Error) => vigente && setError(e.message))
        .finally(() => vigente && setCargando(false));
    setCargando(true);
    cargar();
    const intervalo = setInterval(cargar, REFRESCO_MS);
    return () => {
      vigente = false;
      clearInterval(intervalo);
    };
  }, [api, fecha]);

  return (
    <Card sx={{ mt: 2 }}>
      <Title title="Tablero de asistencia" />
      <CardContent>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ sm: "center" }}
          justifyContent="space-between"
          mb={2}
        >
          <Box>
            <Typography variant="h5" component="h2">
              Tablero de asistencia
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Verde: 90 % o más · Amarillo: 75 % a 89.9 % · Rojo: menos de 75 %
            </Typography>
          </Box>
          {/* fullWidth={false}: react-admin pone todos los campos a lo ancho; aquí van en una fila como en el Figma */}
          <TextField
            type="date"
            label="Día"
            size="small"
            fullWidth={false}
            value={fecha}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { max: hoy() },
            }}
          />
        </Stack>
        {error && (
          <Typography color="error" role="alert" mb={2}>
            {error}
          </Typography>
        )}
        {cargando && filas.length == 0 ? (
          <Typography>Cargando…</Typography>
        ) : filas.length == 0 ? (
          <Typography>No hay estancias que mostrar.</Typography>
        ) : (
          <Table size="small" aria-label="Asistencia por estancia">
            <TableHead>
              <TableRow>
                <TableCell>Estancia</TableCell>
                <TableCell align="right">Infantes</TableCell>
                <TableCell align="right">Presentes</TableCell>
                <TableCell>Semáforo</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.map((fila) => (
                <TableRow key={fila.estancia}>
                  <TableCell>{fila.estancia}</TableCell>
                  <TableCell align="right">{fila.total}</TableCell>
                  <TableCell align="right">{fila.presentes}</TableCell>
                  <TableCell>
                    <Semaforo fila={fila} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          mt={1}
          aria-live="polite"
        >
          {actualizado
            ? `Actualizado a las ${actualizado.toLocaleTimeString("es-MX", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" })}; se actualiza cada minuto.`
            : "Cargando…"}
        </Typography>
      </CardContent>
    </Card>
  );
};
