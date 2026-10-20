const express=require("express");
const mysql=require("mysql2/promise");
var cors=require("cors");
const bodyParser=require("body-parser")
const argon2=require("argon2");
const app=express();
const jwt=require("jsonwebtoken");
const crypto=require("crypto");
const fs=require("fs");
const https=require("https");

const PORT=3000;
const MAX_INTENTOS=5;
const MINUTOS_BLOQUEO=15;
let db;
app.use(cors());
app.use(bodyParser.json());

// Recursos expuestos al frontend (react-admin): tabla y columnas que se pueden escribir.
// Los nombres de columna solo salen de aquí, nunca del request, para no inyectar SQL.
const recursos={
	Regiones: {tabla:"regiones", columnas:["nombre"]},
	Estancias: {tabla:"estancias", columnas:["region_id", "clave", "nombre", "direccion", "max_sesiones"]},
};
for(let nombre in recursos){
	recursos[nombre].lectura=["id", ...recursos[nombre].columnas, "created_at", "updated_at"];
}

async function connectToDB(){
	db=mysql.createPool({uri: process.env.DATABASE_URL, timezone: "Z"});
	await db.query("SELECT 1");
	console.log("conectado a la base de datos");
}

function uuidv7(){
	let bytes=crypto.randomBytes(16);
	let ts=BigInt(Date.now());
	for(let i=0; i<6; i++){
		bytes[i]=Number((ts>>BigInt(8*(5-i)))&0xffn);
	}
	bytes[6]=(bytes[6]&0x0f)|0x70;
	bytes[8]=(bytes[8]&0x3f)|0x80;
	let hex=bytes.toString("hex");
	return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
}

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

// audit_log es una cadena: hash = SHA-256(hash_prev + jsonCanonico(registro)).
// El lock evita que dos inserts concurrentes tomen el mismo hash_prev.
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
		nuevoLog["ip"]=req.ip??null;
		nuevoLog["user_agent"]=req.get("User-Agent")?.slice(0,255)??null;
		nuevoLog["request_id"]=crypto.randomUUID();
		nuevoLog["accion"]=accion;
		nuevoLog["entidad"]=entidad;
		nuevoLog["entidad_id"]=String(entidadId);
		// Ida y vuelta por JSON para que fechas y demás queden igual que en la columna
		nuevoLog["antes"]=antes==null?null:JSON.parse(JSON.stringify(antes));
		nuevoLog["despues"]=despues==null?null:JSON.parse(JSON.stringify(despues));
		let hash=crypto.createHash("sha256").update((hashPrev??"")+jsonCanonico(nuevoLog)).digest("hex");
		await conn.query(
			"INSERT INTO audit_log (ts, usuario_id, rol, ip, user_agent, request_id, accion, entidad, entidad_id, antes, despues, hash_prev, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
			[new Date(nuevoLog.ts), nuevoLog.usuario_id, nuevoLog.rol, nuevoLog.ip, nuevoLog.user_agent, nuevoLog.request_id, accion, entidad, nuevoLog.entidad_id,
			antes==null?null:JSON.stringify(antes), despues==null?null:JSON.stringify(despues), hashPrev, hash]
		);
	}finally{
		await conn.query("SELECT RELEASE_LOCK('audit_log')");
		conn.release();
	}
}

function responderError(res, error){
	if(error.code=="ER_DUP_ENTRY"){
		res.sendStatus(409);
	}else if(["ER_NO_REFERENCED_ROW_2", "ER_ROW_IS_REFERENCED_2", "ER_CHECK_CONSTRAINT_VIOLATED", "ER_BAD_NULL_ERROR", "ER_DATA_TOO_LONG", "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD", "WARN_DATA_TRUNCATED"].includes(error.code)){
		res.sendStatus(400);
	}else{
		console.error(error);
		res.sendStatus(500);
	}
}

async function autenticar(req, res, next){
	try{
		let token=req.get("Authentication");
		req.usuario=await jwt.verify(token, process.env.LLAVESECRETA);
		next();
	}catch{
		res.sendStatus(401);
	}
}

