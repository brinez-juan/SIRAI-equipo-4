const express=require("express");
const {db, uuidv7, responderError}=require("../db");
const {log, permitir}=require("../seguridad");
const {cifrar, descifrar}=require("../cifrado");

const router=express.Router();
const TURNOS=["MATUTINO", "VESPERTINO"];
const CERRADO="El pase de lista ya se cerró.";
const REQUIERE_ALTA="Requiere alta para ingresar.";
const COLUMNAS="id, estancia_id, infante_id, fecha, turno, estado_codigo, justificacion_causa_codigo, justificacion_cifrado,"+
	" hora_entrada, hora_salida, capturado_en, created_by, created_at, updated_at";
// Feature 42: el estado que pide motivo, el tope de la nota y quién puede leerla (DOCENTE la escribe pero no la lee,
// igual que no ve el detalle de los seguimientos en la tabla 2.5).
const JUSTIFICADO="AUSENTE_JUSTIFICADO";
const MAX_NOTA=500;
const LEEN_NOTA=["DIRECTORA", "TRABAJO_SOCIAL", "MEDICO"];
// Motivos con los que se puede justificar: las causas del catálogo menos "Sin respuesta" (NO_LOC, la única que
// notifica a emergencia), que es justo cuando nadie avisó.
const MOTIVOS="SELECT codigo, nombre FROM causas_inasistencia WHERE notifica_emergencia=0 ORDER BY nombre";


// Tabla 2.5 del plan: DOCENTE y DIRECTORA pasan lista; TRABAJO_SOCIAL y MEDICO solo consultan.
// El token debe traer estancia: la estancia nunca sale del request.
const conEstancia=(req, res, next)=>req.usuario.estancia_id==null?res.sendStatus(403):next();
const lectura=[permitir("DOCENTE", "DIRECTORA", "TRABAJO_SOCIAL", "MEDICO"), conEstancia];
const escritura=[permitir("DOCENTE", "DIRECTORA"), conEstancia];

// Revisa fecha (AAAA-MM-DD y que exista en el calendario) y turno. Devuelve un mensaje o null.
function validarDia(fecha, turno){
	if(typeof fecha!="string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || new Date(fecha+"T00:00:00Z").toISOString().slice(0, 10)!=fecha){
		return "La fecha debe tener el formato AAAA-MM-DD.";
	}
	if(!TURNOS.includes(turno)){
		return "El turno debe ser MATUTINO o VESPERTINO.";
	}
	return null;
}

// La asistencia solo puede usar un turno que la estancia opere (fk_asistencia_turno).
async function operaTurno(conexion, estanciaId, turno){
	let [filas]=await conexion.query("SELECT 1 FROM estancia_turnos WHERE estancia_id=? AND turno=? AND deleted_at IS NULL", [estanciaId, turno]);
	return filas.length>0;
}

// FOR SHARE: dentro de una transacción bloquea la llave (estancia, fecha, turno) del cierre, así el cierre
// (issue 17) espera a que termine este registro y no se cuela una asistencia después de cerrar.
async function estaCerrado(conexion, estanciaId, fecha, turno, bloquear){
	let [filas]=await conexion.query(
		"SELECT 1 FROM cierres_pase_lista WHERE estancia_id=? AND fecha=? AND turno=? AND deleted_at IS NULL"+(bloquear?" FOR SHARE":""),
		[estanciaId, fecha, turno]
	);
	return filas.length>0;
}

