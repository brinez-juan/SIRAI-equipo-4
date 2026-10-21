const express=require("express");
const {db, uuidv7, responderError}=require("../db");
const {log, permitir}=require("../seguridad");

const router=express.Router();
const TURNOS=["MATUTINO", "VESPERTINO"];
const CERRADO="El pase de lista ya se cerró.";
const COLUMNAS="id, estancia_id, infante_id, fecha, turno, estado_codigo, hora_entrada, hora_salida, capturado_en, created_by, created_at, updated_at";

// [IA] Generado con Claude (prompt #13 en docs/ia/prompts.md). Revisado por: pendiente
// Tabla 2.5 del plan: DOCENTE y DIRECTORA pasan lista; TRABAJO_SOCIAL y MEDICO solo consultan.
// El token debe traer estancia: la estancia nunca sale del request.
const conEstancia=(req, res, next)=>req.usuario.estancia_id==null?res.sendStatus(403):next();
const lectura=[permitir("DOCENTE", "DIRECTORA", "TRABAJO_SOCIAL", "MEDICO"), conEstancia];
const escritura=[permitir("DOCENTE", "DIRECTORA"), conEstancia];

// [IA] Generado con Claude (prompt #13 en docs/ia/prompts.md). Revisado por: pendiente
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

// [IA] Generado con Claude (prompt #13 en docs/ia/prompts.md). Revisado por: pendiente
// La asistencia solo puede usar un turno que la estancia opere (fk_asistencia_turno).
async function operaTurno(conexion, estanciaId, turno){
	let [filas]=await conexion.query("SELECT 1 FROM estancia_turnos WHERE estancia_id=? AND turno=? AND deleted_at IS NULL", [estanciaId, turno]);
	return filas.length>0;
}

// [IA] Generado con Claude (prompt #13 en docs/ia/prompts.md). Revisado por: pendiente
// FOR SHARE: dentro de una transacción bloquea la llave (estancia, fecha, turno) del cierre, así el cierre
// (issue 17) espera a que termine este registro y no se cuela una asistencia después de cerrar.
async function estaCerrado(conexion, estanciaId, fecha, turno, bloquear){
	let [filas]=await conexion.query(
		"SELECT 1 FROM cierres_pase_lista WHERE estancia_id=? AND fecha=? AND turno=? AND deleted_at IS NULL"+(bloquear?" FOR SHARE":""),
		[estanciaId, fecha, turno]
	);
	return filas.length>0;
}

// [IA] Generado con Claude (prompt #13 en docs/ia/prompts.md). Revisado por: pendiente
async function buscarAsistencia(conexion, estanciaId, infanteId, fecha, turno){
	let [filas]=await conexion.query(
		"SELECT "+COLUMNAS+" FROM asistencias WHERE estancia_id=? AND infante_id=? AND fecha=? AND turno=? AND deleted_at IS NULL",
		[estanciaId, infanteId, fecha, turno]
	);
	return filas[0];
}

// [IA] Generado con Claude (prompt #13 en docs/ia/prompts.md). Revisado por: pendiente
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

// [IA] Generado con Claude (prompt #13 en docs/ia/prompts.md). Revisado por: pendiente
// Infantes de mi estancia, cada uno con su asistencia de ese día y turno (o null), y si el turno ya se cerró.
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
			" a.id AS asistencia_id, a.estado_codigo, a.hora_entrada, a.hora_salida, a.capturado_en"+
			" FROM infantes i LEFT JOIN asistencias a ON a.infante_id=i.id AND a.estancia_id=i.estancia_id AND a.fecha=? AND a.turno=? AND a.deleted_at IS NULL"+
			" WHERE i.estancia_id=? AND i.deleted_at IS NULL ORDER BY i.primer_apellido, i.segundo_apellido, i.nombre",
			[fecha, turno, estanciaId]
		);
		res.json({
			fecha: fecha,
			turno: turno,
			cerrado: await estaCerrado(db, estanciaId, fecha, turno, false),
			infantes: filas.map(fila=>({
				id: fila.id,
				matricula: fila.matricula,
				nombre: fila.nombre,
				primer_apellido: fila.primer_apellido,
				segundo_apellido: fila.segundo_apellido,
				asistencia: fila.asistencia_id==null?null:{
					id: fila.asistencia_id,
					estado_codigo: fila.estado_codigo,
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

// [IA] Generado con Claude (prompt #13 en docs/ia/prompts.md). Revisado por: pendiente
// Registra o corrige la asistencia de un infante: upsert sobre uq_asistencia_dia (estancia, infante, fecha, turno).
// PRESENTE pone hora_entrada (si ya la tenía, se conserva la primera); cualquier otro estado la deja en NULL.
// Las horas se toman de Node (new Date()) y no de NOW(): mysql2 las guarda en UTC sin importar la zona del servidor MySQL.
// created_by es quien capturó primero; quien corrige queda en audit_log.
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
				return null;
			}
			let antes=await buscarAsistencia(conexion, estanciaId, req.params.infanteId, cuerpo.fecha, cuerpo.turno);
			await conexion.query(
				"INSERT INTO asistencias (id, estancia_id, infante_id, fecha, turno, estado_codigo, hora_entrada, capturado_en, created_by)"+
				" VALUES (?,?,?,?,?,?,?,?,?) AS nuevo"+
				" ON DUPLICATE KEY UPDATE estado_codigo=nuevo.estado_codigo,"+
				" hora_entrada=IF(nuevo.estado_codigo='PRESENTE', COALESCE(asistencias.hora_entrada, nuevo.hora_entrada), NULL),"+
				" capturado_en=nuevo.capturado_en, updated_at=CURRENT_TIMESTAMP(3)",
				[uuidv7(), estanciaId, req.params.infanteId, cuerpo.fecha, cuerpo.turno, cuerpo.estado_codigo,
				cuerpo.estado_codigo=="PRESENTE"?ahora:null, ahora, req.usuario.usuario]
			);
			let despues=await buscarAsistencia(conexion, estanciaId, req.params.infanteId, cuerpo.fecha, cuerpo.turno);
			return {antes, despues};
		});
		if(resultado==null){
			return res.status(409).json({message: CERRADO});
		}
		await log(req.usuario, resultado.antes==null?"CREATE":"UPDATE", "asistencias", resultado.despues.id, resultado.antes??null, resultado.despues, req);
		res.json(resultado.despues);
	}catch(error){
		responderError(res, error);
	}
});

// [IA] Generado con Claude (prompt #13 en docs/ia/prompts.md). Revisado por: pendiente
// Marca PRESENTE a todos los infantes de mi estancia que aún no tienen registro ese día y turno;
// los que ya tienen uno (cualquier estado) no se tocan. Body: {fecha, turno}. Responde {marcados}.
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
		let creadas=await enTransaccion(async conexion=>{
			if(await estaCerrado(conexion, estanciaId, cuerpo.fecha, cuerpo.turno, true)){
				return null;
			}
			let [pendientes]=await conexion.query(
				"SELECT i.id FROM infantes i WHERE i.estancia_id=? AND i.deleted_at IS NULL AND NOT EXISTS"+
				" (SELECT 1 FROM asistencias a WHERE a.infante_id=i.id AND a.estancia_id=i.estancia_id AND a.fecha=? AND a.turno=? AND a.deleted_at IS NULL)",
				[estanciaId, cuerpo.fecha, cuerpo.turno]
			);
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
		res.json({marcados: creadas.length});
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