// Filtros de react-admin (?campo=valor), solo sobre columnas conocidas; excluye borrados lógicos
function filtros(recurso, query){
	let condiciones=["deleted_at IS NULL"];
	let valores=[];
	for(let campo in query){
		if(recurso.lectura.includes(campo)){
			condiciones.push(mysql.escapeId(campo)+"=?");
			valores.push(query[campo]);
		}
	}
	return {where: " WHERE "+condiciones.join(" AND "), valores};
}

async function buscarPorId(recurso, id){
	let [data]=await db.query("SELECT * FROM "+mysql.escapeId(recurso.tabla)+" WHERE id=? AND deleted_at IS NULL", [id]);
	return data[0];
}

async function getList(recurso, req, res){
	let sortBy=recurso.lectura.includes(req.query._sort)?req.query._sort:"id";
	let sortOrder=req.query._order=="ASC"?"ASC":"DESC";
	let inicio=Number(req.query._start)||0;
	let fin=Number(req.query._end)||inicio+25;
	let {where, valores}=filtros(recurso, req.query);
	let tabla=mysql.escapeId(recurso.tabla);
	let [[{total}]]=await db.query("SELECT COUNT(*) AS total FROM "+tabla+where, valores);
	let [data]=await db.query(
		"SELECT * FROM "+tabla+where+" ORDER BY "+mysql.escapeId(sortBy)+" "+sortOrder+" LIMIT ? OFFSET ?",
		[...valores, Math.max(fin-inicio, 0), inicio]
	);
	res.set("Access-Control-Expose-Headers", "X-Total-Count");
	res.set("X-Total-Count", total);
	res.json(data);
}

async function getMany(recurso, req, res){
	let ids=[].concat(req.query.id);
	let [data]=await db.query("SELECT * FROM "+mysql.escapeId(recurso.tabla)+" WHERE id IN (?) AND deleted_at IS NULL", [ids]);
	res.json(data);
}

async function getManyReference(recurso, req, res){
	let {where, valores}=filtros(recurso, req.query);
	let [data]=await db.query("SELECT * FROM "+mysql.escapeId(recurso.tabla)+where, valores);
	res.set("Access-Control-Expose-Headers", "X-Total-Count");
	res.set("X-Total-Count", data.length);
	res.json(data);
}

async function getOne(recurso, id, req, res){
	let data=await buscarPorId(recurso, id);
	if(data==null){
		res.sendStatus(404);
	}else{
		res.json(data);
	}
}

async function updateData(recurso, id, req, res){
	let antes=await buscarPorId(recurso, id);
	if(antes==null){
		return res.sendStatus(404);
	}
	let campos=recurso.columnas.filter(campo=>campo in req.body);
	let asignaciones=campos.map(campo=>mysql.escapeId(campo)+"=?").concat("updated_at=CURRENT_TIMESTAMP(3)");
	await db.query(
		"UPDATE "+mysql.escapeId(recurso.tabla)+" SET "+asignaciones.join(", ")+" WHERE id=? AND deleted_at IS NULL",
		[...campos.map(campo=>req.body[campo]), id]
	);
	let data=await buscarPorId(recurso, id);
	await log(req.usuario, "UPDATE", recurso.tabla, id, antes, data, req);
	res.json(data);
}

async function deleteData(recurso, id, req, res){
	let antes=await buscarPorId(recurso, id);
	if(antes==null){
		return res.sendStatus(404);
	}
	await db.query("UPDATE "+mysql.escapeId(recurso.tabla)+" SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", [id]);
	await log(req.usuario, "SOFT_DELETE", recurso.tabla, id, antes, null, req);
	res.json(antes);
}

async function createData(recurso, req, res){
	let campos=recurso.columnas.filter(campo=>campo in req.body);
	let valores=campos.map(campo=>req.body[campo]);
	campos.push("created_by");
	valores.push(req.usuario.usuario);
	let [resultado]=await db.query(
		"INSERT INTO "+mysql.escapeId(recurso.tabla)+" ("+campos.map(campo=>mysql.escapeId(campo)).join(", ")+") VALUES (?)",
		[valores]
	);
	let data=await buscarPorId(recurso, resultado.insertId);
	await log(req.usuario, "CREATE", recurso.tabla, data.id, null, data, req);
	res.status(201).json(data);
}

