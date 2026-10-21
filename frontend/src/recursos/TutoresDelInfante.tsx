import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import {
  AutocompleteInput,
  BooleanInput,
  Button,
  Datagrid,
  Form,
  FunctionField,
  ListContextProvider,
  ReferenceInput,
  SaveButton,
  SelectField,
  SelectInput,
  required,
  useDataProvider,
  useList,
  useNotify,
  useRecordContext,
  type RaRecord,
} from "react-admin";
import type { dataProvider } from "../dataProvider";

// Mismo orden que el ENUM de infante_tutor.parentesco
const PARENTESCOS = [
  { id: "MADRE", name: "Madre" },
  { id: "PADRE", name: "Padre" },
  { id: "ABUELO_A", name: "Abuelo(a)" },
  { id: "TIO_A", name: "Tío(a)" },
  { id: "HERMANO_A", name: "Hermano(a)" },
  { id: "TUTOR_LEGAL", name: "Tutor legal" },
  { id: "OTRO", name: "Otro" },
];

const nombreTutor = (tutor: RaRecord) =>
  [tutor.nombre, tutor.primer_apellido, tutor.segundo_apellido]
    .filter(Boolean)
    .join(" ");

// [IA] Generado con Claude (prompt #11 en docs/ia/prompts.md). Revisado por: pendiente
// Quita el vÃ­nculo del tutor de la fila (borrado lÃ³gico en el backend) y avisa para recargar la tabla.
const BotonQuitar = ({
  infanteId,
  alQuitar,
}: {
  infanteId: RaRecord["id"];
  alQuitar: () => void;
}) => {
  const tutor = useRecordContext();
  const api = useDataProvider<typeof dataProvider>();
  const notify = useNotify();
  const [enviando, setEnviando] = useState(false);
  if (!tutor) return null;
  return (
    <Button
      label="Quitar"
      color="error"
      disabled={enviando}
      onClick={() => {
        setEnviando(true);
        api
          .desvincularTutor(infanteId, tutor.id)
          .then(() => {
            notify("Tutor quitado del infante");
            alQuitar();
          })
          .catch((error: Error) => notify(error.message, { type: "error" }))
          .finally(() => setEnviando(false));
      }}
    />
  );
};

// [IA] Generado con Claude (prompt #11 en docs/ia/prompts.md). Revisado por: pendiente
// SecciÃ³n de la ficha del infante: tabla de sus tutores y formulario para vincular uno
// (tutor, parentesco y si puede recoger). Solo se monta en la ediciÃ³n, que abre DIRECTORA.
export const TutoresDelInfante = () => {
  const infante = useRecordContext();
  const api = useDataProvider<typeof dataProvider>();
  const notify = useNotify();
  const [tutores, setTutores] = useState<RaRecord[]>([]);
  const [cargando, setCargando] = useState(true);
  // Cambia despuÃ©s de agregar o quitar: recarga la tabla y limpia el formulario
  const [version, setVersion] = useState(0);
  const recargar = () => setVersion((v) => v + 1);

  const infanteId = infante?.id;
  useEffect(() => {
    if (infanteId == null) return;
    setCargando(true);
    api
      .tutoresDeInfante(infanteId)
      .then(setTutores)
      .catch(() =>
        notify("No se pudieron cargar los tutores", { type: "error" }),
      )
      .finally(() => setCargando(false));
  }, [api, notify, infanteId, version]);

  const listContext = useList({ data: tutores, isPending: cargando });
  if (!infante) return null;

  const agregar = (datos: Record<string, unknown>) =>
    api
      .vincularTutor(infante.id, {
        tutor_id: datos.tutor_id as string,
        parentesco: datos.parentesco as string,
        autorizado_recoger: datos.autorizado_recoger === true,
      })
      .then(() => {
        notify("Tutor agregado al infante");
        recargar();
      })
      .catch((error: Error) => notify(error.message, { type: "error" }));

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        Tutores
      </Typography>
      <ListContextProvider value={listContext}>
        <Datagrid
          bulkActionButtons={false}
          rowClick={false}
          empty={<Typography>Sin tutores vinculados.</Typography>}
        >
          <FunctionField label="Nombre" render={nombreTutor} />
          <SelectField
            source="parentesco"
            label="Parentesco"
            choices={PARENTESCOS}
          />
          <FunctionField
            label="Puede recoger"
            render={(tutor: RaRecord) =>
              tutor.autorizado_recoger ? "SÃ­" : "No"
            }
          />
          <BotonQuitar infanteId={infante.id} alQuitar={recargar} />
        </Datagrid>
      </ListContextProvider>

      <Typography variant="subtitle1" component="h3" sx={{ mt: 3 }}>
        Agregar tutor
      </Typography>
      {/* record vacÃ­o: si no, el formulario tomarÃ­a los datos del infante */}
      <Form key={version} record={{}} onSubmit={agregar}>
        <ReferenceInput source="tutor_id" reference="Tutores">
          <AutocompleteInput
            label="Tutor"
            optionText={nombreTutor}
            filterToQuery={(texto) => ({ q: texto })}
            validate={required()}
          />
        </ReferenceInput>
        <SelectInput
          source="parentesco"
          label="Parentesco"
          choices={PARENTESCOS}
          validate={required()}
        />
        <BooleanInput
          source="autorizado_recoger"
          label="Puede recoger al infante"
          defaultValue={false}
        />
        <SaveButton label="Agregar" />
      </Form>
    </Box>
  );
};
