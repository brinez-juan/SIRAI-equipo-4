const jwt=require("jsonwebtoken");
const crypto=require("crypto");
const {db}=require("./db");

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// JSON con llaves ordenadas: MySQL reordena las llaves de las columnas JSON,
// así el hash se puede recalcular a partir de lo que quedó guardado.
function jsonCanonico(valor){
	if(Array.isArray(valor)){
		return "["+valor.map(jsonCanonico).join(",")+"]";
	}
	if(valor!==null && typeof valor=="object"){
		return "{"+Object.keys(valor).sort().map(llave=>JSON.stringify(llave)+":"+jsonCanonico(valor[llave])).join(",")+"}";
	}
	return JSON.stringify(valor);
}

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// audit_log es una cadena: hash = SHA-256(hash_prev + jsonCanonico(registro)).
// El lock evita que dos inserts concurrentes tomen el mismo hash_prev.
// Sin req (procesos del sistema como el cierre automático) la ip y el user_agent quedan en NULL.
async function log(sujeto, accion, entidad, entidadId, antes, despues, req){
	let conn=await db.getConnection();
	try{
		await conn.query("SELECT GET_LOCK('audit_log', 10)");
		let [ultimo]=await conn.query("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1");
		let hashPrev=ultimo.length?ultimo[0].hash:null;
		let nuevoLog={};
		nuevoLog["ts"]=new Date().toISOString();
		nuevoLog["usuario_id"]=sujeto?sujeto.usuario:null;
		nuevoLog["rol"]=sujeto?sujeto.rol:null;
		nuevoLog["ip"]=req?.ip??null;
		nuevoLog["user_agent"]=req?.get("User-Agent")?.slice(0,255)??null;
		nuevoLog["request_id"]=crypto.randomUUID();
		nuevoLog["accion"]=accion;
		nuevoLog["entidad"]=entidad.slice(0,50);
		nuevoLog["entidad_id"]=String(entidadId).slice(0,36);
		// Ida y vuelta por JSON para que fechas y demás queden igual que en la columna
		nuevoLog["antes"]=antes==null?null:JSON.parse(JSON.stringify(antes));
		nuevoLog["despues"]=despues==null?null:JSON.parse(JSON.stringify(despues));
		let hash=crypto.createHash("sha256").update((hashPrev??"")+jsonCanonico(nuevoLog)).digest("hex");
		await conn.query(
			"INSERT INTO audit_log (ts, usuario_id, rol, ip, user_agent, request_id, accion, entidad, entidad_id, antes, despues, hash_prev, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
			[new Date(nuevoLog.ts), nuevoLog.usuario_id, nuevoLog.rol, nuevoLog.ip, nuevoLog.user_agent, nuevoLog.request_id, accion, nuevoLog.entidad, nuevoLog.entidad_id,
			antes==null?null:JSON.stringify(antes), despues==null?null:JSON.stringify(despues), hashPrev, hash]
		);
	}finally{
		await conn.query("SELECT RELEASE_LOCK('audit_log')");
		conn.release();
	}
}

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md), modificado con el prompt #30. Revisado por: pendiente
// Verifica el JWT del header "Authentication". Si es válido deja sus datos en req.usuario
// ({usuario, rol, estancia_id, region_id}); si falta, expiró o fue alterado responde 401.
// Prompt #30: además revisa en la base que el usuario siga activo y con el mismo rol y alcance que dice el token.
// Sin esto, un usuario desactivado (o al que le cambiaron el rol) conservaba su acceso hasta que el token expirara (8 h).
async function autenticar(req, res, next){
	let sujeto;
	try{
		sujeto=jwt.verify(req.get("Authentication"), process.env.LLAVESECRETA);
	}catch{
		return res.sendStatus(401);
	}
	try{
		let [usuarios]=await db.query("SELECT rol, estancia_id, region_id, activo FROM usuarios WHERE id=? AND deleted_at IS NULL", [sujeto.usuario]);
		let actual=usuarios[0];
		if(actual==null || !actual.activo || actual.rol!=sujeto.rol || actual.estancia_id!=sujeto.estancia_id || actual.region_id!=sujeto.region_id){
			return res.sendStatus(401);
		}
	}catch(error){
		console.error(error);
		return res.sendStatus(500);
	}
	req.usuario=sujeto;
	next();
}

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// Deja pasar solo a los roles indicados; uso: permitir("DIRECTORA", "DOCENTE"). Responde 403 si no.
function permitir(...roles){
	return (req, res, next)=>{
		if(roles.includes(req.usuario.rol)){
			next();
		}else{
			res.sendStatus(403);
		}
	};
}

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// Guarda en audit_log cada petición autenticada cuando termina, con su código de respuesta.
// Así ningún endpoint se queda sin logging aunque su autor no llame a log().
function registrarPeticion(req, res, next){
	res.on("finish", ()=>{
		let ruta=req.originalUrl.split("?")[0];
		log(req.usuario, req.method, ruta, "-", null, {status: res.statusCode}, req)
			.catch(error=>console.error("No se pudo registrar la petición en audit_log", error));
	});
	next();
}

module.exports={log, autenticar, permitir, registrarPeticion};
