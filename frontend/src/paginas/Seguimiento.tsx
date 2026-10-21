import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { ListButton, Show, TopToolbar, useRecordContext } from "react-admin";
import {
  ESTADOS_CASO,
  TURNOS,
  fechaHora,
  fechaLegible,
  nombreCompleto,
} from "./Bandeja";

type Persona = {
  id: string;
  nombre: string;
  primer_apellido?: string;
  segundo_apellido?: string | null;
  parentesco: string;
  telefono: string | null;
};
type Tutor = Persona & { correo: string | null; autorizado_recoger: number };
type Contacto = Persona & { prioridad: number };
type Llamada = {
  id: string;
  intento: number;
  tutor_id: string | null;
  contacto_emergencia_id: string | null;
  realizada_en: string;
  realizada_por_nombre: string;
  resultado: string;
  notas: string | null;
  siguiente_intento_en: string | null;
};

// Mismos valores que los ENUM de schema.sql
const PARENTESCOS: Record<string, string> = {
  MADRE: "Madre",
  PADRE: "Padre",
  ABUELO_A: "Abuelo(a)",
  TIO_A: "Tío(a)",
  HERMANO_A: "Hermano(a)",
  TUTOR_LEGAL: "Tutor legal",
  OTRO: "Otro",
};
const RESULTADOS: Record<string, string> = {
  CONTACTO_EXITOSO: "Contacto exitoso",
  SIN_RESPUESTA: "Sin respuesta",
  NUMERO_EQUIVOCADO: "Número equivocado",
  BUZON: "Buzón de voz",
};

