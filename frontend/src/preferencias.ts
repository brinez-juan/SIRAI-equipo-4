// Preferencias de accesibilidad (pantalla X-01). Se guardan en este navegador, no en la cuenta,
// y solo cambian la presentación: no tocan permisos ni datos. Lo que se lee de localStorage
// nunca se usa sin validar contra los valores permitidos; si algo falla, valor por defecto.

export const ESCALAS = [100, 125, 150, 200] as const;

export interface Preferencias {
  escala: (typeof ESCALAS)[number]; // tamaño del texto en %
  contraste: "normal" | "alto";
  focoReforzado: boolean;
  reducirAnimaciones: boolean;
}

export const POR_DEFECTO: Preferencias = {
  escala: 100,
  contraste: "normal",
  focoReforzado: false,
  reducirAnimaciones: false,
};

const LLAVE = "sirai.preferencias";

// Deja solo valores permitidos, venga del navegador o del formulario.
const validar = (datos: Record<string, unknown>): Preferencias => ({
  escala:
    ESCALAS.find((escala) => escala === Number(datos.escala)) ??
    POR_DEFECTO.escala,
  contraste: datos.contraste == "alto" ? "alto" : "normal",
  focoReforzado: datos.focoReforzado === true,
  reducirAnimaciones: datos.reducirAnimaciones === true,
});

// Se llama una vez al cargar la app (App.tsx).
export const leerPreferencias = (): Preferencias => {
  try {
    const datos = JSON.parse(localStorage.getItem(LLAVE) ?? "null");
    return typeof datos == "object" && datos !== null
      ? validar(datos)
      : POR_DEFECTO;
  } catch {
    return POR_DEFECTO; // almacenamiento bloqueado o JSON dañado
  }
};

// Valida y guarda. Lanza error si el navegador bloquea el almacenamiento: quien la llame avisa.
export const guardarPreferencias = (
  datos: Record<string, unknown>,
): Preferencias => {
  const preferencias = validar(datos);
  localStorage.setItem(LLAVE, JSON.stringify(preferencias));
  return preferencias;
};
