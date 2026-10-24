const express=require("express");
const {db, uuidv7, responderError}=require("../db");
const {log, permitir}=require("../seguridad");
const {cifrar, descifrar}=require("../cifrado");

const router=express.Router();
// Igual que el ENUM de llamadas.resultado
const RESULTADOS=["CONTACTO_EXITOSO", "SIN_RESPUESTA", "NUMERO_EQUIVOCADO", "BUZON"];
const HORAS_REINTENTO=4;
const MAX_NOTAS=2000;

// Mismos roles que la bandeja de seguimiento (rutas/seguimientos.js, issue 20). El token debe traer estancia.
const acceso=[
	permitir("TRABAJO_SOCIAL", "MEDICO", "DIRECTORA"),
	(req, res, next)=>req.usuario.estancia_id==null?res.sendStatus(403):next()
];

// Revisa el body: exactamente uno de tutor_id o contacto_emergencia_id (chk_un_destinatario),
// resultado del ENUM y notas opcionales como texto. Devuelve un mensaje o null.
function validarLlamada(cuerpo){
	let conTutor=typeof cuerpo.tutor_id=="string" && cuerpo.tutor_id!="";
	let conContacto=typeof cuerpo.contacto_emergencia_id=="string" && cuerpo.contacto_emergencia_id!="";
	if(conTutor==conContacto){
		return "Indique a quién se llamó: un tutor o un contacto de emergencia (solo uno).";
	}
	if(!RESULTADOS.includes(cuerpo.resultado)){
		return "El resultado debe ser uno de: "+RESULTADOS.join(", ")+".";
	}
	if(cuerpo.notas!=null && typeof cuerpo.notas!="string"){
		return "Las notas deben ser texto.";
	}
	if(typeof cuerpo.notas=="string" && cuerpo.notas.length>MAX_NOTAS){
		return "Las notas no pueden pasar de "+MAX_NOTAS+" caracteres.";
	}
	return null;
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Registra una llamada de un seguimiento de mi estancia, todo en una transacción:
//   - intento = último + 1 (FOR UPDATE sobre el seguimiento: dos llamadas a la vez no toman el mismo número);
//   - el destinatario debe ser un tutor vinculado o un contacto de emergencia del infante del seguimiento;
//   - las notas se guardan cifradas;
//   - con SIN_RESPUESTA, siguiente_intento_en = ahora + 4 h (la bandeja lo lee de la llamada más reciente; no hay job);
//   - si el seguimiento estaba ABIERTO pasa a EN_CONTACTO; si ya avanzó (CLASIFICADO...) no se regresa.
// Las horas se toman de Node, como en asistencia.js: mysql2 las guarda en UTC.
router.post("/seguimientos/:id/llamadas", acceso, async (req, res)=>{
	let cuerpo=req.body??{};
	let invalido=validarLlamada(cuerpo);
	if(invalido){
		return res.status(400).json({message: invalido});
	}
	let conexion;
	try{
		conexion=await db.getConnection();
		await conexion.beginTransaction();
		let [seguimientos]=await conexion.query(
			"SELECT s.id, s.estado, a.infante_id FROM seguimientos s JOIN asistencias a ON a.id=s.asistencia_id"+
			" WHERE s.id=? AND a.estancia_id=? AND s.deleted_at IS NULL FOR UPDATE",
			[req.params.id, req.usuario.estancia_id]
		);
		let caso=seguimientos[0];
		if(caso==null){
			await conexion.rollback();
			return res.sendStatus(404);
		}
		if(caso.estado=="CERRADO"){
			await conexion.rollback();
			return res.status(409).json({message: "El seguimiento ya está cerrado."});
		}
		let [destinatarios]=cuerpo.tutor_id
			?await conexion.query(
				"SELECT 1 FROM infante_tutor it JOIN tutores t ON t.id=it.tutor_id"+
				" WHERE it.infante_id=? AND it.tutor_id=? AND it.deleted_at IS NULL AND t.deleted_at IS NULL",
				[caso.infante_id, cuerpo.tutor_id]
			)
			:await conexion.query(
				"SELECT 1 FROM contactos_emergencia WHERE id=? AND infante_id=? AND deleted_at IS NULL",
				[cuerpo.contacto_emergencia_id, caso.infante_id]
			);
		if(destinatarios.length==0){
			await conexion.rollback();
			return res.status(400).json({message: cuerpo.tutor_id?"El tutor no está vinculado a este infante.":"El contacto de emergencia no es de este infante."});
		}
		// MAX sobre todas las filas, también las borradas: la llave única (seguimiento_id, intento) las incluye
		let [[{ultimo}]]=await conexion.query("SELECT COALESCE(MAX(intento), 0) AS ultimo FROM llamadas WHERE seguimiento_id=?", [caso.id]);
		let ahora=new Date();
		let llamada={
			id: uuidv7(),
			seguimiento_id: caso.id,
			intento: ultimo+1,
			tutor_id: cuerpo.tutor_id||null,
			contacto_emergencia_id: cuerpo.contacto_emergencia_id||null,
			realizada_en: ahora,
			realizada_por: req.usuario.usuario,
			resultado: cuerpo.resultado,
			notas_cifrado: typeof cuerpo.notas=="string" && cuerpo.notas.trim()!=""?cifrar(cuerpo.notas.trim()):null,
			siguiente_intento_en: cuerpo.resultado=="SIN_RESPUESTA"?new Date(ahora.getTime()+HORAS_REINTENTO*60*60*1000):null,
		};
		await conexion.query(
			"INSERT INTO llamadas (id, seguimiento_id, intento, tutor_id, contacto_emergencia_id, realizada_en, realizada_por, resultado, notas_cifrado, siguiente_intento_en, created_by)"+
			" VALUES (?,?,?,?,?,?,?,?,?,?,?)",
			[llamada.id, llamada.seguimiento_id, llamada.intento, llamada.tutor_id, llamada.contacto_emergencia_id, llamada.realizada_en,
			llamada.realizada_por, llamada.resultado, llamada.notas_cifrado, llamada.siguiente_intento_en, req.usuario.usuario]
		);
		let cambioEstado=caso.estado=="ABIERTO";
		if(cambioEstado){
			await conexion.query("UPDATE seguimientos SET estado='EN_CONTACTO', updated_at=CURRENT_TIMESTAMP(3) WHERE id=?", [caso.id]);
		}
		await conexion.commit();
		// La bitácora guarda las notas cifradas, nunca en claro
		await log(req.usuario, "CREATE", "llamadas", llamada.id, null, llamada, req);
		if(cambioEstado){
			await log(req.usuario, "UPDATE", "seguimientos", caso.id, {estado: caso.estado}, {estado: "EN_CONTACTO"}, req);
		}
		let {notas_cifrado, ...respuesta}=llamada;
		res.status(201).json({...respuesta, notas: descifrar(notas_cifrado), estado_seguimiento: cambioEstado?"EN_CONTACTO":caso.estado});
	}catch(error){
		if(conexion){
			await conexion.rollback().catch(()=>{});
		}
		responderError(res, error);
	}finally{
		conexion?.release();
	}
});

module.exports=router;
