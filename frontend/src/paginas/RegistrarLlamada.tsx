import { useState } from "react";
import { Box, Typography } from "@mui/material";
import {
  Form,
  SaveButton,
  SelectInput,
  TextInput,
  maxLength,
  required,
  useDataProvider,
  useNotify,
  type Identifier,
} from "react-admin";
import type { dataProvider } from "../dataProvider";

// Mismo orden que el ENUM de llamadas.resultado
const RESULTADOS = [
  { id: "CONTACTO_EXITOSO", name: "Contacto exitoso" },
  { id: "SIN_RESPUESTA", name: "Sin respuesta (reintentar en 4 h)" },
  { id: "NUMERO_EQUIVOCADO", name: "Número equivocado" },
  { id: "BUZON", name: "Buzón de voz" },
];

const ZONA = "America/Mexico_City";

// Lo que el detalle del seguimiento (GET /seguimientos/:id, issue 20) trae de cada tutor y contacto
type Destinatario = {
  id: Identifier;
  nombre: string;
  primer_apellido?: string;
  segundo_apellido?: string | null;
  parentesco: string;
  telefono: string | null;
};

// Texto de la bandeja para un reintento agendado (siguiente_intento_en de GET /seguimientos):
// "Reintentar a las 13:40" si es hoy, o "Reintentar el 21/10 a las 13:40" si es otro día. En hora de México.
export const textoReintento = (siguienteIntento: string | null | undefined) => {
  if (!siguienteIntento) return null;
  const fecha = new Date(siguienteIntento);
  const dia = (valor: Date) =>
    valor.toLocaleDateString("es-MX", { timeZone: ZONA });
  const hora = fecha.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  });
  if (dia(fecha) == dia(new Date())) return `Reintentar a las ${hora}`;
  const diaMes = fecha.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    timeZone: ZONA,
  });
  return `Reintentar el ${diaMes} a las ${hora}`;
};

const nombreCompleto = (persona: Destinatario) =>
  [persona.nombre, persona.primer_apellido, persona.segundo_apellido]
    .filter(Boolean)
    .join(" ");

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Formulario para registrar una llamada, pensado para la sección "Llamadas" de Seguimiento.tsx (issue 21).
// Recibe los tutores y contactos que ya trae el detalle del seguimiento, con su teléfono, para elegir a quién
// se llamó. Un solo selector para los dos: el valor lleva el tipo ("tutor:" o "contacto:") y aquí se separa.
// alRegistrar se llama con la llamada creada, para que la página recargue el detalle.
export const RegistrarLlamada = ({
  seguimientoId,
  tutores,
  contactos,
  alRegistrar,
}: {
  seguimientoId: Identifier;
  tutores: Destinatario[];
  contactos: Destinatario[];
  alRegistrar?: () => void;
}) => {
  const api = useDataProvider<typeof dataProvider>();
  const notify = useNotify();
  // Cambia después de registrar: limpia el formulario
  const [version, setVersion] = useState(0);

  const destinatarios = [
    ...tutores.map((tutor) => ({
      id: `tutor:${tutor.id}`,
      name: `Tutor · ${nombreCompleto(tutor)} (${tutor.parentesco}) · ${tutor.telefono ?? "sin teléfono"}`,
    })),
    ...contactos.map((contacto) => ({
      id: `contacto:${contacto.id}`,
      name: `Contacto de emergencia · ${contacto.nombre} (${contacto.parentesco}) · ${contacto.telefono ?? "sin teléfono"}`,
    })),
  ];

  const registrar = (datos: Record<string, unknown>) => {
    const valor = String(datos.destinatario);
    const tipo = valor.slice(0, valor.indexOf(":"));
    const id = valor.slice(valor.indexOf(":") + 1);
    return api
      .registrarLlamada(seguimientoId, {
        ...(tipo == "tutor"
          ? { tutor_id: id }
          : { contacto_emergencia_id: id }),
        resultado: datos.resultado as string,
        notas: (datos.notas as string | undefined) || undefined,
      })
      .then((llamada) => {
        notify(
          textoReintento(llamada.siguiente_intento_en) ?? "Llamada registrada",
        );
        setVersion((v) => v + 1);
        alRegistrar?.();
      })
      .catch((error: Error) => notify(error.message, { type: "error" }));
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" component="h3">
        Registrar llamada
      </Typography>
      {/* record vacío: si no, el formulario tomaría los datos del seguimiento */}
      <Form key={version} record={{}} onSubmit={registrar}>
        <SelectInput
          source="destinatario"
          label="¿A quién se llamó?"
          choices={destinatarios}
          validate={required()}
          fullWidth
        />
        <SelectInput
          source="resultado"
          label="Resultado"
          choices={RESULTADOS}
          validate={required()}
        />
        <TextInput
          source="notas"
          label="Notas"
          helperText="Se guardan cifradas"
          multiline
          minRows={2}
          validate={maxLength(2000)}
          fullWidth
        />
        <SaveButton label="Registrar llamada" />
      </Form>
    </Box>
  );
};
