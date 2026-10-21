import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CircleIcon from "@mui/icons-material/Circle";
import {
  Datagrid,
  FunctionField,
  ListContextProvider,
  NumberField,
  TextField as CampoTexto,
  Title,
  useDataProvider,
  useList,
  type RaRecord,
} from "react-admin";
import type { dataProvider } from "../dataProvider";
import { ZONA } from "./Bandeja";

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

// [IA] Generado con Claude (prompt #27 en docs/ia/prompts.md). Revisado por: pendiente
// Indicador con color y texto ("Verde – 93 %"): el color solo no basta para accesibilidad.
// El porcentaje ya viene truncado a un decimal del backend; aquí no se redondea.
const Semaforo = ({ fila }: { fila: RaRecord }) => {
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

// [IA] Generado con Claude (prompt #27 en docs/ia/prompts.md). Revisado por: pendiente
// Tablero semáforo (issue 27): asistencia por estancia de un día (hoy por defecto), sin datos de infantes.
// Es la pantalla de Inicio de SUPERVISOR (su región) y ADMIN_CENTRAL (todas); se refresca cada 60 s.
export const Tablero = () => {
  const api = useDataProvider<typeof dataProvider>();
  const [fecha, setFecha] = useState(hoy);
  const [filas, setFilas] = useState<RaRecord[]>([]);
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
          // react-admin necesita un id por fila; el backend no lo manda a propósito
          setFilas(datos.map((fila) => ({ ...fila, id: fila.estancia })));
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

  const listContext = useList({ data: filas, isPending: cargando });

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
            <Typography variant="h5" component="h1">
              Tablero de asistencia
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Verde: 90 % o más · Amarillo: 75 % a 89.9 % · Rojo: menos de 75 %
            </Typography>
          </Box>
          <TextField
            type="date"
            label="Día"
            size="small"
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
        <ListContextProvider value={listContext}>
          <Datagrid
            bulkActionButtons={false}
            rowClick={false}
            empty={<Typography>No hay estancias que mostrar.</Typography>}
          >
            <CampoTexto source="estancia" label="Estancia" sortable={false} />
            <NumberField source="total" label="Infantes" sortable={false} />
            <NumberField
              source="presentes"
              label="Presentes"
              sortable={false}
            />
            <FunctionField
              label="Semáforo"
              render={(fila) => <Semaforo fila={fila} />}
            />
          </Datagrid>
        </ListContextProvider>
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
