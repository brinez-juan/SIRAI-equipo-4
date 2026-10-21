const express=require("express");
const {db, responderError}=require("../db");
const {permitir}=require("../seguridad");
const {descifrar}=require("../cifrado");
// Feature 42: quién lee la nota de la justificación y cómo se registra esa lectura (definidos en asistencia.js)
const {LEEN_NOTA, registrarLecturaDeNotas}=require("./asistencia");

const router=express.Router();
const TURNOS=["MATUTINO", "VESPERTINO"];

// [IA] Generado con Claude (prompt #19 en docs/ia/prompts.md). Revisado por: pendiente
// Tabla 2.5 del plan: todos los roles de estancia consultan asistencia. El token debe traer estancia.
const conEstancia=(req, res, next)=>req.usuario.estancia_id==null?res.sendStatus(403):next();
const lectura=[permitir("DOCENTE", "DIRECTORA", "TRABAJO_SOCIAL", "MEDICO"), conEstancia];

// Columnas por las que react-admin puede ordenar (?_sort=) y su nombre real en el SQL.
// El SQL del ORDER BY solo sale de aquí, nunca del request.
const ORDEN={
	fecha: "a.fecha",
	turno: "a.turno",
	estado_codigo: "a.estado_codigo",
	matricula: "i.matricula",
	primer_apellido: "i.primer_apellido",
	hora_entrada: "a.hora_entrada",
	hora_salida: "a.hora_salida",
};

// [IA] Generado con Claude (prompt #19 en docs/ia/prompts.md). Revisado por: pendiente
// AAAA-MM-DD y que exista en el calendario (igual que validarDia en asistencia.js)
function esFecha(valor){
	return typeof valor=="string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && new Date(valor+"T00:00:00Z").toISOString().slice(0, 10)==valor;
}

// [IA] Generado con Claude (prompt #19 en docs/ia/prompts.md). Revisado por: pendiente
// Filtros de la lista: ?fecha= (un día), ?fecha_gte= y ?fecha_lte= (rango), ?turno=.
// La estancia siempre es la del token. Devuelve {where, valores} o {error} para responder 400.
function filtros(query, req){
	let condiciones=["a.estancia_id=?", "a.deleted_at IS NULL"];
	let valores=[req.usuario.estancia_id];
	let fechas={fecha: "a.fecha=?", fecha_gte: "a.fecha>=?", fecha_lte: "a.fecha<=?"};
	for(let campo in fechas){
		if(campo in query){
			if(!esFecha(query[campo])){
				return {error: "La fecha debe tener el formato AAAA-MM-DD."};
			}
			condiciones.push(fechas[campo]);
			valores.push(query[campo]);
		}
	}
	if("turno" in query){
		if(!TURNOS.includes(query.turno)){
			return {error: "El turno debe ser MATUTINO o VESPERTINO."};
		}
		condiciones.push("a.turno=?");
		valores.push(query.turno);
	}
	return {where: " WHERE "+condiciones.join(" AND "), valores};
}

// [IA+Humano] Base generada con Claude (prompt #19 en docs/ia/prompts.md), modificada con el prompt #42. Revisado por: pendiente
// Historial de asistencia de mi estancia, paginado como lo pide react-admin (?_sort=&_order=&_start=&_end=).
// fecha sale como texto AAAA-MM-DD: es un DATE y como objeto Date se correría un día en la hora de México.
// Feature 42: cada renglón trae justificacion_causa_nombre (el motivo de un AUSENTE_JUSTIFICADO) para todos, y
// justificacion_nota descifrada solo para LEEN_NOTA; cada nota que sale queda como READ_CONFIDENCIAL de su asistencia.
router.get("/Asistencias", lectura, async (req, res)=>{
	try{
		let {where, valores, error}=filtros(req.query, req);
		if(error){
			return res.status(400).json({message: error});
		}
		let sortBy=ORDEN[req.query._sort]??ORDEN.fecha;
		let sortOrder=req.query._order=="ASC"?"ASC":"DESC";
		let inicio=Number(req.query._start)||0;
		let fin=Number(req.query._end)||inicio+25;
		let desde=" FROM asistencias a JOIN infantes i ON i.id=a.infante_id JOIN estados_asistencia e ON e.codigo=a.estado_codigo"+
			" LEFT JOIN causas_inasistencia c ON c.codigo=a.justificacion_causa_codigo";
		let [[{total}]]=await db.query("SELECT COUNT(*) AS total"+desde+where, valores);
		let [filas]=await db.query(
			"SELECT a.id, DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, a.turno, a.estado_codigo, e.nombre AS estado_nombre,"+
			" a.justificacion_causa_codigo, c.nombre AS justificacion_causa_nombre, a.justificacion_cifrado,"+
			" a.hora_entrada, a.hora_salida, a.infante_id, i.matricula, i.nombre, i.primer_apellido, i.segundo_apellido"+
			desde+where+" ORDER BY "+sortBy+" "+sortOrder+", i.primer_apellido ASC, a.id ASC LIMIT ? OFFSET ?",
			[...valores, Math.max(fin-inicio, 0), inicio]
		);
		let leeNota=LEEN_NOTA.includes(req.usuario.rol);
		await registrarLecturaDeNotas(req, filas.filter(fila=>fila.justificacion_cifrado!=null).map(fila=>fila.id));
		res.set("Access-Control-Expose-Headers", "X-Total-Count");
		res.set("X-Total-Count", total);
		res.json(filas.map(({justificacion_cifrado, ...fila})=>leeNota?{...fila, justificacion_nota: descifrar(justificacion_cifrado)}:fila));
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
