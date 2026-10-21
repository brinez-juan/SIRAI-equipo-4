const mysql=require("mysql2/promise");
const {db, responderError}=require("./db");
const {log, permitir}=require("./seguridad");

// CRUD genérico para react-admin (ra-data-json-server).
// Un recurso se describe con un objeto:
//   {tabla: "estancias", columnas: [columnas que se pueden escribir], roles: [roles con acceso]}
// Los nombres de columna solo salen de esa configuración, nunca del request, para no inyectar SQL.

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
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

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
async function buscarPorId(recurso, id){
	let [data]=await db.query("SELECT * FROM "+mysql.escapeId(recurso.tabla)+" WHERE id=? AND deleted_at IS NULL", [id]);
	return data[0];
}

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// Lista paginada y ordenada (?_sort=&_order=&_start=&_end=); el total va en X-Total-Count
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

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// Varios registros por id (?id=1&id=2)
async function getMany(recurso, req, res){
	let ids=[].concat(req.query.id);
	let [data]=await db.query("SELECT * FROM "+mysql.escapeId(recurso.tabla)+" WHERE id IN (?) AND deleted_at IS NULL", [ids]);
	res.json(data);
}

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// Registros que apuntan a otro (?estancia_id=3), sin paginar
async function getManyReference(recurso, req, res){
	let {where, valores}=filtros(recurso, req.query);
	let [data]=await db.query("SELECT * FROM "+mysql.escapeId(recurso.tabla)+where, valores);
	res.set("Access-Control-Expose-Headers", "X-Total-Count");
	res.set("X-Total-Count", data.length);
	res.json(data);
}

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
async function getOne(recurso, id, req, res){
	let data=await buscarPorId(recurso, id);
	if(data==null){
		res.sendStatus(404);
	}else{
		res.json(data);
	}
}

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// Solo actualiza las columnas permitidas y guarda en la bitácora el antes y el después
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

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// Borrado lógico: solo llena deleted_at, el registro sigue en la tabla
async function deleteData(recurso, id, req, res){
	let antes=await buscarPorId(recurso, id);
	if(antes==null){
		return res.sendStatus(404);
	}
	await db.query("UPDATE "+mysql.escapeId(recurso.tabla)+" SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", [id]);
	await log(req.usuario, "SOFT_DELETE", recurso.tabla, id, antes, null, req);
	res.json(antes);
}

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
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

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// Registra en el router las 5 rutas de react-admin para un recurso, protegidas por sus roles.
// Ejemplo: registrarRecurso(router, "Estancias", {tabla: "estancias", columnas: [...], roles: ["ADMIN_CENTRAL"]})
function registrarRecurso(router, nombre, recurso){
	recurso.lectura=["id", ...recurso.columnas, "created_at", "updated_at"];
	let soloRoles=permitir(...recurso.roles);

	router.get("/"+nombre, soloRoles, async (req,res)=>{
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

	router.get("/"+nombre+"/:id", soloRoles, async(req, res)=>{
		try{
			await getOne(recurso, req.params.id, req, res);
		}catch(error){
			responderError(res, error);
		}
	});

	router.put("/"+nombre+"/:id", soloRoles, async(req, res)=>{
		try{
			await updateData(recurso, req.params.id, req, res);
		}catch(error){
			responderError(res, error);
		}
	});

	router.delete("/"+nombre+"/:id", soloRoles, async(req, res)=>{
		try{
			await deleteData(recurso, req.params.id, req, res);
		}catch(error){
			responderError(res, error);
		}
	});

	router.post("/"+nombre, soloRoles, async(req, res)=>{
		try{
			await createData(recurso, req, res);
		}catch(error){
			responderError(res, error);
		}
	});
}

module.exports={registrarRecurso};
