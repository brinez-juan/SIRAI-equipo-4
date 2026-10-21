import { useEffect, useState, type ReactNode } from "react";
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
  Typography,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useParams } from "react-router-dom";
import { Title, useLogoutIfAccessDenied, type HttpError } from "react-admin";
import { llamarApi } from "../api";
import {
  ESTADOS_CASO,
  TURNOS,
  fechaHora,
  fechaLegible,
  nombreCompleto,
} from "./Bandeja";
import { RESULTADOS } from "./Seguimiento";

type Llamada = {
  id: string;
  intento: number;
  realizada_en: string;
  realizada_por_nombre: string;
  destinatario: string | null;
  tipo_destinatario: "TUTOR" | "CONTACTO";
  resultado: string;
  notas: string | null;
  siguiente_intento_en: string | null;
};

type Caso = {
  id: string;
  estado: string;
  fecha: string;
  turno: string;
  estado_nombre: string;
  fecha_probable_retorno: string | null;
  cerrado_en: string | null;
  cerrado_por_nombre: string | null;
  causa: {
    nombre: string;
    detalle: string | null;
    requiere_alta: number;
  } | null;
  llamadas: Llamada[];
  alta: {
    folio_justificante: string | null;
    emitida_en: string;
    emitida_por_nombre: string;
    observaciones: string | null;
  } | null;
};

type DatosExpediente = {
  generado_en: string;
  infante: {
    nombre: string;
    primer_apellido: string;
    segundo_apellido: string | null;
    matricula: string;
    fecha_nacimiento: string;
    estancia_clave: string;
    estancia_nombre: string;
  };
  seguimientos: Caso[];
};

// [IA] Generado con Claude (prompt #25 en docs/ia/prompts.md). Revisado por: pendiente
// Al imprimir solo sale el expediente: se ocultan la barra, el menú y los botones, y todo va en negro sobre
// blanco aunque la app esté en modo oscuro. Cada caso intenta no partirse entre dos hojas.
const estilosImpresion = (
  <GlobalStyles
    styles={{
      "@media print": {
        // Clases de MUI: la barra de react-admin es un AppBar y el menú un Drawer
        ".MuiAppBar-root, .MuiDrawer-root, .no-imprimir": {
          display: "none !important",
        },
        "body, #root, .RaLayout-appFrame, .RaLayout-contentWithSidebar, .RaLayout-content":
          {
            background: "#fff !important",
            margin: "0 !important",
            padding: "0 !important",
          },
        ".expediente, .expediente *": {
          color: "#000 !important",
          background: "transparent !important",
          borderColor: "#999 !important",
          boxShadow: "none !important",
        },
        ".expediente-caso": { breakInside: "avoid" },
      },
      "@page": { margin: "15mm" },
    }}
  />
);

// [IA] Generado con Claude (prompt #25 en docs/ia/prompts.md). Revisado por: pendiente
const Dato = ({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: ReactNode;
}) => (
  <Typography variant="body2" sx={{ mb: 0.5 }}>
    <strong>{etiqueta}:</strong> {children}
  </Typography>
);

