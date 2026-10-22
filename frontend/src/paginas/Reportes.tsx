import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  GlobalStyles,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import PrintIcon from "@mui/icons-material/Print";
import { Title, useLogoutIfAccessDenied, type HttpError } from "react-admin";
import { llamarApi } from "../api";
import { ZONA, fechaLegible } from "./Bandeja";

type Estado = { codigo: string; nombre: string };

type Fila = {
  fecha: string;
  region: string;
  clave: string;
  estancia: string;
  conteos: Record<string, number>;
  total: number;
};

type Corte = "HOY" | "MES" | "TRIMESTRE";

// Fecha de hoy en la zona de la estancia, como "AAAA-MM-DD" (en-CA da ese formato).
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: ZONA });

// [IA] Generado con Claude (prompt #28 en docs/ia/prompts.md). Revisado por: pendiente
// Rango {desde, hasta} de cada corte, de su primer día a hoy. El trimestre es el de calendario:
// enero-marzo, abril-junio, julio-septiembre u octubre-diciembre.
const rangoDelCorte = (corte: Corte) => {
  const hasta = hoy();
  const [anio, mes] = hasta.split("-").map(Number);
  if (corte == "HOY") {
    return { desde: hasta, hasta };
  }
  const mesInicial = corte == "MES" ? mes : Math.floor((mes - 1) / 3) * 3 + 1;
  return {
    desde: `${anio}-${String(mesInicial).padStart(2, "0")}-01`,
    hasta,
  };
};

const CORTES: { corte: Corte; etiqueta: string }[] = [
  { corte: "HOY", etiqueta: "Hoy" },
  { corte: "MES", etiqueta: "Este mes" },
  { corte: "TRIMESTRE", etiqueta: "Este trimestre" },
];

// [IA] Generado con Claude (prompt #28 en docs/ia/prompts.md). Revisado por: pendiente
// Al imprimir solo sale el reporte: se ocultan la barra, el menú y los controles, y todo va en negro sobre blanco
// aunque la app esté en modo oscuro.
const estilosImpresion = (
  <GlobalStyles
    styles={{
      "@media print": {
        ".MuiAppBar-root, .MuiDrawer-root, .no-imprimir": {
          display: "none !important",
        },
        "body, #root, .RaLayout-appFrame, .RaLayout-contentWithSidebar, .RaLayout-content":
          {
            background: "#fff !important",
            margin: "0 !important",
            padding: "0 !important",
          },
        ".reporte, .reporte *": {
          color: "#000 !important",
          background: "transparent !important",
          borderColor: "#999 !important",
          boxShadow: "none !important",
        },
        ".reporte tr": { breakInside: "avoid" },
      },
      "@page": { margin: "15mm", size: "landscape" },
    }}
  />
);

