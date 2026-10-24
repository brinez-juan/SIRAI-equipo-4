const express=require("express");
const {db, responderError}=require("../db");
const {permitir}=require("../seguridad");

const router=express.Router();

// Catálogo de causas de inasistencia con su asesoría, para el formulario de clasificación. Es de solo lectura y
// lo usa quien clasifica (TRABAJO_SOCIAL, MEDICO, DIRECTORA); DOCENTE no ve seguimientos. No tiene datos de infantes.
router.get("/causas", permitir("TRABAJO_SOCIAL", "MEDICO", "DIRECTORA"), async (req, res)=>{
	try{
		let [causas]=await db.query(
			"SELECT codigo, nombre, asesoria, requiere_alta, justifica_falta, notifica_emergencia FROM causas_inasistencia ORDER BY nombre"
		);
		res.json(causas);
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
