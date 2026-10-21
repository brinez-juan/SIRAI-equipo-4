const express=require("express");
const argon2=require("argon2");
const mysql=require("mysql2/promise");
const {db, uuidv7, responderError}=require("../db");
const {log, permitir}=require("../seguridad");

const router=express.Router();
const soloAdmin=permitir("ADMIN_CENTRAL");

// Columnas que sí salen al frontend. password_hash e intentos_fallidos nunca se leen aquí,
// por eso no se usa SELECT * (ni crud.js, que sí lo usa).
const LECTURA=["id", "nombre", "primer_apellido", "segundo_apellido", "correo", "rol", "estancia_id", "region_id",
	"activo", "bloqueado_hasta", "ultimo_acceso_en", "created_at", "updated_at"];
const SELECT="SELECT "+LECTURA.map(campo=>mysql.escapeId(campo)).join(", ")+" FROM usuarios";
// Columnas que el administrador puede escribir. La contraseña llega aparte como "password".
const ESCRITURA=["nombre", "primer_apellido", "segundo_apellido", "correo", "rol", "estancia_id", "region_id", "activo"];

// [IA] Generado con Claude (issue 05, registrar prompt en docs/ia/prompts.md). Revisado por: pendiente
// Errores propios de usuarios con mensaje para react-admin ({message}); el resto va a responderError.
function errorUsuario(res, error){
	if(error.code=="ER_CHECK_CONSTRAINT_VIOLATED" && error.message.includes("chk_usuarios_alcance")){
		res.status(400).json({message: "Rol y alcance no coinciden: DOCENTE, TRABAJO_SOCIAL, MEDICO y DIRECTORA llevan estancia y no región; SUPERVISOR lleva región y no estancia; ADMIN_CENTRAL no lleva ninguna."});
	}else if(error.code=="ER_DUP_ENTRY"){
		res.status(409).json({message: "Ya existe un usuario con ese correo."});
	}else{
		responderError(res, error);
	}
}

// [IA] Generado con Claude (issue 05, registrar prompt en docs/ia/prompts.md), modificado con el prompt #30. Revisado por: pendiente
// Filtros de react-admin (?campo=valor) solo sobre columnas conocidas; excluye borrados lógicos.
// Un campo repetido (?rol=A&rol=B) llega como arreglo y se filtra con IN (antes daba 500).
function filtros(query){
	let condiciones=["deleted_at IS NULL"];
	let valores=[];
	for(let campo in query){
		if(LECTURA.includes(campo) && campo!="id"){
			condiciones.push(mysql.escapeId(campo)+(Array.isArray(query[campo])?" IN (?)":"=?"));
			valores.push(query[campo]);
		}
	}
	return {where: " WHERE "+condiciones.join(" AND "), valores};
}

// [IA] Generado con Claude (issue 05, registrar prompt en docs/ia/prompts.md). Revisado por: pendiente
async function buscarPorId(id){
	let [data]=await db.query(SELECT+" WHERE id=? AND deleted_at IS NULL", [id]);
	return data[0];
}

// [IA] Generado con Claude (issue 05, registrar prompt en docs/ia/prompts.md). Revisado por: pendiente
// Toma del body solo las columnas permitidas; si viene "password" la hashea con argon2id.
// Devuelve null si la contraseña viene pero no es un texto no vacío.
async function camposDelBody(body){
	let campos=ESCRITURA.filter(campo=>campo in body);
	let valores=campos.map(campo=>body[campo]);
	if("password" in body && body.password!==""){
		if(typeof body.password!="string"){
			return null;
		}
		campos.push("password_hash");
		valores.push(await argon2.hash(body.password, {type: argon2.argon2id}));
	}
	return {campos, valores};
}

// [IA] Generado con Claude (issue 05, registrar prompt en docs/ia/prompts.md). Revisado por: pendiente
// Lista (?_sort=&_order=&_start=&_end=), varios por id (?id=1&id=2) o referencia (?estancia_id=3)
router.get("/Usuarios", soloAdmin, async (req, res)=>{
	try{
		if("id" in req.query){
			let [data]=await db.query(SELECT+" WHERE id IN (?) AND deleted_at IS NULL", [[].concat(req.query.id)]);
			return res.json(data);
		}
		let {where, valores}=filtros(req.query);
		let sortBy=LECTURA.includes(req.query._sort)?req.query._sort:"id";
		let sortOrder=req.query._order=="ASC"?"ASC":"DESC";
		let inicio=Number(req.query._start)||0;
		let fin=Number(req.query._end)||inicio+25;
		let [[{total}]]=await db.query("SELECT COUNT(*) AS total FROM usuarios"+where, valores);
		let [data]=await db.query(
			SELECT+where+" ORDER BY "+mysql.escapeId(sortBy)+" "+sortOrder+" LIMIT ? OFFSET ?",
			[...valores, Math.max(fin-inicio, 0), inicio]
		);
		res.set("Access-Control-Expose-Headers", "X-Total-Count");
		res.set("X-Total-Count", total);
		res.json(data);
	}catch(error){
		errorUsuario(res, error);
	}
});

