const express=require("express");
const {db, responderError}=require("../db");
const {log, permitir}=require("../seguridad");
const {descifrar}=require("../cifrado");

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

module.exports=router;
