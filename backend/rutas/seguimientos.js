const express=require("express");
const {db, responderError}=require("../db");
const {log, permitir}=require("../seguridad");
const {cifrar, descifrar}=require("../cifrado");

const router=express.Router();

// [IA] Generado con Claude (prompt #20 en docs/ia/prompts.md). Revisado por: pendiente
// Tabla 2.5 del plan: TRABAJO_SOCIAL, MEDICO y DIRECTORA llevan los seguimientos; DOCENTE no ve notas ni
// seguimientos. El token debe traer estancia: la estancia nunca sale del request.
const acceso=[
	permitir("TRABAJO_SOCIAL", "MEDICO", "DIRECTORA"),
	(req, res, next)=>req.usuario.estancia_id==null?res.sendStatus(403):next()
];

// El seguimiento no guarda infante ni estancia: los dos salen de su asistencia.
const DESDE=" FROM seguimientos s JOIN asistencias a ON a.id=s.asistencia_id JOIN infantes i ON i.id=a.infante_id"
	+" JOIN estados_asistencia e ON e.codigo=a.estado_codigo";
// Reintento agendado por la llamada más reciente (issue 22). NULL si no hay llamadas o si no hace falta reintentar.
const SIGUIENTE_INTENTO="(SELECT l.siguiente_intento_en FROM llamadas l WHERE l.seguimiento_id=s.id AND l.deleted_at IS NULL ORDER BY l.intento DESC LIMIT 1)";

// [IA] Generado con Claude (prompt #20 en docs/ia/prompts.md). Revisado por: pendiente
// Bandeja: casos no cerrados de mi estancia. Primero los que tienen el reintento vencido (el más atrasado arriba),
// luego los que tienen un reintento agendado y al final el resto, de la falta más antigua a la más reciente.
// "Ahora" se pasa desde Node porque las fechas se guardan en UTC y el NOW() de MySQL usa la zona del servidor.
// Paginado como lo pide react-admin (?_start=&_end=), con el total en X-Total-Count.
router.get("/seguimientos", acceso, async (req, res)=>{
	try{
		let ahora=new Date();
		let where=" WHERE a.estancia_id=? AND s.estado<>'CERRADO' AND s.deleted_at IS NULL AND a.deleted_at IS NULL AND i.deleted_at IS NULL";
		let inicio=Number(req.query._start)||0;
		let fin=Number(req.query._end)||inicio+25;
		let [[{total}]]=await db.query("SELECT COUNT(*) AS total"+DESDE+where, [req.usuario.estancia_id]);
		let [filas]=await db.query(
			"SELECT * FROM (SELECT s.id, s.estado, s.causa_codigo, DATE_FORMAT(s.fecha_probable_retorno, '%Y-%m-%d') AS fecha_probable_retorno,"+
			" s.created_at, DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, a.turno, a.estado_codigo, e.nombre AS estado_nombre,"+
			" i.id AS infante_id, i.matricula, i.nombre, i.primer_apellido, i.segundo_apellido, "+SIGUIENTE_INTENTO+" AS siguiente_intento_en"+
			DESDE+where+") b"+
			" ORDER BY (b.siguiente_intento_en IS NOT NULL AND b.siguiente_intento_en<=?) DESC, b.siguiente_intento_en IS NULL,"+
			" b.siguiente_intento_en ASC, b.fecha ASC, b.primer_apellido ASC, b.id ASC LIMIT ? OFFSET ?",
			[req.usuario.estancia_id, ahora, Math.max(fin-inicio, 0), inicio]
		);
		res.set("Access-Control-Expose-Headers", "X-Total-Count");
		res.set("X-Total-Count", total);
		res.json(filas.map(fila=>({...fila, reintento_vencido: fila.siguiente_intento_en!=null && fila.siguiente_intento_en<=ahora})));
	}catch(error){
		responderError(res, error);
	}
});