for(let nombre in recursos){
	let recurso=recursos[nombre];

	app.get("/"+nombre, autenticar, async (req,res)=>{
		try{
			if("_sort" in req.query){
				await getList(recurso, req, res);
			}else if("id" in req.query){
				await getMany(recurso, req, res);
			}else{
				await getManyReference(recurso, req, res);
			}
		}catch(error){
			responderError(res, error);
		}
	});

	app.get("/"+nombre+"/:id", autenticar, async(req, res)=>{
		try{
			await getOne(recurso, req.params.id, req, res);
		}catch(error){
			responderError(res, error);
		}
	});

	app.put("/"+nombre+"/:id", autenticar, async(req, res)=>{
		try{
			await updateData(recurso, req.params.id, req, res);
		}catch(error){
			responderError(res, error);
		}
	});

	app.delete("/"+nombre+"/:id", autenticar, async(req, res)=>{
		try{
			await deleteData(recurso, req.params.id, req, res);
		}catch(error){
			responderError(res, error);
		}
	});

	app.post("/"+nombre, autenticar, async(req, res)=>{
		try{
			await createData(recurso, req, res);
		}catch(error){
			responderError(res, error);
		}
	});
}


// Body: username (correo), password, nombre, primerApellido, segundoApellido, rol, estanciaId, regionId.
// chk_usuarios_alcance rechaza combinaciones inválidas de rol/estancia/región (400).
app.post("/registrarse", async(req, res)=>{
	try{
		let correo=req.body.username;
		let pass=req.body.password;
		if(!correo || !pass){
			return res.sendStatus(400);
		}
		let [existentes]=await db.query("SELECT id FROM usuarios WHERE correo=?", [correo]);
		if(existentes.length>0){
			return res.sendStatus(403);
		}
		const hash=await argon2.hash(pass, {type: argon2.argon2id, memoryCost: 64*1024, timeCost:3, parallelism:1, saltLength:128});
		let id=uuidv7();
		await db.query(
			"INSERT INTO usuarios (id, nombre, primer_apellido, segundo_apellido, correo, password_hash, rol, estancia_id, region_id) VALUES (?,?,?,?,?,?,?,?,?)",
			[id, req.body.nombre, req.body.primerApellido, req.body.segundoApellido??null, correo, hash, req.body.rol, req.body.estanciaId??null, req.body.regionId??null]
		);
		await log(null, "CREATE", "usuarios", id, null, {correo: correo, rol: req.body.rol}, req);
		res.sendStatus(201);
	}catch(error){
		responderError(res, error);
	}
});

app.post("/login", async (req, res)=>{
	try{
		let correo=req.body.username;
		let pass=req.body.password;
		let [usuarios]=await db.query("SELECT * FROM usuarios WHERE correo=? AND deleted_at IS NULL", [correo]);
		let data=usuarios[0];
		if(data==null || !data.activo){
			return res.sendStatus(401);
		}
		let sujeto={"usuario": data.id, "rol": data.rol};
		if(data.bloqueado_hasta!=null && data.bloqueado_hasta>new Date()){
			await log(sujeto, "LOGIN", "usuarios", data.id, null, {resultado: "BLOQUEADO"}, req);
			return res.sendStatus(401);
		}
		if(await argon2.verify(data.password_hash, pass)){
			await db.query("UPDATE usuarios SET intentos_fallidos=0, bloqueado_hasta=NULL, ultimo_acceso_en=CURRENT_TIMESTAMP(3) WHERE id=?", [data.id]);
			await log(sujeto, "LOGIN", "usuarios", data.id, null, {resultado: "EXITOSO"}, req);
			let token=jwt.sign(sujeto, process.env.LLAVESECRETA, {expiresIn:900});
			res.json({"token": token, "id": data.id});
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
})

const options={
	key: fs.readFileSync("backend.key"),
	cert: fs.readFileSync("backend.crt")
};

https.createServer(options,app).listen(PORT, async ()=>{
	process.loadEnvFile(".env");
	await connectToDB();
	console.log("Backend corriendo en puerto 3000");
});



/*app.listen(PORT, async ()=>{
	process.loadEnvFile(".env");
	await connectToDB();
	console.log("Backend corriendo en puerto 3000");
});*/