async function buscarAsistencia(conexion, estanciaId, infanteId, fecha, turno){
	let [filas]=await conexion.query(
		"SELECT "+COLUMNAS+" FROM asistencias WHERE estancia_id=? AND infante_id=? AND fecha=? AND turno=? AND deleted_at IS NULL",
		[estanciaId, infanteId, fecha, turno]
	);
	return filas[0];
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Candado de reingreso (issue 24): de los infantes dados, los que tienen un seguimiento sin cerrar cuya causa
// tiene requiere_alta = 1 y que todavía no tiene alta médica. Solo cuentan las inasistencias hasta la fecha que se
// captura: una falta posterior no bloquea un día anterior. Devuelve un Set con sus ids.
async function requierenAlta(conexion, infanteIds, fecha){
	if(infanteIds.length==0){
		return new Set();
	}
	let [filas]=await conexion.query(
		"SELECT DISTINCT a.infante_id FROM seguimientos s JOIN asistencias a ON a.id=s.asistencia_id"+
		" JOIN causas_inasistencia c ON c.codigo=s.causa_codigo"+
		" WHERE a.infante_id IN (?) AND a.fecha<=? AND s.estado<>'CERRADO' AND c.requiere_alta=1 AND s.deleted_at IS NULL AND a.deleted_at IS NULL"+
		" AND NOT EXISTS (SELECT 1 FROM altas_medicas m WHERE m.seguimiento_id=s.id AND m.deleted_at IS NULL)",
		[infanteIds, fecha]
	);
	return new Set(filas.map(fila=>fila.infante_id));
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Justificación de una asistencia para la respuesta: {causa_codigo, causa_nombre, nota} o null si no tiene.
// La nota sale descifrada solo para LEEN_NOTA; a los demás roles ni siquiera les llega la llave "nota".
// nombres: {codigo: nombre} de los motivos.
function justificacionDe(fila, usuario, nombres){
	if(fila.justificacion_causa_codigo==null){
		return null;
	}
	let justificacion={causa_codigo: fila.justificacion_causa_codigo, causa_nombre: nombres[fila.justificacion_causa_codigo]??fila.justificacion_causa_codigo};
	if(LEEN_NOTA.includes(usuario.rol)){
		justificacion.nota=descifrar(fila.justificacion_cifrado);
	}
	return justificacion;
}

// {codigo: nombre} de los motivos con los que se puede justificar.
async function nombresDeMotivos(conexion){
	let [motivos]=await conexion.query(MOTIVOS);
	return Object.fromEntries(motivos.map(motivo=>[motivo.codigo, motivo.nombre]));
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Revisa body.justificacion al marcar AUSENTE_JUSTIFICADO: {causa_codigo (obligatorio, de MOTIVOS), nota (opcional,
// hasta MAX_NOTA)}. Exigir texto evita que un objeto llegue al SQL. Devuelve un mensaje o null.
function validarJustificacion(justificacion, nombres){
	if(justificacion==null || typeof justificacion!="object" || typeof justificacion.causa_codigo!="string" || !(justificacion.causa_codigo in nombres)){
		return "Elija el motivo de la inasistencia justificada.";
	}
	if(justificacion.nota!=null && (typeof justificacion.nota!="string" || justificacion.nota.length>MAX_NOTA)){
		return "La nota debe ser un texto de hasta "+MAX_NOTA+" caracteres.";
	}
	return null;
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Si la respuesta lleva notas descifradas, cada una queda en audit_log como READ_CONFIDENCIAL de su asistencia
// (la bitácora nunca guarda la nota en claro). historial.js usa esta misma función.
async function registrarLecturaDeNotas(req, asistenciaIds){
	if(!LEEN_NOTA.includes(req.usuario.rol)){
		return;
	}
	for(let id of asistenciaIds){
		await log(req.usuario, "READ_CONFIDENCIAL", "asistencias", id, null, {campo: "justificacion_cifrado"}, req);
	}
}

// Corre fn(conexion) en una transacción; si algo falla no se guarda nada.
async function enTransaccion(fn){
	let conexion=await db.getConnection();
	try{
		await conexion.beginTransaction();
		let resultado=await fn(conexion);
		await conexion.commit();
		return resultado;
	}catch(error){
		await conexion.rollback();
		throw error;
	}finally{
		conexion.release();
	}
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Infantes de mi estancia, cada uno con su asistencia de ese día y turno (o null), y si el turno ya se cerró.
// requiere_alta: el candado del issue 24 está activo y no se le puede marcar PRESENTE.
// Feature 42: cada asistencia trae su justificación (ver justificacionDe) y la respuesta trae motivos_justificacion,
// el catálogo para el diálogo (DOCENTE no puede leer GET /causas).
// GET /pase-lista?fecha=2026-10-20&turno=MATUTINO
router.get("/pase-lista", lectura, async (req, res)=>{
	try{
		let {fecha, turno}=req.query;
		let invalido=validarDia(fecha, turno);
		if(invalido){
			return res.status(400).json({message: invalido});
		}
		let estanciaId=req.usuario.estancia_id;
		if(!await operaTurno(db, estanciaId, turno)){
			return res.status(400).json({message: "La estancia no opera el turno "+turno+"."});
		}
		let [filas]=await db.query(
			"SELECT i.id, i.matricula, i.nombre, i.primer_apellido, i.segundo_apellido,"+
			" a.id AS asistencia_id, a.estado_codigo, a.justificacion_causa_codigo, a.justificacion_cifrado, a.hora_entrada, a.hora_salida, a.capturado_en"+
			" FROM infantes i LEFT JOIN asistencias a ON a.infante_id=i.id AND a.estancia_id=i.estancia_id AND a.fecha=? AND a.turno=? AND a.deleted_at IS NULL"+
			" WHERE i.estancia_id=? AND i.deleted_at IS NULL ORDER BY i.primer_apellido, i.segundo_apellido, i.nombre",
			[fecha, turno, estanciaId]
		);
		let bloqueados=await requierenAlta(db, filas.map(fila=>fila.id), fecha);
		let [motivos]=await db.query(MOTIVOS);
		let nombres=Object.fromEntries(motivos.map(motivo=>[motivo.codigo, motivo.nombre]));
		await registrarLecturaDeNotas(req, filas.filter(fila=>fila.justificacion_cifrado!=null).map(fila=>fila.asistencia_id));
		res.json({
			fecha: fecha,
			turno: turno,
			cerrado: await estaCerrado(db, estanciaId, fecha, turno, false),
			motivos_justificacion: motivos,
			infantes: filas.map(fila=>({
				id: fila.id,
				matricula: fila.matricula,
				nombre: fila.nombre,
				primer_apellido: fila.primer_apellido,
				segundo_apellido: fila.segundo_apellido,
				requiere_alta: bloqueados.has(fila.id),
				asistencia: fila.asistencia_id==null?null:{
					id: fila.asistencia_id,
					estado_codigo: fila.estado_codigo,
					justificacion: justificacionDe(fila, req.usuario, nombres),
					hora_entrada: fila.hora_entrada,
					hora_salida: fila.hora_salida,
					capturado_en: fila.capturado_en,
				},
			})),
		});
	}catch(error){
		responderError(res, error);
	}
});

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Registra o corrige la asistencia de un infante: upsert sobre uq_asistencia_dia (estancia, infante, fecha, turno).
// PRESENTE pone hora_entrada (si ya la tenía, se conserva la primera); cualquier otro estado la deja en NULL.
// Si el infante tiene el candado del issue 24, PRESENTE responde 409 "Requiere alta para ingresar."
// Las horas se toman de Node (new Date()) y no de NOW(): mysql2 las guarda en UTC sin importar la zona del servidor MySQL.
// created_by es quien capturó primero; quien corrige queda en audit_log.
// Feature 42: AUSENTE_JUSTIFICADO exige body.justificacion {causa_codigo, nota?}. La nota se guarda cifrada; si no se
// manda y la asistencia ya estaba justificada, se conserva la anterior (DOCENTE puede cambiar el motivo sin leerla).
// Con cualquier otro estado, motivo y nota quedan en NULL. La respuesta nunca trae la nota cifrada.
router.put("/pase-lista/:infanteId", escritura, async (req, res)=>{
	try{
		let cuerpo=req.body??{};
		let invalido=validarDia(cuerpo.fecha, cuerpo.turno);
		if(invalido){
			return res.status(400).json({message: invalido});
		}
		if(typeof cuerpo.estado_codigo!="string"){
			return res.status(400).json({message: "Falta estado_codigo."});
		}
		let [estados]=await db.query("SELECT codigo FROM estados_asistencia WHERE codigo=?", [cuerpo.estado_codigo]);
		if(estados.length==0){
			return res.status(400).json({message: "El estado de asistencia no es válido."});
		}
		let justificado=cuerpo.estado_codigo==JUSTIFICADO;
		let nombres=await nombresDeMotivos(db);
		if(justificado){
			let invalida=validarJustificacion(cuerpo.justificacion, nombres);
			if(invalida){
				return res.status(400).json({message: invalida});
			}
		}
		let nota=justificado && typeof cuerpo.justificacion.nota=="string" && cuerpo.justificacion.nota.trim()!=""?cuerpo.justificacion.nota.trim():null;
		let estanciaId=req.usuario.estancia_id;
		let [infantes]=await db.query("SELECT id FROM infantes WHERE id=? AND estancia_id=? AND deleted_at IS NULL", [req.params.infanteId, estanciaId]);
		if(infantes.length==0){
			return res.sendStatus(404);
		}
		if(!await operaTurno(db, estanciaId, cuerpo.turno)){
			return res.status(400).json({message: "La estancia no opera el turno "+cuerpo.turno+"."});
		}
		let ahora=new Date();
		let resultado=await enTransaccion(async conexion=>{
			if(await estaCerrado(conexion, estanciaId, cuerpo.fecha, cuerpo.turno, true)){
				return {mensaje: CERRADO};
			}
			if(cuerpo.estado_codigo=="PRESENTE" && (await requierenAlta(conexion, [req.params.infanteId], cuerpo.fecha)).size>0){
				return {mensaje: REQUIERE_ALTA};
			}
			let antes=await buscarAsistencia(conexion, estanciaId, req.params.infanteId, cuerpo.fecha, cuerpo.turno);
			// Nota que queda: la nueva, o la que ya tenía si seguía justificada y no mandaron otra
			let notaCifrada=!justificado?null:nota!=null?cifrar(nota):antes?.estado_codigo==JUSTIFICADO?antes.justificacion_cifrado:null;
			await conexion.query(
				"INSERT INTO asistencias (id, estancia_id, infante_id, fecha, turno, estado_codigo, justificacion_causa_codigo, justificacion_cifrado,"+
				" hora_entrada, capturado_en, created_by)"+
				" VALUES (?,?,?,?,?,?,?,?,?,?,?) AS nuevo"+
				" ON DUPLICATE KEY UPDATE estado_codigo=nuevo.estado_codigo,"+
				" justificacion_causa_codigo=nuevo.justificacion_causa_codigo, justificacion_cifrado=nuevo.justificacion_cifrado,"+
				" hora_entrada=IF(nuevo.estado_codigo='PRESENTE', COALESCE(asistencias.hora_entrada, nuevo.hora_entrada), NULL),"+
				" capturado_en=nuevo.capturado_en, updated_at=CURRENT_TIMESTAMP(3)",
				[uuidv7(), estanciaId, req.params.infanteId, cuerpo.fecha, cuerpo.turno, cuerpo.estado_codigo,
				justificado?cuerpo.justificacion.causa_codigo:null, notaCifrada,
				cuerpo.estado_codigo=="PRESENTE"?ahora:null, ahora, req.usuario.usuario]
			);
			let despues=await buscarAsistencia(conexion, estanciaId, req.params.infanteId, cuerpo.fecha, cuerpo.turno);
			return {antes, despues};
		});
		if(resultado.mensaje){
			return res.status(409).json({message: resultado.mensaje});
		}
		// La bitácora guarda la fila tal cual (nota cifrada); la respuesta lleva la justificación ya armada
		await log(req.usuario, resultado.antes==null?"CREATE":"UPDATE", "asistencias", resultado.despues.id, resultado.antes??null, resultado.despues, req);
		let {justificacion_causa_codigo, justificacion_cifrado, ...asistencia}=resultado.despues;
		res.json({...asistencia, justificacion: justificacionDe({justificacion_causa_codigo, justificacion_cifrado}, req.usuario, nombres)});
	}catch(error){
		responderError(res, error);
	}
});

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Marca PRESENTE a todos los infantes de mi estancia que aún no tienen registro ese día y turno;
// los que ya tienen uno (cualquier estado) no se tocan, y los que tienen el candado del issue 24 se saltan.
// Body: {fecha, turno}. Responde {marcados, requieren_alta} (cuántos se saltaron por el candado).
router.post("/pase-lista/todos-presentes", escritura, async (req, res)=>{
	try{
		let cuerpo=req.body??{};
		let invalido=validarDia(cuerpo.fecha, cuerpo.turno);
		if(invalido){
			return res.status(400).json({message: invalido});
		}
		let estanciaId=req.usuario.estancia_id;
		if(!await operaTurno(db, estanciaId, cuerpo.turno)){
			return res.status(400).json({message: "La estancia no opera el turno "+cuerpo.turno+"."});
		}
		let ahora=new Date();
		let saltados=0;
		let creadas=await enTransaccion(async conexion=>{
			if(await estaCerrado(conexion, estanciaId, cuerpo.fecha, cuerpo.turno, true)){
				return null;
			}
			let [sinRegistro]=await conexion.query(
				"SELECT i.id FROM infantes i WHERE i.estancia_id=? AND i.deleted_at IS NULL AND NOT EXISTS"+
				" (SELECT 1 FROM asistencias a WHERE a.infante_id=i.id AND a.estancia_id=i.estancia_id AND a.fecha=? AND a.turno=? AND a.deleted_at IS NULL)",
				[estanciaId, cuerpo.fecha, cuerpo.turno]
			);
			let bloqueados=await requierenAlta(conexion, sinRegistro.map(infante=>infante.id), cuerpo.fecha);
			let pendientes=sinRegistro.filter(infante=>!bloqueados.has(infante.id));
			saltados=bloqueados.size;
			if(pendientes.length==0){
				return [];
			}
			let filas=pendientes.map(infante=>[uuidv7(), estanciaId, infante.id, cuerpo.fecha, cuerpo.turno, "PRESENTE", ahora, ahora, req.usuario.usuario]);
			// Si otra persona registró a alguno entre el SELECT y este INSERT, se respeta lo suyo (id=id no cambia nada).
			await conexion.query(
				"INSERT INTO asistencias (id, estancia_id, infante_id, fecha, turno, estado_codigo, hora_entrada, capturado_en, created_by)"+
				" VALUES ? ON DUPLICATE KEY UPDATE id=id",
				[filas]
			);
			let [creadas]=await conexion.query("SELECT "+COLUMNAS+" FROM asistencias WHERE id IN (?)", [filas.map(fila=>fila[0])]);
			return creadas;
		});
		if(creadas==null){
			return res.status(409).json({message: CERRADO});
		}
		for(let fila of creadas){
			await log(req.usuario, "CREATE", "asistencias", fila.id, null, fila, req);
		}
		res.json({marcados: creadas.length, requieren_alta: saltados});
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
module.exports.LEEN_NOTA=LEEN_NOTA;
module.exports.registrarLecturaDeNotas=registrarLecturaDeNotas;
