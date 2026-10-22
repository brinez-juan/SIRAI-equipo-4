const mysql=require("mysql2/promise");
const {db, uuidv7, responderError}=require("./db");
const {log, permitir}=require("./seguridad");
const {cifrar, descifrar}=require("./cifrado");

// CRUD genérico para react-admin (ra-data-json-server).
// Un recurso se describe con un objeto:
//   {tabla: "estancias", columnas: [columnas que se pueden escribir], roles: [roles con acceso]}
// Opcional: cifrados: ["telefono_cifrado"], columnas (ya incluidas en "columnas") que se cifran al
// escribir y se descifran solo en la respuesta. En la base y en audit_log quedan siempre cifradas.
// Opcional: escritura: [roles], los que pueden crear, editar y borrar (por defecto, los mismos de "roles").
// Opcional: uuid: true, el id es CHAR(36) y se genera con uuidv7() (tablas sin AUTO_INCREMENT).
// Opcional: porEstancia: true, todo se filtra y se asigna con req.usuario.estancia_id (el del token),
// nunca con la estancia que mande el request; un usuario sin estancia recibe 403.
// Opcional: busqueda: [columnas], el ?q= de react-admin busca con LIKE en esas columnas unidas.
// Opcional: alcance: (req)=>({sql, valores}), para tablas sin estancia_id propio (ej. tutores). Devuelve una
// condición " AND ..." con "?" que se aplica a toda lectura, edición y borrado; debe salir del token
// (req.usuario.estancia_id), nunca del request. Igual que porEstancia, un usuario sin estancia recibe 403.
// Opcional: validar: (req, creando)=>mensaje|null, revisa el body antes de escribir; si devuelve un mensaje, responde 400.
// Opcional: alCrear: async (conexion, req, id)=>[{tabla, id, fila}], corre en la misma transacción que el INSERT
// (si falla, no se guarda nada) y devuelve las filas extra que insertó para registrarlas en audit_log.
// Opcional: alBorrar: async (id)=>mensaje|null, revisa antes del borrado lógico; si devuelve un mensaje, responde 409
// (por ejemplo, una región que todavía tiene estancias activas).
// Opcional: reactivable: true, lo desactivado (borrado lógico) se puede volver a activar: la lista acepta
// ?desactivadas=true para ver solo esos registros y POST /<nombre>/:id/activar limpia deleted_at.
// Opcional: alActivar: async (fila)=>mensaje|null, revisa antes de activar; si devuelve un mensaje, responde 409.
// Los nombres de columna solo salen de esa configuración, nunca del request, para no inyectar SQL.

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Copia de la fila con las columnas cifradas ya descifradas, para responder al cliente.
// La fila original no se toca: es la que va a la bitácora, que nunca debe guardar texto en claro.
function paraRespuesta(recurso, fila){
	if(fila==null || !recurso.cifrados){
		return fila;
	}
	let copia={...fila};
	for(let campo of recurso.cifrados){
		copia[campo]=descifrar(copia[campo]);
	}
	return copia;
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Valores a escribir en la base: las columnas cifradas se cifran aquí, antes de armar el SQL.
function valoresParaEscribir(recurso, campos, body){
	return campos.map(campo=>(recurso.cifrados??[]).includes(campo)?cifrar(body[campo]):body[campo]);
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Condición extra para recursos porEstancia (solo filas de la estancia del token) o con "alcance" propio.
function deMiEstancia(recurso, req){
	if(recurso.alcance){
		return recurso.alcance(req);
	}
	return recurso.porEstancia?{sql: " AND estancia_id=?", valores: [req.usuario.estancia_id]}:{sql: "", valores: []};
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Filtros de react-admin (?campo=valor), solo sobre columnas conocidas; excluye borrados lógicos.
// Un campo repetido (?campo=1&campo=2) llega como arreglo y se filtra con IN; antes armaba "campo=1, 2" y daba 500.
// ?q= busca texto en las columnas de "busqueda"; %, _ y \ se escapan para que el usuario no arme comodines.
// Modificado con el prompt #41: en un recurso reactivable, ?desactivadas=true lista solo los borrados lógicos.
function filtros(recurso, query, req){
	let desactivadas=recurso.reactivable && query.desactivadas=="true";
	let condiciones=[desactivadas?"deleted_at IS NOT NULL":"deleted_at IS NULL"];
	let valores=[];
	for(let campo in query){
		if(recurso.lectura.includes(campo)){
			condiciones.push(mysql.escapeId(campo)+(Array.isArray(query[campo])?" IN (?)":"=?"));
			valores.push(query[campo]);
		}
	}
	if(recurso.busqueda && typeof query.q=="string" && query.q.trim()!=""){
		condiciones.push("CONCAT_WS(' ', "+recurso.busqueda.map(campo=>mysql.escapeId(campo)).join(", ")+") LIKE ?");
		valores.push("%"+query.q.trim().replace(/[\\%_]/g, "\\$&")+"%");
	}
	let estancia=deMiEstancia(recurso, req);
	return {where: " WHERE "+condiciones.join(" AND ")+estancia.sql, valores: [...valores, ...estancia.valores]};
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// En recursos porEstancia, un id de otra estancia se comporta como si no existiera (404).
async function buscarPorId(recurso, id, req){
	let estancia=deMiEstancia(recurso, req);
	let [data]=await db.query("SELECT * FROM "+mysql.escapeId(recurso.tabla)+" WHERE id=? AND deleted_at IS NULL"+estancia.sql, [id, ...estancia.valores]);
	return data[0];
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Lista paginada y ordenada (?_sort=&_order=&_start=&_end=); el total va en X-Total-Count
async function getList(recurso, req, res){
	let sortBy=recurso.lectura.includes(req.query._sort)?req.query._sort:"id";
	let sortOrder=req.query._order=="ASC"?"ASC":"DESC";
	let inicio=Number(req.query._start)||0;
	let fin=Number(req.query._end)||inicio+25;
	let {where, valores}=filtros(recurso, req.query, req);
	let tabla=mysql.escapeId(recurso.tabla);
	let [[{total}]]=await db.query("SELECT COUNT(*) AS total FROM "+tabla+where, valores);
	let [data]=await db.query(
		"SELECT * FROM "+tabla+where+" ORDER BY "+mysql.escapeId(sortBy)+" "+sortOrder+" LIMIT ? OFFSET ?",
		[...valores, Math.max(fin-inicio, 0), inicio]
	);
	res.set("Access-Control-Expose-Headers", "X-Total-Count");
	res.set("X-Total-Count", total);
	res.json(data.map(fila=>paraRespuesta(recurso, fila)));
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Varios registros por id (?id=1&id=2)
// Modificado con el prompt #41: en un recurso reactivable también trae los desactivados, para que una referencia
// (la región de una estancia desactivada, la estancia de un usuario) siga mostrando su nombre.
async function getMany(recurso, req, res){
	let ids=[].concat(req.query.id);
	let estancia=deMiEstancia(recurso, req);
	let vigentes=recurso.reactivable?"":" AND deleted_at IS NULL";
	let [data]=await db.query("SELECT * FROM "+mysql.escapeId(recurso.tabla)+" WHERE id IN (?)"+vigentes+estancia.sql, [ids, ...estancia.valores]);
	res.json(data.map(fila=>paraRespuesta(recurso, fila)));
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Registros que apuntan a otro (?estancia_id=3), sin paginar
async function getManyReference(recurso, req, res){
	let {where, valores}=filtros(recurso, req.query, req);
	let [data]=await db.query("SELECT * FROM "+mysql.escapeId(recurso.tabla)+where, valores);
	res.set("Access-Control-Expose-Headers", "X-Total-Count");
	res.set("X-Total-Count", data.length);
	res.json(data.map(fila=>paraRespuesta(recurso, fila)));
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
async function getOne(recurso, id, req, res){
	let data=await buscarPorId(recurso, id, req);
	if(data==null){
		res.sendStatus(404);
	}else{
		res.json(paraRespuesta(recurso, data));
	}
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Solo actualiza las columnas permitidas y guarda en la bitácora el antes y el después
async function updateData(recurso, id, req, res){
	let invalido=recurso.validar?.(req, false);
	if(invalido){
		return res.status(400).json({message: invalido});
	}
	let antes=await buscarPorId(recurso, id, req);
	if(antes==null){
		return res.sendStatus(404);
	}
	let campos=recurso.columnas.filter(campo=>campo in req.body);
	let asignaciones=campos.map(campo=>mysql.escapeId(campo)+"=?").concat("updated_at=CURRENT_TIMESTAMP(3)");
	await db.query(
		"UPDATE "+mysql.escapeId(recurso.tabla)+" SET "+asignaciones.join(", ")+" WHERE id=? AND deleted_at IS NULL",
		[...valoresParaEscribir(recurso, campos, req.body), id]
	);
	let data=await buscarPorId(recurso, id, req);
	await log(req.usuario, "UPDATE", recurso.tabla, id, antes, data, req);
	res.json(paraRespuesta(recurso, data));
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Borrado lógico: solo llena deleted_at, el registro sigue en la tabla
// Modificado con el prompt #41: si el recurso tiene alBorrar y devuelve un mensaje, no se borra (409).
async function deleteData(recurso, id, req, res){
	let antes=await buscarPorId(recurso, id, req);
	if(antes==null){
		return res.sendStatus(404);
	}
	let impedimento=await recurso.alBorrar?.(antes.id);
	if(impedimento){
		return res.status(409).json({message: impedimento});
	}
	await db.query("UPDATE "+mysql.escapeId(recurso.tabla)+" SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", [id]);
	await log(req.usuario, "SOFT_DELETE", recurso.tabla, id, antes, null, req);
	res.json(paraRespuesta(recurso, antes));
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Deshace el borrado lógico de un recurso reactivable: limpia deleted_at. 404 si no existe o no está desactivado;
// 409 si alActivar lo impide (por ejemplo, una estancia cuya región sigue desactivada).
async function activarData(recurso, id, req, res){
	let estancia=deMiEstancia(recurso, req);
	let [filas]=await db.query("SELECT * FROM "+mysql.escapeId(recurso.tabla)+" WHERE id=? AND deleted_at IS NOT NULL"+estancia.sql, [id, ...estancia.valores]);
	let antes=filas[0];
	if(antes==null){
		return res.sendStatus(404);
	}
	let impedimento=await recurso.alActivar?.(antes);
	if(impedimento){
		return res.status(409).json({message: impedimento});
	}
	await db.query("UPDATE "+mysql.escapeId(recurso.tabla)+" SET deleted_at=NULL, updated_at=CURRENT_TIMESTAMP(3) WHERE id=?", [antes.id]);
	let data=await buscarPorId(recurso, antes.id, req);
	await log(req.usuario, "REACTIVAR", recurso.tabla, antes.id, antes, data, req);
	res.json(paraRespuesta(recurso, data));
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// id (uuid) y estancia_id (porEstancia) los pone el servidor; lo que mande el request
// en esos campos se ignora. Con "alCrear", el INSERT y las filas extra van en una transacción: o se guardan todas o ninguna.
async function createData(recurso, req, res){
	let invalido=recurso.validar?.(req, true);
	if(invalido){
		return res.status(400).json({message: invalido});
	}
	let campos=recurso.columnas.filter(campo=>campo in req.body);
	let valores=valoresParaEscribir(recurso, campos, req.body);
	campos.push("created_by");
	valores.push(req.usuario.usuario);
	let id=recurso.uuid?uuidv7():null;
	if(recurso.uuid){
		campos.push("id");
		valores.push(id);
	}
	if(recurso.porEstancia){
		campos.push("estancia_id");
		valores.push(req.usuario.estancia_id);
	}
	let sql="INSERT INTO "+mysql.escapeId(recurso.tabla)+" ("+campos.map(campo=>mysql.escapeId(campo)).join(", ")+") VALUES (?)";
	let resultado;
	let extras=[];
	if(recurso.alCrear){
		let conexion=await db.getConnection();
		try{
			await conexion.beginTransaction();
			[resultado]=await conexion.query(sql, [valores]);
			extras=await recurso.alCrear(conexion, req, id);
			await conexion.commit();
		}catch(error){
			await conexion.rollback();
			throw error;
		}finally{
			conexion.release();
		}
	}else{
		[resultado]=await db.query(sql, [valores]);
	}
	let data=await buscarPorId(recurso, recurso.uuid?id:resultado.insertId, req);
	await log(req.usuario, "CREATE", recurso.tabla, data.id, null, data, req);
	for(let extra of extras){
		await log(req.usuario, "CREATE", extra.tabla, extra.id, null, extra.fila, req);
	}
	res.status(201).json(paraRespuesta(recurso, data));
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Registra en el router las 5 rutas de react-admin para un recurso, protegidas por sus roles.
// GET para "roles"; POST, PUT y DELETE solo para "escritura" (si se indica).
// Modificado con el prompt #41: un recurso reactivable agrega POST /<nombre>/:id/activar, también solo para "escritura".
// Ejemplo: registrarRecurso(router, "Estancias", {tabla: "estancias", columnas: [...], roles: ["ADMIN_CENTRAL"]})
function registrarRecurso(router, nombre, recurso){
	// Las columnas cifradas no sirven para filtrar ni ordenar: en la base solo hay texto cifrado.
	recurso.lectura=["id", ...recurso.columnas.filter(campo=>!(recurso.cifrados??[]).includes(campo)), "created_at", "updated_at"];
	let conEstancia=(req, res, next)=>(recurso.porEstancia || recurso.alcance) && req.usuario.estancia_id==null?res.sendStatus(403):next();
	let soloRoles=[permitir(...recurso.roles), conEstancia];
	let soloEscritura=[permitir(...(recurso.escritura??recurso.roles)), conEstancia];

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

	router.put("/"+nombre+"/:id", soloEscritura, async(req, res)=>{
		try{
			await updateData(recurso, req.params.id, req, res);
		}catch(error){
			responderError(res, error);
		}
	});

	router.delete("/"+nombre+"/:id", soloEscritura, async(req, res)=>{
		try{
			await deleteData(recurso, req.params.id, req, res);
		}catch(error){
			responderError(res, error);
		}
	});

	router.post("/"+nombre, soloEscritura, async(req, res)=>{
		try{
			await createData(recurso, req, res);
		}catch(error){
			responderError(res, error);
		}
	});

	if(recurso.reactivable){
		router.post("/"+nombre+"/:id/activar", soloEscritura, async(req, res)=>{
			try{
				await activarData(recurso, req.params.id, req, res);
			}catch(error){
				responderError(res, error);
			}
		});
	}
}

module.exports={registrarRecurso};
