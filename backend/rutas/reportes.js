const express=require("express");
const {db, responderError}=require("../db");
const {permitir}=require("../seguridad");

const router=express.Router();

// Un trimestre tiene a lo más 92 días; con un año de tope cabe cualquier corte sin dejar pedir rangos enormes.
const MAX_DIAS=366;

// [IA] Generado con Claude (prompt #28 en docs/ia/prompts.md). Revisado por: pendiente
// DIRECTORA (su estancia), SUPERVISOR (su región) y ADMIN_CENTRAL (todas). Un token sin el alcance que su rol
// necesita se rechaza con 403: tratarlo como "sin filtro" le mostraría todas las estancias.
const acceso=[
	permitir("DIRECTORA", "SUPERVISOR", "ADMIN_CENTRAL"),
	(req, res, next)=>(req.usuario.rol=="DIRECTORA" && req.usuario.estancia_id==null) || (req.usuario.rol=="SUPERVISOR" && req.usuario.region_id==null)?res.sendStatus(403):next()
];

// [IA] Generado con Claude (prompt #28 en docs/ia/prompts.md). Revisado por: pendiente
// AAAA-MM-DD y que exista en el calendario (igual que esFecha en historial.js)
function esFecha(valor){
	return typeof valor=="string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && new Date(valor+"T00:00:00Z").toISOString().slice(0, 10)==valor;
}

// [IA] Generado con Claude (prompt #28 en docs/ia/prompts.md). Revisado por: pendiente
// Celda de CSV: entre comillas si trae coma, comillas o salto de línea. Si empieza con = + - @ (o tab/retorno)
// se le antepone un apóstrofo para que Excel no la ejecute como fórmula (inyección de CSV).
function celda(valor){
	let texto=String(valor??"");
	if(/^[=+\-@\t\r]/.test(texto)){
		texto="'"+texto;
	}
	return /[",\r\n]/.test(texto)?'"'+texto.replaceAll('"', '""')+'"':texto;
}

// [IA] Generado con Claude (prompt #28 en docs/ia/prompts.md). Revisado por: pendiente
// Corte de asistencia agregado por estancia y día (?desde=&hasta=, AAAA-MM-DD, ambos incluidos): cuántos registros
// hubo de cada estado del catálogo, sumando los dos turnos. Solo días con al menos un registro.
// ANONIMIZADO: la consulta solo cuenta; no lee nombres, matrículas ni ids de infantes.
// Por defecto responde un CSV (UTF-8 con BOM para que Excel respete los acentos); con ?formato=json responde
// {estados, filas} para la tabla de la pantalla de reportes.
router.get("/reportes/asistencia", acceso, async (req, res)=>{
	try{
		let {desde, hasta}=req.query;
		let formato=req.query.formato??"csv";
		if(!esFecha(desde) || !esFecha(hasta)){
			return res.status(400).json({message: "desde y hasta deben tener el formato AAAA-MM-DD."});
		}
		if(desde>hasta){
			return res.status(400).json({message: "desde no puede ser posterior a hasta."});
		}
		if((Date.parse(hasta)-Date.parse(desde))/86400000+1>MAX_DIAS){
			return res.status(400).json({message: "El rango no puede pasar de "+MAX_DIAS+" días."});
		}
		if(!["csv", "json"].includes(formato)){
			return res.status(400).json({message: "El formato debe ser csv o json."});
		}
		// El alcance sale del token, nunca del request
		let alcance="";
		let valores=[desde, hasta];
		if(req.usuario.rol=="DIRECTORA"){
			alcance=" AND e.id=?";
			valores.push(req.usuario.estancia_id);
		}else if(req.usuario.rol=="SUPERVISOR"){
			alcance=" AND e.region_id=?";
			valores.push(req.usuario.region_id);
		}
		let [estados]=await db.query("SELECT codigo, nombre FROM estados_asistencia ORDER BY codigo='PRESENTE' DESC, nombre");
		let [conteos]=await db.query(
			"SELECT DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, r.nombre AS region, e.clave, e.nombre AS estancia, a.estado_codigo, COUNT(*) AS cantidad"+
			" FROM asistencias a JOIN estancias e ON e.id=a.estancia_id JOIN regiones r ON r.id=e.region_id"+
			" WHERE a.fecha BETWEEN ? AND ? AND a.deleted_at IS NULL AND e.deleted_at IS NULL"+alcance+
			" GROUP BY a.fecha, e.id, a.estado_codigo ORDER BY a.fecha, e.nombre",
			valores
		);
		// Una fila por (día, estancia) con un conteo por cada estado del catálogo, en 0 si no hubo
		let filas=[];
		let porLlave={};
		for(let conteo of conteos){
			let llave=conteo.fecha+"|"+conteo.clave;
			if(!porLlave[llave]){
				porLlave[llave]={fecha: conteo.fecha, region: conteo.region, clave: conteo.clave, estancia: conteo.estancia, conteos: {}, total: 0};
				for(let estado of estados){
					porLlave[llave].conteos[estado.codigo]=0;
				}
				filas.push(porLlave[llave]);
			}
			porLlave[llave].conteos[conteo.estado_codigo]=Number(conteo.cantidad);
			porLlave[llave].total+=Number(conteo.cantidad);
		}
		if(formato=="json"){
			return res.json({estados, filas});
		}
		let lineas=[["Fecha", "Región", "Clave", "Estancia", ...estados.map(estado=>estado.nombre), "Total de registros"]];
		for(let fila of filas){
			lineas.push([fila.fecha, fila.region, fila.clave, fila.estancia, ...estados.map(estado=>fila.conteos[estado.codigo]), fila.total]);
		}
		res.set("Content-Type", "text/csv; charset=utf-8");
		res.set("Content-Disposition", 'attachment; filename="asistencia_'+desde+'_'+hasta+'.csv"');
		res.send("﻿"+lineas.map(linea=>linea.map(celda).join(",")).join("\r\n")+"\r\n");
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
