const express=require("express");
const {db}=require("../db");
const {registrarRecurso}=require("../crud");

const router=express.Router();

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Cuántas filas activas (sin borrado lógico) de cada tabla apuntan a un id. "dependientes" es
// [[tabla, columna, texto], ...] fijo en este archivo, nunca del request. Devuelve el mensaje para el 409,
// o null si no hay nada activo y se puede desactivar.
async function sinDependientes(id, dependientes, que){
	let encontrados=[];
	for(let [tabla, columna, texto] of dependientes){
		let [[{total}]]=await db.query("SELECT COUNT(*) AS total FROM ?? WHERE ??=? AND deleted_at IS NULL", [tabla, columna, id]);
		if(total>0){
			encontrados.push(total+" "+texto);
		}
	}
	return encontrados.length==0?null:"No se puede desactivar "+que+": todavía tiene "+encontrados.join(" y ")+". Muévalos a otra o desactívelos primero.";
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Una estancia solo se activa si su región está activa; si no, quedaría viva dentro de una región que no aparece.
async function regionActiva(estancia){
	let [[region]]=await db.query("SELECT nombre, deleted_at FROM regiones WHERE id=?", [estancia.region_id]);
	return region.deleted_at==null?null:"No se puede activar la estancia: su región ("+region.nombre+") está desactivada. Active primero la región.";
}

// [IA+Humano] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Regiones y estancias: solo el administrador central las consulta y modifica.
// Desactivar es el borrado lógico del CRUD; se rechaza mientras tengan estancias, infantes o usuarios activos,
// para no dejar registros vivos apuntando a una región o estancia que ya no aparece. Son reactivables:
// POST /Regiones/:id/activar y POST /Estancias/:id/activar las regresan con sus mismos datos.
registrarRecurso(router, "Regiones", {
	tabla: "regiones",
	columnas: ["nombre"],
	roles: ["ADMIN_CENTRAL"],
	reactivable: true,
	alBorrar: id=>sinDependientes(id, [["estancias", "region_id", "estancia(s)"], ["usuarios", "region_id", "usuario(s)"]], "la región"),
});

registrarRecurso(router, "Estancias", {
	tabla: "estancias",
	columnas: ["region_id", "clave", "nombre", "direccion", "max_sesiones"],
	roles: ["ADMIN_CENTRAL"],
	reactivable: true,
	alBorrar: id=>sinDependientes(id, [["infantes", "estancia_id", "infante(s)"], ["usuarios", "estancia_id", "usuario(s)"]], "la estancia"),
	alActivar: regionActiva,
});

module.exports=router;