// [IA] Generado con Claude (issue 05, registrar prompt en docs/ia/prompts.md). Revisado por: pendiente
router.get("/Usuarios/:id", soloAdmin, async (req, res)=>{
	try{
		let data=await buscarPorId(req.params.id);
		if(data==null){
			return res.sendStatus(404);
		}
		res.json(data);
	}catch(error){
		errorUsuario(res, error);
	}
});

// [IA] Generado con Claude (issue 05, registrar prompt en docs/ia/prompts.md). Revisado por: pendiente
// Alta de usuario: la contraseña es obligatoria y se guarda hasheada
router.post("/Usuarios", soloAdmin, async (req, res)=>{
	try{
		if(typeof req.body.password!="string" || req.body.password==""){
			return res.status(400).json({message: "La contraseña es obligatoria."});
		}
		let {campos, valores}=await camposDelBody(req.body);
		let id=uuidv7();
		campos.push("id", "created_by");
		valores.push(id, req.usuario.usuario);
		await db.query(
			"INSERT INTO usuarios ("+campos.map(campo=>mysql.escapeId(campo)).join(", ")+") VALUES (?)",
			[valores]
		);
		let data=await buscarPorId(id);
		await log(req.usuario, "CREATE", "usuarios", id, null, data, req);
		res.status(201).json(data);
	}catch(error){
		errorUsuario(res, error);
	}
});

// [IA] Generado con Claude (issue 05, registrar prompt en docs/ia/prompts.md). Revisado por: pendiente
// Edición: si "password" viene vacío o no viene, la contraseña no cambia
router.put("/Usuarios/:id", soloAdmin, async (req, res)=>{
	try{
		let antes=await buscarPorId(req.params.id);
		if(antes==null){
			return res.sendStatus(404);
		}
		if(req.params.id==req.usuario.usuario && "activo" in req.body && !Number(req.body.activo)){
			return res.status(400).json({message: "No puedes desactivar tu propio usuario."});
		}
		let cambios=await camposDelBody(req.body);
		if(cambios==null){
			return res.status(400).json({message: "La contraseña no es válida."});
		}
		let asignaciones=cambios.campos.map(campo=>mysql.escapeId(campo)+"=?").concat("updated_at=CURRENT_TIMESTAMP(3)");
		await db.query(
			"UPDATE usuarios SET "+asignaciones.join(", ")+" WHERE id=? AND deleted_at IS NULL",
			[...cambios.valores, req.params.id]
		);
		let data=await buscarPorId(req.params.id);
		// La bitácora no guarda la contraseña, solo que cambió
		await log(req.usuario, "UPDATE", "usuarios", req.params.id, antes, {...data, password_cambiada: cambios.campos.includes("password_hash")}, req);
		res.json(data);
	}catch(error){
		errorUsuario(res, error);
	}
});

// [IA] Generado con Claude (issue 05, registrar prompt en docs/ia/prompts.md). Revisado por: pendiente
// Los usuarios no se borran: DELETE solo los desactiva (activo=0) y ya no pueden iniciar sesión
router.delete("/Usuarios/:id", soloAdmin, async (req, res)=>{
	try{
		let antes=await buscarPorId(req.params.id);
		if(antes==null){
			return res.sendStatus(404);
		}
		if(req.params.id==req.usuario.usuario){
			return res.status(400).json({message: "No puedes desactivar tu propio usuario."});
		}
		await db.query("UPDATE usuarios SET activo=0, updated_at=CURRENT_TIMESTAMP(3) WHERE id=?", [req.params.id]);
		let data=await buscarPorId(req.params.id);
		await log(req.usuario, "DESACTIVAR", "usuarios", req.params.id, antes, data, req);
		res.json(data);
	}catch(error){
		errorUsuario(res, error);
	}
});

module.exports=router;
