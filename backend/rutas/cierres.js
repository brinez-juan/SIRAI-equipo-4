const express=require("express");
const {db, responderError}=require("../db");
const {log, permitir}=require("../seguridad");
const {hoy, cerrarTurno}=require("../cierreTurno");

const router=express.Router();
const TURNOS=["MATUTINO", "VESPERTINO"];
const CERRADO="El pase de lista ya se cerró.";

// [IA] Generado con Claude (prompt #17 en docs/ia/prompts.md). Revisado por: pendiente
// Solo DIRECTORA cierra el pase de lista (plan, issue 17). El token debe traer estancia: la estancia
// nunca sale del request.
const soloDirectora=[
	permitir("DIRECTORA"),
	(req, res, next)=>req.usuario.estancia_id==null?res.sendStatus(403):next()
];

// [IA] Generado con Claude (prompt #17 en docs/ia/prompts.md). Revisado por: pendiente
// Revisa fecha (AAAA-MM-DD, que exista en el calendario y que no sea futura) y turno. Devuelve un mensaje o null.
// Un día futuro se rechaza porque cerrarlo marcaría como falta a todos los infantes.
function validarCierre(cuerpo){
	let {fecha, turno}=cuerpo;
	if(typeof fecha!="string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || new Date(fecha+"T00:00:00Z").toISOString().slice(0, 10)!=fecha){
		return "La fecha debe tener el formato AAAA-MM-DD.";
	}
	if(!TURNOS.includes(turno)){
		return "El turno debe ser MATUTINO o VESPERTINO.";
	}
	if(fecha>hoy()){
		return "No se puede cerrar el pase de lista de un día futuro.";
	}
	return null;
}

// [IA+Humano] Base generada con Claude (prompt #17); la lógica se movió a cerrarTurno() con el prompt #18
// Cierre manual del pase de lista de un día y turno de MI estancia (automatico = 0, cerrado_por = usuario).
// La transacción con las faltas y los seguimientos está en cerrarTurno() (cierreTurno.js), que comparte con el cierre automático.
// Body: {fecha, turno}. Responde 201 con {cierre, faltas, seguimientos}.
router.post("/cierres", soloDirectora, async (req, res)=>{
	try{
		let cuerpo=req.body??{};
		let invalido=validarCierre(cuerpo);
		if(invalido){
			return res.status(400).json({message: invalido});
		}
		let estanciaId=req.usuario.estancia_id;
		let [turnos]=await db.query("SELECT 1 FROM estancia_turnos WHERE estancia_id=? AND turno=? AND deleted_at IS NULL", [estanciaId, cuerpo.turno]);
		if(turnos.length==0){
			return res.status(400).json({message: "La estancia no opera el turno "+cuerpo.turno+"."});
		}
		let resumen=await cerrarTurno(estanciaId, cuerpo.fecha, cuerpo.turno, req.usuario.usuario);
		if(!resumen){
			return res.status(409).json({message: CERRADO});
		}
		// Una sola entrada para todo el cierre, con los ids de lo que creó (en vez de cientos de entradas en la cadena de hashes)
		await log(req.usuario, "CREATE", "cierres_pase_lista", resumen.cierre.id, null, {...resumen.cierre, estancia_id: estanciaId, asistencias_falta_creadas: resumen.faltas, seguimientos_creados: resumen.seguimientos}, req);
		res.status(201).json({cierre: resumen.cierre, faltas: resumen.faltas.length, seguimientos: resumen.seguimientos.length});
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