// [IA] Generado con Claude (prompt #25 en docs/ia/prompts.md). Revisado por: pendiente
// Un caso de seguimiento dentro del expediente: falta, causa, llamadas y alta.
const CasoDelExpediente = ({
  caso,
  numero,
}: {
  caso: Caso;
  numero: number;
}) => (
  <Box
    className="expediente-caso"
    component="section"
    sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2, mb: 2 }}
  >
    <Typography variant="h6" component="h3" gutterBottom>
      Caso {numero} · Falta del {fechaLegible(caso.fecha)} (
      {TURNOS[caso.turno] ?? caso.turno})
    </Typography>
    <Dato etiqueta="Motivo">{caso.estado_nombre}</Dato>
    <Dato etiqueta="Estado del caso">
      {ESTADOS_CASO[caso.estado] ?? caso.estado}
      {caso.cerrado_en &&
        ` el ${fechaHora(caso.cerrado_en)}${caso.cerrado_por_nombre ? ` por ${caso.cerrado_por_nombre}` : ""}`}
    </Dato>
    <Dato etiqueta="Causa">
      {caso.causa
        ? `${caso.causa.nombre}${caso.causa.detalle ? ` — ${caso.causa.detalle}` : ""}`
        : "Sin clasificar"}
    </Dato>
    <Dato etiqueta="Fecha probable de retorno">
      {fechaLegible(caso.fecha_probable_retorno)}
    </Dato>
    <Dato etiqueta="Alta médica">
      {caso.alta
        ? `Folio ${caso.alta.folio_justificante ?? "—"}, emitida el ${fechaHora(caso.alta.emitida_en)} por ${caso.alta.emitida_por_nombre}${caso.alta.observaciones ? `. ${caso.alta.observaciones}` : ""}`
        : caso.causa?.requiere_alta
          ? "Pendiente (la causa requiere alta)"
          : "No aplica"}
    </Dato>

    <Typography variant="subtitle2" component="h4" sx={{ mt: 1.5 }}>
      Llamadas
    </Typography>
    {caso.llamadas.length == 0 ? (
      <Typography variant="body2">Sin llamadas registradas.</Typography>
    ) : (
      <Table size="small" aria-label={`Llamadas del caso ${numero}`}>
        <TableHead>
          <TableRow>
            <TableCell>Intento</TableCell>
            <TableCell>Fecha y hora</TableCell>
            <TableCell>A quién</TableCell>
            <TableCell>Resultado</TableCell>
            <TableCell>Notas</TableCell>
            <TableCell>Registró</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {caso.llamadas.map((llamada) => (
            <TableRow key={llamada.id}>
              <TableCell>{llamada.intento}</TableCell>
              <TableCell>{fechaHora(llamada.realizada_en)}</TableCell>
              <TableCell>
                {llamada.destinatario ?? "—"} (
                {llamada.tipo_destinatario == "TUTOR"
                  ? "tutor"
                  : "contacto de emergencia"}
                )
              </TableCell>
              <TableCell>
                {RESULTADOS[llamada.resultado] ?? llamada.resultado}
              </TableCell>
              <TableCell sx={{ whiteSpace: "pre-wrap" }}>
                {llamada.notas || "—"}
              </TableCell>
              <TableCell>{llamada.realizada_por_nombre}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </Box>
);

// [IA] Generado con Claude (prompt #25 en docs/ia/prompts.md). Revisado por: pendiente
// Expediente imprimible de un infante (issue 25): todos sus seguimientos (también los cerrados) con sus
// llamadas, causa y alta. "Imprimir / Guardar PDF" usa window.print(); el navegador permite guardarlo como
// PDF. No se usa ninguna librería de PDF. Habla con GET /infantes/:id/expediente (TS, MEDICO y DIRECTORA).
export const Expediente = () => {
  const { infanteId } = useParams();
  const navigate = useNavigate();
  const logoutIfAccessDenied = useLogoutIfAccessDenied();
  const [datos, setDatos] = useState<DatosExpediente | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    llamarApi(`/infantes/${encodeURIComponent(infanteId ?? "")}/expediente`)
      .then(({ json }) => setDatos(json))
      .catch((falla: HttpError) => {
        logoutIfAccessDenied(falla);
        setError(
          falla.status == 404
            ? "El infante no existe o no pertenece a su estancia."
            : "No se pudo cargar el expediente.",
        );
      });
  }, [infanteId, logoutIfAccessDenied]);

  return (
    <Box sx={{ mt: 2 }}>
      <Title title="Expediente" />
      {estilosImpresion}
      <Box
        className="no-imprimir"
        sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}
      >
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Regresar
        </Button>
        <Button
          variant="contained"
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
          className="expediente"
          component="article"
          sx={{ bgcolor: "background.paper", p: 3, borderRadius: 1 }}
        >
          <Typography variant="h5" component="h1">
            Expediente de seguimiento de inasistencias
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            SIRAI · {datos.infante.estancia_clave} —{" "}
            {datos.infante.estancia_nombre} · Generado el{" "}
            {fechaHora(datos.generado_en)}
          </Typography>

          <Typography variant="h6" component="h2" sx={{ mt: 2 }}>
            Datos del infante
          </Typography>
          <Dato etiqueta="Nombre">{nombreCompleto(datos.infante)}</Dato>
          <Dato etiqueta="Matrícula">{datos.infante.matricula}</Dato>
          <Dato etiqueta="Fecha de nacimiento">
            {fechaLegible(datos.infante.fecha_nacimiento)}
          </Dato>
          <Dato etiqueta="Casos registrados">{datos.seguimientos.length}</Dato>

          <Typography variant="h6" component="h2" sx={{ mt: 2, mb: 1 }}>
            Seguimientos
          </Typography>
          {datos.seguimientos.length == 0 ? (
            <Typography variant="body2">
              El infante no tiene seguimientos registrados.
            </Typography>
          ) : (
            datos.seguimientos.map((caso, indice) => (
              <CasoDelExpediente
                key={caso.id}
                caso={caso}
                numero={datos.seguimientos.length - indice}
              />
            ))
          )}

          <Typography variant="caption" component="p" sx={{ mt: 2 }}>
            Documento con información confidencial. Su consulta queda registrada
            en la bitácora del sistema.
          </Typography>
        </Box>
      )}
    </Box>
  );
};