// [IA] Generado con Claude (prompt #20 en docs/ia/prompts.md). Revisado por: pendiente
// Detalle de un seguimiento de mi estancia (si es de otra, 404 como si no existiera): infante, tutores y contactos
// con su teléfono descifrado, llamadas con sus notas descifradas, causa con su asesoría y alta médica si existe.
// Los campos descifrados salen sin el sufijo _cifrado. Como expone datos confidenciales, cada consulta exitosa
// queda en audit_log con accion = READ_CONFIDENCIAL (además del registro general de la petición).
router.get("/seguimientos/:id", acceso, async (req, res)=>{
	try{
		let [seguimientos]=await db.query(
			"SELECT s.id, s.estado, s.causa_codigo, s.detalle_causa_cifrado, DATE_FORMAT(s.fecha_probable_retorno, '%Y-%m-%d') AS fecha_probable_retorno,"+
			" s.cerrado_en, s.cerrado_por, s.created_at, s.updated_at, a.id AS asistencia_id, DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, a.turno,"+
			" a.estado_codigo, e.nombre AS estado_nombre, i.id AS infante_id, i.matricula, i.nombre, i.primer_apellido, i.segundo_apellido,"+
			" DATE_FORMAT(i.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento"+
			DESDE+" WHERE s.id=? AND a.estancia_id=? AND s.deleted_at IS NULL AND a.deleted_at IS NULL",
			[req.params.id, req.usuario.estancia_id]
		);
		let fila=seguimientos[0];
		if(fila==null){
			return res.sendStatus(404);
		}
		let [tutores]=await db.query(
			"SELECT t.id, t.nombre, t.primer_apellido, t.segundo_apellido, t.telefono_cifrado, t.correo, it.parentesco, it.autorizado_recoger"+
			" FROM infante_tutor it JOIN tutores t ON t.id=it.tutor_id"+
			" WHERE it.infante_id=? AND it.deleted_at IS NULL AND t.deleted_at IS NULL ORDER BY t.primer_apellido, t.nombre",
			[fila.infante_id]
		);
		let [contactos]=await db.query(
			"SELECT id, nombre, parentesco, telefono_cifrado, prioridad FROM contactos_emergencia WHERE infante_id=? AND deleted_at IS NULL ORDER BY prioridad",
			[fila.infante_id]
		);
		let [llamadas]=await db.query(
			"SELECT l.id, l.intento, l.tutor_id, l.contacto_emergencia_id, l.realizada_en, l.realizada_por,"+
			" CONCAT_WS(' ', u.nombre, u.primer_apellido) AS realizada_por_nombre, l.resultado, l.notas_cifrado, l.siguiente_intento_en"+
			" FROM llamadas l JOIN usuarios u ON u.id=l.realizada_por WHERE l.seguimiento_id=? AND l.deleted_at IS NULL ORDER BY l.intento",
			[fila.id]
		);
		let causa=null;
		if(fila.causa_codigo!=null){
			let [causas]=await db.query(
				"SELECT codigo, nombre, asesoria, requiere_alta, justifica_falta, notifica_emergencia FROM causas_inasistencia WHERE codigo=?",
				[fila.causa_codigo]
			);
			causa={...causas[0], detalle: descifrar(fila.detalle_causa_cifrado)};
		}
		let [altas]=await db.query(
			"SELECT a.id, a.folio_justificante, a.emitida_en, a.emitida_por, CONCAT_WS(' ', u.nombre, u.primer_apellido) AS emitida_por_nombre,"+
			" a.observaciones_cifrado FROM altas_medicas a JOIN usuarios u ON u.id=a.emitida_por WHERE a.seguimiento_id=? AND a.deleted_at IS NULL",
			[fila.id]
		);
		let alta=altas.length?altas[0]:null;
		let detalle={
			id: fila.id,
			estado: fila.estado,
			fecha_probable_retorno: fila.fecha_probable_retorno,
			cerrado_en: fila.cerrado_en,
			cerrado_por: fila.cerrado_por,
			created_at: fila.created_at,
			updated_at: fila.updated_at,
			asistencia: {id: fila.asistencia_id, fecha: fila.fecha, turno: fila.turno, estado_codigo: fila.estado_codigo, estado_nombre: fila.estado_nombre},
			infante: {
				id: fila.infante_id, matricula: fila.matricula, nombre: fila.nombre, primer_apellido: fila.primer_apellido,
				segundo_apellido: fila.segundo_apellido, fecha_nacimiento: fila.fecha_nacimiento
			},
			tutores: tutores.map(({telefono_cifrado, ...tutor})=>({...tutor, telefono: descifrar(telefono_cifrado)})),
			contactos: contactos.map(({telefono_cifrado, ...contacto})=>({...contacto, telefono: descifrar(telefono_cifrado)})),
			llamadas: llamadas.map(({notas_cifrado, ...llamada})=>({...llamada, notas: descifrar(notas_cifrado)})),
			causa: causa,
			alta: alta==null?null:(({observaciones_cifrado, ...resto})=>({...resto, observaciones: descifrar(observaciones_cifrado)}))(alta)
		};
		// Solo los ids de lo que se vio: la bitácora no guarda los datos descifrados
		await log(req.usuario, "READ_CONFIDENCIAL", "seguimientos", fila.id, null, {
			infante_id: fila.infante_id,
			tutores: tutores.map(tutor=>tutor.id),
			contactos: contactos.map(contacto=>contacto.id),
			llamadas: llamadas.map(llamada=>llamada.id),
			alta: alta?.id??null
		}, req);
		res.json(detalle);
	}catch(error){
		responderError(res, error);
	}
});

// Estados desde los que se puede clasificar. Un caso CLASIFICADO se puede volver a clasificar (corregir la causa);
// uno CERRADO ya no se toca.
const CLASIFICABLES=["ABIERTO", "EN_CONTACTO", "CLASIFICADO"];
const MAX_DETALLE=2000;

