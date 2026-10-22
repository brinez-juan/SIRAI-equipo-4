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
import {
  Button,
  ListButton,
  Show,
  TopToolbar,
  useRecordContext,
  useRefresh,
} from "react-admin";
import { Link as RouterLink } from "react-router-dom";
import DescriptionIcon from "@mui/icons-material/Description";
import {
  ESTADOS_CASO,
  TURNOS,
  fechaHora,
  fechaLegible,
  nombreCompleto,
} from "./Bandeja";
import { RegistrarLlamada } from "./RegistrarLlamada";
import { ClasificarSeguimiento } from "./ClasificarSeguimiento";
import { AltaYCierre } from "./AltaYCierre";

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
export const RESULTADOS: Record<string, string> = {
  CONTACTO_EXITOSO: "Contacto exitoso",
  SIN_RESPUESTA: "Sin respuesta",
  NUMERO_EQUIVOCADO: "Número equivocado",
  BUZON: "Buzón de voz",
};

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
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

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
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

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// El teléfono como enlace tel:, para marcar directo desde un teléfono o softphone.
const Telefono = ({ numero }: { numero: string | null }) =>
  numero ? (
    <Link href={`tel:${numero.replace(/[^0-9+]/g, "")}`}>{numero}</Link>
  ) : (
    <>—</>
  );

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Contenido del detalle. El backend ya descifró teléfonos, notas, detalle de la causa y observaciones
// del alta, y registró la consulta en audit_log como READ_CONFIDENCIAL.
// Modificado con el prompt #44: los formularios de llamada, clasificación y alta/cierre (issues 22, 23 y 24)
// van en sus secciones y, al guardar, refresh() vuelve a pedir el detalle. Un caso cerrado solo se consulta.
// Si la falta es justificada no aparece la clasificación: la causa ya viene del pase de lista.
const DetalleSeguimiento = () => {
  const caso = useRecordContext();
  const refresh = useRefresh();
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
  const cerrado = caso.estado == "CERRADO";
  // Falta justificada: la causa y su detalle vienen del pase de lista (backend/cierreTurno.js ya clasificó el caso),
  // así que no se muestra la clasificación; las llamadas y el alta/cierre sí.
  const justificada = caso.asistencia.justificacion != null;

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
        {/* Feature 42 (prompt #42): por qué se justificó, según lo capturado en el pase de lista */}
        {caso.asistencia.justificacion && (
          <Dato etiqueta="Justificación del pase de lista">
            {caso.asistencia.justificacion.causa_nombre}
            {caso.asistencia.justificacion.nota &&
              ` · ${caso.asistencia.justificacion.nota}`}
          </Dato>
        )}
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
        {!cerrado && (
          <RegistrarLlamada
            seguimientoId={caso.id}
            tutores={tutores}
            contactos={contactos}
            alRegistrar={refresh}
          />
        )}
      </Seccion>

      {/* Abierto: el formulario ya trae la clasificación guardada y su asesoría. Cerrado: solo el resumen */}
      {justificada ? null : !cerrado ? (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <ClasificarSeguimiento
            seguimiento={
              caso as Parameters<typeof ClasificarSeguimiento>[0]["seguimiento"]
            }
            alClasificar={refresh}
          />
        </Card>
      ) : (
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
            <Typography variant="body2">
              Aún no se clasifica la causa.
            </Typography>
          )}
        </Seccion>
      )}

      {/* Alta médica (solo MEDICO y DIRECTORA la emiten) y cierre del caso; abierto o cerrado, AltaYCierre muestra lo que hay */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <AltaYCierre
          seguimiento={caso as Parameters<typeof AltaYCierre>[0]["seguimiento"]}
          alActualizar={refresh}
        />
      </Card>
    </Box>
  );
};

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Abre el expediente imprimible del infante de este caso (issue 25). No aparece mientras llega el detalle.
const BotonExpediente = () => {
  const caso = useRecordContext();
  if (!caso?.infante) {
    return null;
  }
  return (
    <Button
      component={RouterLink}
      to={`/expediente/${caso.infante.id}`}
      label="Ver expediente"
    >
      <DescriptionIcon />
    </Button>
  );
};

// [IA+Humano] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Detalle de un seguimiento (issue 21): datos, tutores, contactos, llamadas, clasificación, alta y cierre,
// con los formularios de los issues 22, 23 y 24 mientras el caso no esté cerrado.
export const Seguimiento = () => (
  <Show
    title="Seguimiento"
    actions={
      <TopToolbar>
        <BotonExpediente />
        <ListButton label="Volver a la bandeja" />
      </TopToolbar>
    }
  >
    <DetalleSeguimiento />
  </Show>
);