// [IA] Generado con Claude (prompt #28 en docs/ia/prompts.md). Revisado por: pendiente
// Cortes de asistencia (issue 28): botones Hoy, Este mes y Este trimestre que calculan el rango (o un rango a mano),
// una tabla por estancia y día con los totales por estado, la descarga en CSV para Excel y la impresión a PDF con
// window.print(). Habla con GET /reportes/asistencia; el backend decide qué estancias ve cada rol
// (DIRECTORA la suya, SUPERVISOR su región, ADMIN_CENTRAL todas). Sin nombres de infantes.
export const Reportes = () => {
  const logoutIfAccessDenied = useLogoutIfAccessDenied();
  const [rango, setRango] = useState(() => rangoDelCorte("HOY"));
  const [datos, setDatos] = useState<{
    estados: Estado[];
    filas: Fila[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  const consulta = `/reportes/asistencia?desde=${rango.desde}&hasta=${rango.hasta}`;

  useEffect(() => {
    setDatos(null);
    setError(null);
    llamarApi(`${consulta}&formato=json`)
      .then(({ json }) => setDatos(json))
      .catch((falla: HttpError) => {
        logoutIfAccessDenied(falla);
        setError(
          falla.status == 400 && falla.message
            ? falla.message
            : "No se pudo cargar el reporte.",
        );
      });
  }, [consulta, logoutIfAccessDenied]);

  // [IA] Generado con Claude (prompt #28 en docs/ia/prompts.md). Revisado por: pendiente
  // Pide el CSV con el token (un enlace directo no lo llevaría) y lo guarda como archivo.
  // fetch quita el BOM al leer el texto; se vuelve a poner para que Excel respete los acentos.
  const descargarCsv = () => {
    setDescargando(true);
    llamarApi(consulta)
      .then(({ body }) => {
        const enlace = document.createElement("a");
        enlace.href = URL.createObjectURL(
          new Blob([body.startsWith("﻿") ? body : "﻿" + body], {
            type: "text/csv;charset=utf-8",
          }),
        );
        enlace.download = `asistencia_${rango.desde}_${rango.hasta}.csv`;
        enlace.click();
        URL.revokeObjectURL(enlace.href);
      })
      .catch((falla: HttpError) => {
        logoutIfAccessDenied(falla);
        setError("No se pudo descargar el CSV.");
      })
      .finally(() => setDescargando(false));
  };

  const corteActivo = CORTES.find(({ corte }) => {
    const { desde, hasta } = rangoDelCorte(corte);
    return desde == rango.desde && hasta == rango.hasta;
  })?.corte;

  return (
    <Box sx={{ mt: 2 }}>
      <Title title="Reportes de asistencia" />
      {estilosImpresion}
      <Box
        className="no-imprimir"
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          alignItems: "center",
          mb: 2,
        }}
      >
        <Box
          role="group"
          aria-label="Corte"
          sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}
        >
          {CORTES.map(({ corte, etiqueta }) => (
            <Button
              key={corte}
              variant={corteActivo == corte ? "contained" : "outlined"}
              aria-pressed={corteActivo == corte}
              onClick={() => setRango(rangoDelCorte(corte))}
            >
              {etiqueta}
            </Button>
          ))}
        </Box>
        {/* fullWidth={false}: react-admin pone todos los campos a lo ancho; aquí van en una fila como en el Figma */}
        <TextField
          label="Desde"
          type="date"
          value={rango.desde}
          onChange={(evento) =>
            evento.target.value &&
            setRango({ ...rango, desde: evento.target.value })
          }
          slotProps={{ inputLabel: { shrink: true } }}
          size="small"
          fullWidth={false}
        />
        <TextField
          label="Hasta"
          type="date"
          value={rango.hasta}
          onChange={(evento) =>
            evento.target.value &&
            setRango({ ...rango, hasta: evento.target.value })
          }
          slotProps={{ inputLabel: { shrink: true } }}
          size="small"
          fullWidth={false}
        />
        <Button
          startIcon={<DownloadIcon />}
          onClick={descargarCsv}
          disabled={!datos || descargando}
        >
          Descargar CSV (Excel)
        </Button>
        <Button
          startIcon={<PrintIcon />}
          onClick={() => window.print()}
          disabled={!datos}
        >
          Imprimir / Guardar PDF
        </Button>
      </Box>

      {error ? (
        <Alert severity="error">{error}</Alert>
      ) : !datos ? (
        <Typography>Cargando…</Typography>
      ) : (
        <Box
          className="reporte"
          component="article"
          sx={{ bgcolor: "background.paper", p: 3, borderRadius: 1 }}
        >
          <Typography variant="h5" component="h2">
            Corte de asistencia
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            SIRAI · Del {fechaLegible(rango.desde)} al{" "}
            {fechaLegible(rango.hasta)} · Registros de asistencia por estancia y
            día (ambos turnos)
          </Typography>
          {datos.filas.length == 0 ? (
            <Typography variant="body2" sx={{ mt: 2 }}>
              No hay registros de asistencia en este periodo.
            </Typography>
          ) : (
            <Table
              size="small"
              aria-label="Registros de asistencia por estancia y día"
              sx={{ mt: 1 }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Estancia</TableCell>
                  <TableCell>Región</TableCell>
                  {datos.estados.map((estado) => (
                    <TableCell key={estado.codigo} align="right">
                      {estado.nombre}
                    </TableCell>
                  ))}
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {datos.filas.map((fila) => (
                  <TableRow key={`${fila.fecha}|${fila.clave}`}>
                    <TableCell>{fechaLegible(fila.fecha)}</TableCell>
                    <TableCell>
                      {fila.clave} — {fila.estancia}
                    </TableCell>
                    <TableCell>{fila.region}</TableCell>
                    {datos.estados.map((estado) => (
                      <TableCell key={estado.codigo} align="right">
                        {fila.conteos[estado.codigo]}
                      </TableCell>
                    ))}
                    <TableCell align="right">{fila.total}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} sx={{ fontWeight: "bold" }}>
                    Total del periodo
                  </TableCell>
                  {datos.estados.map((estado) => (
                    <TableCell
                      key={estado.codigo}
                      align="right"
                      sx={{ fontWeight: "bold" }}
                    >
                      {datos.filas.reduce(
                        (suma, fila) => suma + fila.conteos[estado.codigo],
                        0,
                      )}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: "bold" }}>
                    {datos.filas.reduce((suma, fila) => suma + fila.total, 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </Box>
      )}
    </Box>
  );
};