// [IA] Generado con Claude (prompt #23 en docs/ia/prompts.md). Revisado por: pendiente
// Fecha AAAA-MM-DD que exista en el calendario.
function esFecha(texto){
	return typeof texto=="string" && /^\d{4}-\d{2}-\d{2}$/.test(texto) && new Date(texto+"T00:00:00Z").toISOString().slice(0, 10)==texto;
}

// [IA] Generado con Claude (prompt #23 en docs/ia/prompts.md). Revisado por: pendiente
// Revisa el body de clasificar. detalle y fecha_probable_retorno son opcionales (null o vacío = sin dato).
// Exigir texto evita que un objeto o arreglo llegue a la consulta SQL.
function validarClasificacion(cuerpo){
	if(typeof cuerpo.causa_codigo!="string" || cuerpo.causa_codigo==""){
		return "Falta la causa.";
	}
	if(cuerpo.detalle!=null && (typeof cuerpo.detalle!="string" || cuerpo.detalle.length>MAX_DETALLE)){
		return "El detalle debe ser un texto de hasta "+MAX_DETALLE+" caracteres.";
	}
	if(cuerpo.fecha_probable_retorno!=null && !esFecha(cuerpo.fecha_probable_retorno)){
		return "La fecha probable de retorno debe tener el formato AAAA-MM-DD.";
	}
	return null;
}

// [IA] Generado con Claude (prompt #23 en docs/ia/prompts.md). Revisado por: pendiente
// Clasifica la causa de la inasistencia y pasa el caso a CLASIFICADO. PUT reemplaza la clasificación completa:
// lo que no venga (detalle, fecha) queda en NULL. El detalle es confidencial: se guarda cifrado y en la bitácora
// solo entra cifrado, con el antes y el después. Es un solo UPDATE condicionado al estado, así que si el caso se
// cerró mientras tanto no se sobrescribe (409). El seguimiento es de mi estancia (por su asistencia) o 404.
// Body: {causa_codigo, detalle, fecha_probable_retorno}.
router.put("/seguimientos/:id/clasificar", acceso, async (req, res)=>{
	try{
		let cuerpo=req.body??{};
		let invalido=validarClasificacion(cuerpo);
		if(invalido){
			return res.status(400).json({message: invalido});
		}
		let [filas]=await db.query(
			"SELECT s.id, s.estado, s.causa_codigo, s.detalle_causa_cifrado, DATE_FORMAT(s.fecha_probable_retorno, '%Y-%m-%d') AS fecha_probable_retorno,"+
			" DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha"+DESDE+
			" WHERE s.id=? AND a.estancia_id=? AND s.deleted_at IS NULL AND a.deleted_at IS NULL",
			[req.params.id, req.usuario.estancia_id]
		);
		let actual=filas[0];
		if(actual==null){
			return res.sendStatus(404);
		}
		if(!CLASIFICABLES.includes(actual.estado)){
			return res.status(409).json({message: "El caso ya no se puede clasificar."});
		}
		let [causas]=await db.query(
			"SELECT codigo, nombre, asesoria, requiere_alta, justifica_falta, notifica_emergencia FROM causas_inasistencia WHERE codigo=?",
			[cuerpo.causa_codigo]
		);
		if(causas.length==0){
			return res.status(400).json({message: "La causa no es válida."});
		}
		let retorno=cuerpo.fecha_probable_retorno??null;
		if(retorno!=null && retorno<actual.fecha){
			return res.status(400).json({message: "La fecha probable de retorno no puede ser anterior a la inasistencia."});
		}
		let detalle=typeof cuerpo.detalle=="string" && cuerpo.detalle.trim()!=""?cuerpo.detalle.trim():null;
		let [resultado]=await db.query(
			"UPDATE seguimientos SET estado='CLASIFICADO', causa_codigo=?, detalle_causa_cifrado=?, fecha_probable_retorno=?, updated_at=CURRENT_TIMESTAMP(3)"+
			" WHERE id=? AND estado IN (?) AND deleted_at IS NULL",
			[cuerpo.causa_codigo, cifrar(detalle), retorno, actual.id, CLASIFICABLES]
		);
		if(resultado.affectedRows==0){
			return res.status(409).json({message: "El caso ya no se puede clasificar."});
		}
		let [despuesFilas]=await db.query(
			"SELECT estado, causa_codigo, detalle_causa_cifrado, DATE_FORMAT(fecha_probable_retorno, '%Y-%m-%d') AS fecha_probable_retorno FROM seguimientos WHERE id=?",
			[actual.id]
		);
		let antes={estado: actual.estado, causa_codigo: actual.causa_codigo, detalle_causa_cifrado: actual.detalle_causa_cifrado, fecha_probable_retorno: actual.fecha_probable_retorno};
		await log(req.usuario, "UPDATE", "seguimientos", actual.id, antes, despuesFilas[0], req);
		res.json({
			id: actual.id,
			estado: despuesFilas[0].estado,
			fecha_probable_retorno: despuesFilas[0].fecha_probable_retorno,
			causa: {...causas[0], detalle: descifrar(despuesFilas[0].detalle_causa_cifrado)}
		});
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
