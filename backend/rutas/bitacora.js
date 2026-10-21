const express=require("express");
const mysql=require("mysql2/promise");
const {db, responderError}=require("../db");
const {permitir}=require("../seguridad");

const router=express.Router();
const soloAdmin=permitir("ADMIN_CENTRAL");

// Columnas que salen al frontend; el nombre del usuario se une de usuarios (NULL = proceso del sistema)
const SELECT="SELECT b.id, b.ts, b.usuario_id, CONCAT_WS(' ', u.nombre, u.primer_apellido) AS usuario_nombre, b.rol, b.ip, b.user_agent,"+
	" b.request_id, b.accion, b.entidad, b.entidad_id, b.antes, b.despues, b.hash_prev, b.hash"+
	" FROM audit_log b LEFT JOIN usuarios u ON u.id=b.usuario_id";
const ORDENABLES=["id", "ts", "accion", "entidad", "rol"];
// Filtros exactos que acepta ?campo=valor
const EXACTOS=["usuario_id", "accion", "rol", "entidad_id"];
// Ciudad de México no tiene horario de verano desde 2022: el día local va de 06:00 a 06:00 UTC
const DESFASE_MX="-06:00";

// [IA] Generado con Claude (prompt #29 en docs/ia/prompts.md). Revisado por: pendiente
// Convierte "AAAA-MM-DD" (día en la hora de México) al instante UTC en que empieza; null si no es una fecha válida.
function inicioDelDia(fecha){
	if(typeof fecha!="string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)){
		return null;
	}
	let instante=new Date(fecha+"T00:00:00"+DESFASE_MX);
	return isNaN(instante)?null:instante;
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// antes/después guardan las filas tal como están en la base, con teléfonos, notas, detalle de la causa y observaciones
// cifrados. El visor no los entrega (ni cifrados): cada columna *_cifrado con valor se muestra como "[cifrado]",
// igual que un password_hash si alguna vez llegara a la bitácora. La bitácora en la base no se toca.
function ocultarCifrados(valor){
	if(Array.isArray(valor)){
		return valor.map(ocultarCifrados);
	}
	if(valor===null || typeof valor!="object"){
		return valor;
	}
	let copia={};
	for(let llave in valor){
		copia[llave]=(llave.endsWith("_cifrado") || llave=="password_hash") && valor[llave]!=null?"[cifrado]":ocultarCifrados(valor[llave]);
	}
	return copia;
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
function paraRespuesta(fila){
	return {...fila, antes: ocultarCifrados(fila.antes), despues: ocultarCifrados(fila.despues)};
}

// [IA] Generado con Claude (prompt #29 en docs/ia/prompts.md). Revisado por: pendiente
// Filtros de react-admin: exactos (usuario, acción, rol, id de entidad), ?entidad= por prefijo (así "/pase-lista"
// encuentra "/pase-lista/123") y ?fecha= / ?fecha_gte= / ?fecha_lte= por día en la hora de México.
// Los nombres de columna salen de las listas de arriba, nunca del request. Devuelve {where, valores} o {error}.
function filtros(query){
	let condiciones=[];
	let valores=[];
	for(let campo of EXACTOS){
		if(typeof query[campo]=="string" && query[campo]!=""){
			condiciones.push("b."+mysql.escapeId(campo)+"=?");
			valores.push(query[campo]);
		}
	}
	if(typeof query.entidad=="string" && query.entidad!=""){
		condiciones.push("b.entidad LIKE ?");
		valores.push(query.entidad.replace(/[\\%_]/g, "\\$&")+"%");
	}
	let desde=query.fecha??query.fecha_gte;
	let hasta=query.fecha??query.fecha_lte;
	for(let [valor, operador, diasExtra] of [[desde, ">=", 0], [hasta, "<", 1]]){
		if(valor==null || valor===""){
			continue;
		}
		let instante=inicioDelDia(valor);
		if(instante==null){
			return {error: "Las fechas deben tener el formato AAAA-MM-DD."};
		}
		condiciones.push("b.ts"+operador+"?");
		valores.push(new Date(instante.getTime()+diasExtra*24*3600*1000));
	}
	return {where: condiciones.length?" WHERE "+condiciones.join(" AND "):"", valores};
}

// [IA] Generado con Claude (prompt #29 en docs/ia/prompts.md), modificado con el prompt #30 (oculta los cifrados). Revisado por: pendiente
// Visor de la bitácora (issue 29), solo ADMIN_CENTRAL y solo lectura: no hay POST, PUT ni DELETE (además,
// los triggers de audit_log rechazan cualquier UPDATE o DELETE). Lista paginada y ordenada como la pide
// react-admin (?_sort=&_order=&_start=&_end=), con el total en X-Total-Count. Por defecto, lo más reciente primero.
router.get("/Bitacora", soloAdmin, async (req, res)=>{
	try{
		let {where, valores, error}=filtros(req.query);
		if(error){
			return res.status(400).json({message: error});
		}
		let sortBy=ORDENABLES.includes(req.query._sort)?req.query._sort:"id";
		let sortOrder=req.query._order=="ASC"?"ASC":"DESC";
		let inicio=Number(req.query._start)||0;
		let fin=Number(req.query._end)||inicio+25;
		let [[{total}]]=await db.query("SELECT COUNT(*) AS total FROM audit_log b"+where, valores);
		let [filas]=await db.query(
			SELECT+where+" ORDER BY b."+mysql.escapeId(sortBy)+" "+sortOrder+", b.id "+sortOrder+" LIMIT ? OFFSET ?",
			[...valores, Math.max(Math.min(fin-inicio, 500), 0), inicio]
		);
		res.set("Access-Control-Expose-Headers", "X-Total-Count");
		res.set("X-Total-Count", total);
		res.json(filas.map(paraRespuesta));
	}catch(error){
		responderError(res, error);
	}
});

// [IA] Generado con Claude (prompt #29 en docs/ia/prompts.md), modificado con el prompt #30 (oculta los cifrados). Revisado por: pendiente
// Un registro con todo su detalle (antes, después y la cadena de hashes).
router.get("/Bitacora/:id", soloAdmin, async (req, res)=>{
	try{
		let [filas]=await db.query(SELECT+" WHERE b.id=?", [req.params.id]);
		if(filas.length==0){
			return res.sendStatus(404);
		}
		res.json(paraRespuesta(filas[0]));
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
