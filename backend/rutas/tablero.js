const express=require("express");
const {db, responderError}=require("../db");
const {permitir}=require("../seguridad");

const router=express.Router();

// Umbrales del semáforo (porcentaje de infantes presentes): verde >= 90, amarillo >= 75, rojo < 75
const UMBRAL_VERDE=90;
const UMBRAL_AMARILLO=75;

// Solo SUPERVISOR (su región) y ADMIN_CENTRAL (todas). Un SUPERVISOR sin región se rechaza con 403: el esquema
// (chk_usuarios_alcance) lo permite, y tratarlo como "sin filtro" le mostraría todas las estancias.
const acceso=[
	permitir("SUPERVISOR", "ADMIN_CENTRAL"),
	(req, res, next)=>req.usuario.rol=="SUPERVISOR" && req.usuario.region_id==null?res.sendStatus(403):next()
];

// Fecha de hoy (AAAA-MM-DD) en la hora local de México, que es el "día" de asistencias.fecha.
function hoy(){
	return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(new Date());
}

// El color sale del porcentaje exacto, no del redondeado. Sin infantes no hay porcentaje: SIN_DATOS.
function semaforo(total, presentes){
	if(total==0){
		return "SIN_DATOS";
	}
	let porcentaje=presentes*100/total;
	return porcentaje>=UMBRAL_VERDE?"VERDE":porcentaje>=UMBRAL_AMARILLO?"AMARILLO":"ROJO";
}

// Porcentaje con un decimal, truncado y no redondeado: 89.96 % se muestra 89.9 y no 90.0, así el número que se ve
// nunca contradice el color. null si la estancia no tiene infantes.
function porcentaje(total, presentes){
	return total==0?null:Math.floor(presentes*1000/total)/10;
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Tablero de asistencia por estancia para un día (?fecha=AAAA-MM-DD, por defecto hoy): infantes activos,
// infantes presentes (con al menos un registro PRESENTE ese día, en cualquier turno), porcentaje y semáforo.
// ANONIMIZADO: la consulta solo cuenta; no lee ni devuelve nombres, matrículas ni ids de infantes.
// Cada fila lleva exactamente {estancia, total, presentes, porcentaje, semaforo}; "estancia" es su nombre.
router.get("/tablero", acceso, async (req, res)=>{
	try{
		let fecha=req.query.fecha??hoy();
		if(typeof fecha!="string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || new Date(fecha+"T00:00:00Z").toISOString().slice(0, 10)!=fecha){
			return res.status(400).json({message: "La fecha debe tener el formato AAAA-MM-DD."});
		}
		if(fecha>hoy()){
			return res.status(400).json({message: "No hay tablero de un día futuro."});
		}
		let porRegion=req.usuario.rol=="SUPERVISOR";
		let [filas]=await db.query(
			"SELECT e.nombre AS estancia,"+
			" (SELECT COUNT(*) FROM infantes i WHERE i.estancia_id=e.id AND i.deleted_at IS NULL) AS total,"+
			" (SELECT COUNT(DISTINCT a.infante_id) FROM asistencias a JOIN infantes i ON i.id=a.infante_id AND i.deleted_at IS NULL"+
			"  WHERE a.estancia_id=e.id AND a.fecha=? AND a.estado_codigo='PRESENTE' AND a.deleted_at IS NULL) AS presentes"+
			" FROM estancias e WHERE e.deleted_at IS NULL"+(porRegion?" AND e.region_id=?":"")+" ORDER BY e.nombre",
			porRegion?[fecha, req.usuario.region_id]:[fecha]
		);
		res.json(filas.map(fila=>({
			estancia: fila.estancia,
			total: Number(fila.total),
			presentes: Number(fila.presentes),
			porcentaje: porcentaje(Number(fila.total), Number(fila.presentes)),
			semaforo: semaforo(Number(fila.total), Number(fila.presentes)),
		})));
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
