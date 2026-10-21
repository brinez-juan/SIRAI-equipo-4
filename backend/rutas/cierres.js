const express=require("express");
const {db, uuidv7, responderError}=require("../db");
const {log, permitir}=require("../seguridad");

const router=express.Router();
const TURNOS=["MATUTINO", "VESPERTINO"];
const CERRADO="El pase de lista ya se cerró.";

// [IA] Generado con Claude (prompt #17 en docs/ia/prompts.md). Revisado por: pendiente
// Solo DIRECTORA cierra el pase de lista (plan, issue 17). El token debe traer estancia: la estancia
// nunca sale del request.
const soloDirectora=[
	permitir("DIRECTORA"),
	(req, res, next)=>req.usuario.estancia_id==null?res.sendStatus(403):next()
];

// [IA] Generado con Claude (prompt #17 en docs/ia/prompts.md). Revisado por: pendiente
// Fecha de hoy (AAAA-MM-DD) en la hora local de México, que es el "día" de asistencias.fecha.
function hoy(){
	return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(new Date());
}

// [IA] Generado con Claude (prompt #17 en docs/ia/prompts.md). Revisado por: pendiente
// Revisa fecha (AAAA-MM-DD, que exista en el calendario y que no sea futura) y turno. Devuelve un mensaje o null.
// Un día futuro se rechaza porque cerrarlo marcaría como falta a todos los infantes.
function validarCierre(cuerpo){
	let {fecha, turno}=cuerpo;
	if(typeof fecha!="string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || new Date(fecha+"T00:00:00Z").toISOString().slice(0, 10)!=fecha){
		return "La fecha debe tener el formato AAAA-MM-DD.";
	}
	if(!TURNOS.includes(turno)){
		return "El turno debe ser MATUTINO o VESPERTINO.";
	}
	if(fecha>hoy()){
		return "No se puede cerrar el pase de lista de un día futuro.";
	}
	return null;
}

// [IA] Generado con Claude (prompt #17 en docs/ia/prompts.md). Revisado por: pendiente
// Cierra el pase de lista de un día y turno de MI estancia, todo en una transacción (si algo falla no se guarda nada):
//  1. Inserta el cierre (automatico = 0, cerrado_por = usuario). Va primero a propósito: el registro de
//     asistencia del issue 13 toma un FOR SHARE sobre esta llave, así que el cierre espera a que terminen los
//     registros en curso y los posteriores reciben 409. Un segundo cierre del mismo día y turno también.
//  2. Los infantes sin registro quedan como FALTA_INJUSTIFICADA (sin hora de entrada).
//  3. Cada asistencia cuyo estado tenga genera_seguimiento = 1 recibe un seguimiento ABIERTO (uno por asistencia).
// Body: {fecha, turno}. Responde 201 con {cierre, faltas, seguimientos}.
router.post("/cierres", soloDirectora, async (req, res)=>{
	try{
		let cuerpo=req.body??{};
		let invalido=validarCierre(cuerpo);
		if(invalido){
			return res.status(400).json({message: invalido});
		}
		let estanciaId=req.usuario.estancia_id;
		let usuarioId=req.usuario.usuario;
		let [turnos]=await db.query("SELECT 1 FROM estancia_turnos WHERE estancia_id=? AND turno=? AND deleted_at IS NULL", [estanciaId, cuerpo.turno]);
		if(turnos.length==0){
			return res.status(400).json({message: "La estancia no opera el turno "+cuerpo.turno+"."});
		}
		let ahora=new Date();
		let cierreId=uuidv7();
		let conexion=await db.getConnection();
		let resumen;
		try{
			await conexion.beginTransaction();
			try{
				await conexion.query(
					"INSERT INTO cierres_pase_lista (id, estancia_id, fecha, turno, cerrado_en, automatico, cerrado_por, created_by) VALUES (?,?,?,?,?,0,?,?)",
					[cierreId, estanciaId, cuerpo.fecha, cuerpo.turno, ahora, usuarioId, usuarioId]
				);
			}catch(error){
				if(error.code=="ER_DUP_ENTRY"){
					await conexion.rollback();
					return res.status(409).json({message: CERRADO});
				}
				throw error;
			}
			// Sin registro ese día y turno (se cuenta cualquier fila, también borrada, porque la clave única uq_asistencia_dia la incluye)
			let [sinRegistro]=await conexion.query(
				"SELECT i.id FROM infantes i WHERE i.estancia_id=? AND i.deleted_at IS NULL AND NOT EXISTS"+
				" (SELECT 1 FROM asistencias a WHERE a.infante_id=i.id AND a.estancia_id=i.estancia_id AND a.fecha=? AND a.turno=?)",
				[estanciaId, cuerpo.fecha, cuerpo.turno]
			);
			let faltas=sinRegistro.map(infante=>[uuidv7(), estanciaId, infante.id, cuerpo.fecha, cuerpo.turno, "FALTA_INJUSTIFICADA", ahora, usuarioId]);
			if(faltas.length>0){
				await conexion.query(
					"INSERT INTO asistencias (id, estancia_id, infante_id, fecha, turno, estado_codigo, capturado_en, created_by) VALUES ? ON DUPLICATE KEY UPDATE id=id",
					[faltas]
				);
			}
			// Incluye las faltas recién creadas. Si la asistencia ya tiene seguimiento (clave única por asistencia), no se duplica.
			let [conSeguimiento]=await conexion.query(
				"SELECT a.id FROM asistencias a JOIN estados_asistencia e ON e.codigo=a.estado_codigo"+
				" WHERE a.estancia_id=? AND a.fecha=? AND a.turno=? AND a.deleted_at IS NULL AND e.genera_seguimiento=1"+
				" AND NOT EXISTS (SELECT 1 FROM seguimientos s WHERE s.asistencia_id=a.id)",
				[estanciaId, cuerpo.fecha, cuerpo.turno]
			);
			let seguimientos=conSeguimiento.map(asistencia=>[uuidv7(), asistencia.id, usuarioId]);
			if(seguimientos.length>0){
				await conexion.query(
					"INSERT INTO seguimientos (id, asistencia_id, created_by) VALUES ? ON DUPLICATE KEY UPDATE id=id",
					[seguimientos]
				);
			}
			await conexion.commit();
			resumen={faltas: faltas.map(fila=>fila[0]), seguimientos: seguimientos.map(fila=>fila[0])};
		}catch(error){
			await conexion.rollback();
			throw error;
		}finally{
			conexion.release();
		}
		let cierre={id: cierreId, fecha: cuerpo.fecha, turno: cuerpo.turno, cerrado_en: ahora, automatico: 0, cerrado_por: usuarioId};
		// Una sola entrada para todo el cierre, con los ids de lo que creó (en vez de cientos de entradas en la cadena de hashes)
		await log(req.usuario, "CREATE", "cierres_pase_lista", cierreId, null, {...cierre, estancia_id: estanciaId, asistencias_falta_creadas: resumen.faltas, seguimientos_creados: resumen.seguimientos}, req);
		res.status(201).json({cierre: cierre, faltas: resumen.faltas.length, seguimientos: resumen.seguimientos.length});
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
