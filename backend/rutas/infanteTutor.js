const express=require("express");
const {db, responderError}=require("../db");
const {log, permitir}=require("../seguridad");
const {alcanceTutores}=require("./tutores");

const router=express.Router();

// Mismos roles que Infantes: todos los de estancia consultan (la docente necesita saber quién puede
// recoger); solo DIRECTORA, que es quien abre la ficha del infante, agrega y quita tutores.
const lectura=permitir("DIRECTORA", "DOCENTE", "TRABAJO_SOCIAL", "MEDICO");
const escritura=permitir("DIRECTORA");
// Igual que el ENUM de infante_tutor.parentesco
const PARENTESCOS=["MADRE", "PADRE", "ABUELO_A", "TIO_A", "HERMANO_A", "TUTOR_LEGAL", "OTRO"];
// Datos del tutor que se devuelven. El teléfono no sale aquí: se consulta en la ficha del tutor.
const SELECT_VINCULO="SELECT t.id, t.nombre, t.primer_apellido, t.segundo_apellido, it.parentesco, it.autorizado_recoger, it.created_at"
	+" FROM infante_tutor it JOIN tutores t ON t.id=it.tutor_id"
	+" WHERE it.infante_id=? AND it.deleted_at IS NULL AND t.deleted_at IS NULL";

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// El infante debe ser de la estancia del token; si es de otra, se responde como si no existiera.
async function infanteDeMiEstancia(req){
	let [filas]=await db.query("SELECT id FROM infantes WHERE id=? AND estancia_id=? AND deleted_at IS NULL", [req.params.id, req.usuario.estancia_id]);
	return filas.length>0;
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Revisa el body de POST: tutor_id texto, parentesco del ENUM y autorizado_recoger booleano (opcional, false).
function validarVinculo(cuerpo){
	if(typeof cuerpo?.tutor_id!="string" || cuerpo.tutor_id==""){
		return "Falta el tutor.";
	}
	if(!PARENTESCOS.includes(cuerpo.parentesco)){
		return "El parentesco debe ser uno de: "+PARENTESCOS.join(", ")+".";
	}
	if("autorizado_recoger" in cuerpo && typeof cuerpo.autorizado_recoger!="boolean"){
		return "autorizado_recoger debe ser true o false.";
	}
	return null;
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Tutores vinculados a un infante de mi estancia
router.get("/Infantes/:id/tutores", lectura, async (req, res)=>{
	try{
		if(!await infanteDeMiEstancia(req)){
			return res.sendStatus(404);
		}
		let [filas]=await db.query(SELECT_VINCULO+" ORDER BY t.primer_apellido, t.nombre", [req.params.id]);
		res.json(filas);
	}catch(error){
		responderError(res, error);
	}
});

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Vincula un tutor al infante. El tutor debe ser visible para el usuario (mismo alcance que /Tutores).
// La llave primaria es (infante_id, tutor_id): si el vínculo se había quitado, se reactiva en vez de insertar.
router.post("/Infantes/:id/tutores", escritura, async (req, res)=>{
	try{
		let invalido=validarVinculo(req.body);
		if(invalido){
			return res.status(400).json({message: invalido});
		}
		if(!await infanteDeMiEstancia(req)){
			return res.sendStatus(404);
		}
		let alcance=alcanceTutores(req);
		let [tutores]=await db.query("SELECT id FROM tutores WHERE id=? AND deleted_at IS NULL"+alcance.sql, [req.body.tutor_id, ...alcance.valores]);
		if(tutores.length==0){
			return res.status(404).json({message: "El tutor no existe o no es de esta estancia."});
		}
		let vinculo={infante_id: req.params.id, tutor_id: req.body.tutor_id, parentesco: req.body.parentesco, autorizado_recoger: req.body.autorizado_recoger?1:0};
		let [previos]=await db.query("SELECT deleted_at FROM infante_tutor WHERE infante_id=? AND tutor_id=?", [vinculo.infante_id, vinculo.tutor_id]);
		if(previos.length>0 && previos[0].deleted_at==null){
			return res.status(409).json({message: "Ese tutor ya está vinculado a este infante."});
		}
		if(previos.length>0){
			await db.query(
				"UPDATE infante_tutor SET parentesco=?, autorizado_recoger=?, deleted_at=NULL, updated_at=CURRENT_TIMESTAMP(3) WHERE infante_id=? AND tutor_id=?",
				[vinculo.parentesco, vinculo.autorizado_recoger, vinculo.infante_id, vinculo.tutor_id]
			);
		}else{
			await db.query(
				"INSERT INTO infante_tutor (infante_id, tutor_id, parentesco, autorizado_recoger, created_by) VALUES (?,?,?,?,?)",
				[vinculo.infante_id, vinculo.tutor_id, vinculo.parentesco, vinculo.autorizado_recoger, req.usuario.usuario]
			);
		}
		// entidad_id solo admite 36 caracteres: va el infante y el tutor queda en "despues"
		await log(req.usuario, "CREATE", "infante_tutor", vinculo.infante_id, null, vinculo, req);
		let [filas]=await db.query(SELECT_VINCULO+" AND it.tutor_id=?", [vinculo.infante_id, vinculo.tutor_id]);
		res.status(201).json(filas[0]);
	}catch(error){
		responderError(res, error);
	}
});

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Quita el vínculo con borrado lógico (deleted_at); el tutor y el infante no se tocan.
router.delete("/Infantes/:id/tutores/:tutorId", escritura, async (req, res)=>{
	try{
		if(!await infanteDeMiEstancia(req)){
			return res.sendStatus(404);
		}
		let [previos]=await db.query(
			"SELECT infante_id, tutor_id, parentesco, autorizado_recoger FROM infante_tutor WHERE infante_id=? AND tutor_id=? AND deleted_at IS NULL",
			[req.params.id, req.params.tutorId]
		);
		if(previos.length==0){
			return res.sendStatus(404);
		}
		await db.query(
			"UPDATE infante_tutor SET deleted_at=CURRENT_TIMESTAMP(3), updated_at=CURRENT_TIMESTAMP(3) WHERE infante_id=? AND tutor_id=?",
			[req.params.id, req.params.tutorId]
		);
		await log(req.usuario, "SOFT_DELETE", "infante_tutor", req.params.id, previos[0], null, req);
		res.json({id: req.params.tutorId});
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