// [IA] Generado con Claude (prompt #21 en docs/ia/prompts.md). Revisado por: pendiente
// Una sección del detalle: tarjeta con título (h2 para lectores de pantalla) y contenido.
const Seccion = ({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) => (
  <Card variant="outlined" sx={{ mb: 2 }}>
    <CardContent>
      <Typography variant="h6" component="h2" gutterBottom>
        {titulo}
      </Typography>
      {children}
    </CardContent>
  </Card>
);

// [IA] Generado con Claude (prompt #21 en docs/ia/prompts.md). Revisado por: pendiente
// Renglón "Etiqueta: valor" para los datos sueltos.
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

// [IA] Generado con Claude (prompt #21 en docs/ia/prompts.md). Revisado por: pendiente
// El teléfono como enlace tel:, para marcar directo desde un teléfono o softphone.
const Telefono = ({ numero }: { numero: string | null }) =>
  numero ? (
    <Link href={`tel:${numero.replace(/[^0-9+]/g, "")}`}>{numero}</Link>
  ) : (
    <>—</>
  );

// [IA] Generado con Claude (prompt #21 en docs/ia/prompts.md). Revisado por: pendiente
// Contenido del detalle. El backend ya descifró teléfonos, notas, detalle de la causa y observaciones
// del alta, y registró la consulta en audit_log como READ_CONFIDENCIAL.
const DetalleSeguimiento = () => {
  const caso = useRecordContext();
  // Mientras llega GET /seguimientos/:id, react-admin muestra el renglón de la bandeja que ya tenía,
  // y ese no trae infante, tutores ni llamadas: se espera al detalle completo.
  if (!caso?.infante) {
    return <Typography sx={{ p: 2 }}>Cargando…</Typography>;
  }
  const tutores: Tutor[] = caso.tutores ?? [];
  const contactos: Contacto[] = caso.contactos ?? [];
  const llamadas: Llamada[] = caso.llamadas ?? [];
  // A quién se llamó: la llamada guarda el id del tutor o del contacto
  const destinatario = (llamada: Llamada) => {
    const persona: Persona | undefined = llamada.tutor_id
      ? tutores.find((tutor) => tutor.id == llamada.tutor_id)
      : contactos.find(
          (contacto) => contacto.id == llamada.contacto_emergencia_id,
        );
    if (!persona) {
      return "—";
    }
    const tipo = llamada.tutor_id ? "Tutor" : "Contacto de emergencia";
    return `${nombreCompleto(persona)} (${tipo})`;
  };

  return (
    <Box sx={{ p: 2 }}>
      <Seccion titulo="Datos del caso">
        <Dato etiqueta="Infante">
          {nombreCompleto(caso.infante)} · {caso.infante.matricula}
        </Dato>
        <Dato etiqueta="Fecha de nacimiento">
          {fechaLegible(caso.infante.fecha_nacimiento)}
        </Dato>
        <Dato etiqueta="Falta">
          {fechaLegible(caso.asistencia.fecha)} ·{" "}
          {TURNOS[caso.asistencia.turno] ?? caso.asistencia.turno} ·{" "}
          {caso.asistencia.estado_nombre}
        </Dato>
        <Dato etiqueta="Estado del caso">
          {ESTADOS_CASO[caso.estado] ?? caso.estado}
        </Dato>
        {caso.cerrado_en && (
          <Dato etiqueta="Cerrado el">{fechaHora(caso.cerrado_en)}</Dato>
        )}
      </Seccion>

      <Seccion titulo="Tutores">
        {tutores.length == 0 ? (
          <Typography variant="body2">
            El infante no tiene tutores vinculados.
          </Typography>
        ) : (
          <Table size="small" aria-label="Tutores del infante">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Parentesco</TableCell>
                <TableCell>Teléfono</TableCell>
                <TableCell>Correo</TableCell>
                <TableCell>Puede recoger</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tutores.map((tutor) => (
                <TableRow key={tutor.id}>
                  <TableCell>{nombreCompleto(tutor)}</TableCell>
                  <TableCell>
                    {PARENTESCOS[tutor.parentesco] ?? tutor.parentesco}
                  </TableCell>
                  <TableCell>
                    <Telefono numero={tutor.telefono} />
                  </TableCell>
                  <TableCell>{tutor.correo || "—"}</TableCell>
                  <TableCell>
                    {tutor.autorizado_recoger ? "Sí" : "No"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      <Seccion titulo="Contactos de emergencia">
        {contactos.length == 0 ? (
          <Typography variant="body2">
            El infante no tiene contactos de emergencia.
          </Typography>
        ) : (
          <Table
            size="small"
            aria-label="Contactos de emergencia, por prioridad"
          >
            <TableHead>
              <TableRow>
                <TableCell>Prioridad</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Parentesco</TableCell>
                <TableCell>Teléfono</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contactos.map((contacto) => (
                <TableRow key={contacto.id}>
                  <TableCell>{contacto.prioridad}</TableCell>
                  <TableCell>{contacto.nombre}</TableCell>
                  <TableCell>
                    {PARENTESCOS[contacto.parentesco] ?? contacto.parentesco}
                  </TableCell>
                  <TableCell>
                    <Telefono numero={contacto.telefono} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      <Seccion titulo="Llamadas">
        {llamadas.length == 0 ? (
          <Typography variant="body2">
            Aún no hay llamadas registradas.
          </Typography>
        ) : (
          <Table size="small" aria-label="Llamadas realizadas">
            <TableHead>
              <TableRow>
                <TableCell>Intento</TableCell>
                <TableCell>Fecha y hora</TableCell>
                <TableCell>A quién</TableCell>
                <TableCell>Resultado</TableCell>
                <TableCell>Notas</TableCell>
                <TableCell>Registró</TableCell>
                <TableCell>Siguiente intento</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {llamadas.map((llamada) => (
                <TableRow key={llamada.id}>
                  <TableCell>{llamada.intento}</TableCell>
                  <TableCell>{fechaHora(llamada.realizada_en)}</TableCell>
                  <TableCell>{destinatario(llamada)}</TableCell>
                  <TableCell>
                    {RESULTADOS[llamada.resultado] ?? llamada.resultado}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "pre-wrap" }}>
                    {llamada.notas || "—"}
                  </TableCell>
                  <TableCell>{llamada.realizada_por_nombre}</TableCell>
                  <TableCell>
                    {fechaHora(llamada.siguiente_intento_en)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Seccion>

      <Seccion titulo="Clasificación">
        {caso.causa ? (
          <>
            <Dato etiqueta="Causa">{caso.causa.nombre}</Dato>
            <Dato etiqueta="Detalle">{caso.causa.detalle || "—"}</Dato>
            <Dato etiqueta="Fecha probable de retorno">
              {fechaLegible(caso.fecha_probable_retorno)}
            </Dato>
            <Dato etiqueta="Requiere alta médica">
              {caso.causa.requiere_alta ? "Sí" : "No"}
            </Dato>
            <Alert severity="info" sx={{ mt: 1 }}>
              <strong>Asesoría:</strong> {caso.causa.asesoria}
            </Alert>
          </>
        ) : (
          <Typography variant="body2">Aún no se clasifica la causa.</Typography>
        )}
      </Seccion>

      <Seccion titulo="Alta médica">
        {caso.alta ? (
          <>
            <Dato etiqueta="Folio del justificante">
              {caso.alta.folio_justificante}
            </Dato>
            <Dato etiqueta="Emitida el">{fechaHora(caso.alta.emitida_en)}</Dato>
            <Dato etiqueta="Emitida por">{caso.alta.emitida_por_nombre}</Dato>
            <Dato etiqueta="Observaciones">
              {caso.alta.observaciones || "—"}
            </Dato>
          </>
        ) : caso.causa?.requiere_alta ? (
          <Alert severity="warning">
            Sin alta médica. Esta causa requiere alta para cerrar el caso y para
            que el infante vuelva a ingresar.
          </Alert>
        ) : (
          <Typography variant="body2">Sin alta médica.</Typography>
        )}
      </Seccion>
    </Box>
  );
};

// [IA] Generado con Claude (prompt #21 en docs/ia/prompts.md). Revisado por: pendiente
// Detalle de un seguimiento (issue 21): datos, tutores, contactos, llamadas, clasificación y alta.
// Solo consulta; los formularios de llamada, clasificación y alta llegan con los issues 22, 23 y 24.
export const Seguimiento = () => (
  <Show
    title="Seguimiento"
    actions={
      <TopToolbar>
        <ListButton label="Volver a la bandeja" />
      </TopToolbar>
    }
  >
    <DetalleSeguimiento />
  </Show>
);
