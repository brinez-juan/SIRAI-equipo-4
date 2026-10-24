const express=require("express");
const {db, responderError}=require("../db");
const {log, permitir}=require("../seguridad");

const router=express.Router();
const TURNOS=["MATUTINO", "VESPERTINO"];
const COLUMNAS="id, infante_id, fecha, turno, estado_codigo, hora_entrada, hora_salida, tutor_salida_id";

// Tabla 2.5 del plan: DOCENTE y DIRECTORA registran la salida con tutor. TRABAJO_SOCIAL y MEDICO no.
// El token debe traer estancia: la estancia nunca sale del request.
const escritura=[
	permitir("DOCENTE", "DIRECTORA"),
	(req, res, next)=>req.usuario.estancia_id==null?res.sendStatus(403):next()
];

// Fecha de hoy (AAAA-MM-DD) en la hora local de México, que es el "día" de asistencias.fecha. No la manda
// el cliente: así la salida siempre queda en el mismo día que la entrada y no hay horas de otro día.
function hoy(){
	return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(new Date());
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Registra la salida de un infante presente con un tutor autorizado a recogerlo.
// PUT /pase-lista/:infanteId/salida  {tutor_id, turno}
// - 403 "Tutor no autorizado": el tutor no está vinculado a ESE infante con autorizado_recoger = 1.
// - 409: el infante no está presente ese día y turno, o su salida ya estaba registrada.
// La salida NO se bloquea cuando el turno ya está cerrado: el cierre (09:00) fija faltas y tickets, y los
// infantes salen después. Solo se escriben hora_salida y tutor_salida_id; el estado no se toca.
router.put("/pase-lista/:infanteId/salida", escritura, async (req, res)=>{
	try{
		let cuerpo=req.body??{};
		if(typeof cuerpo.tutor_id!="string" || cuerpo.tutor_id==""){
			return res.status(400).json({message: "Falta el tutor."});
		}
		if(!TURNOS.includes(cuerpo.turno)){
			return res.status(400).json({message: "El turno debe ser MATUTINO o VESPERTINO."});
		}
		let estanciaId=req.usuario.estancia_id;
		let [infantes]=await db.query("SELECT id FROM infantes WHERE id=? AND estancia_id=? AND deleted_at IS NULL", [req.params.infanteId, estanciaId]);
		if(infantes.length==0){
			return res.sendStatus(404);
		}
		// La FK fk_tutor_salida acepta cualquier vínculo (incluso quitado o sin autorización): esta revisión es la que protege.
		let [autorizados]=await db.query(
			"SELECT 1 FROM infante_tutor it JOIN tutores t ON t.id=it.tutor_id"+
			" WHERE it.infante_id=? AND it.tutor_id=? AND it.autorizado_recoger=1 AND it.deleted_at IS NULL AND t.deleted_at IS NULL",
			[req.params.infanteId, cuerpo.tutor_id]
		);
		if(autorizados.length==0){
			return res.status(403).json({message: "Tutor no autorizado"});
		}
		let [filas]=await db.query(
			"SELECT "+COLUMNAS+" FROM asistencias WHERE estancia_id=? AND infante_id=? AND fecha=? AND turno=? AND deleted_at IS NULL",
			[estanciaId, req.params.infanteId, hoy(), cuerpo.turno]
		);
		let antes=filas[0];
		if(antes==null){
			return res.status(409).json({message: "El infante no tiene asistencia registrada hoy en ese turno."});
		}
		if(antes.estado_codigo!="PRESENTE" || antes.hora_entrada==null){
			return res.status(409).json({message: "Solo se registra la salida de un infante presente."});
		}
		if(antes.hora_salida!=null){
			return res.status(409).json({message: "La salida de este infante ya está registrada."});
		}
		// Un solo UPDATE con las mismas condiciones: si otra persona registró la salida entre el SELECT y aquí, no sobrescribe.
		// GREATEST protege el CHECK chk_orden_horas (la salida nunca puede ser anterior a la entrada).
		let [resultado]=await db.query(
			"UPDATE asistencias SET hora_salida=GREATEST(hora_entrada, ?), tutor_salida_id=?, updated_at=CURRENT_TIMESTAMP(3)"+
			" WHERE id=? AND hora_salida IS NULL AND estado_codigo='PRESENTE' AND hora_entrada IS NOT NULL AND deleted_at IS NULL",
			[new Date(), cuerpo.tutor_id, antes.id]
		);
		if(resultado.affectedRows==0){
			return res.status(409).json({message: "La salida de este infante ya está registrada."});
		}
		let [despuesFilas]=await db.query("SELECT "+COLUMNAS+" FROM asistencias WHERE id=?", [antes.id]);
		await log(req.usuario, "UPDATE", "asistencias", antes.id, antes, despuesFilas[0], req);
		res.json(despuesFilas[0]);
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
