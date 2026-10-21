const express=require("express");
const argon2=require("argon2");
const jwt=require("jsonwebtoken");
const {db, responderError}=require("../db");
const {log}=require("../seguridad");

const router=express.Router();
const MAX_INTENTOS=5;
const MINUTOS_BLOQUEO=15;
const DURACION_TOKEN="8h"; // un turno

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md), modificado con el prompt #30. Revisado por: pendiente
// Única ruta pública del backend. Recibe {username (correo), password} y devuelve un JWT.
// Tras MAX_INTENTOS fallidos la cuenta se bloquea MINUTOS_BLOQUEO minutos.
router.post("/login", async (req, res)=>{
	try{
		let correo=req.body?.username;
		let pass=req.body?.password;
		// Prompt #30: correo y contraseña deben ser texto. Un objeto en el correo llegaba a la consulta SQL
		// (mysql2 lo convierte en "columna = valor") y una contraseña que no es texto hacía fallar argon2 con un 500.
		if(typeof correo!="string" || typeof pass!="string"){
			return res.status(400).json({message: "Faltan el correo y la contraseña."});
		}
		let [usuarios]=await db.query("SELECT * FROM usuarios WHERE correo=? AND deleted_at IS NULL", [correo]);
		let data=usuarios[0];
		if(data==null || !data.activo){
			return res.sendStatus(401);
		}
		// Lo que viaja dentro del token: los demás endpoints lo leen en req.usuario
		let sujeto={"usuario": data.id, "rol": data.rol, "estancia_id": data.estancia_id, "region_id": data.region_id};
		if(data.bloqueado_hasta!=null && data.bloqueado_hasta>new Date()){
			await log(sujeto, "LOGIN", "usuarios", data.id, null, {resultado: "BLOQUEADO"}, req);
			return res.sendStatus(401);
		}
		if(await argon2.verify(data.password_hash, pass)){
			await db.query("UPDATE usuarios SET intentos_fallidos=0, bloqueado_hasta=NULL, ultimo_acceso_en=CURRENT_TIMESTAMP(3) WHERE id=?", [data.id]);
			await log(sujeto, "LOGIN", "usuarios", data.id, null, {resultado: "EXITOSO"}, req);
			let token=jwt.sign(sujeto, process.env.LLAVESECRETA, {expiresIn: DURACION_TOKEN});
			res.json({"token": token, "id": data.id, "rol": data.rol, "nombre": data.nombre+" "+data.primer_apellido});
		}else{
			let intentos=data.intentos_fallidos+1;
			let bloqueada=intentos>=MAX_INTENTOS;
			await db.query(
				"UPDATE usuarios SET intentos_fallidos=?, bloqueado_hasta=? WHERE id=?",
				[bloqueada?0:intentos, bloqueada?new Date(Date.now()+MINUTOS_BLOQUEO*60*1000):null, data.id]
			);
			await log(sujeto, "LOGIN", "usuarios", data.id, null, {bloqueada: bloqueada, resultado: "FALLIDO"}, req);
			res.sendStatus(401);
		}
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
