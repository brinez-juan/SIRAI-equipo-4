const express=require("express");
const {registrarRecurso}=require("../crud");

const router=express.Router();

// [IA] Generado con Claude (prompt #3 en docs/ia/prompts.md). Revisado por: pendiente
// Regiones y estancias: solo el administrador central las consulta y modifica.
registrarRecurso(router, "Regiones", {
	tabla: "regiones",
	columnas: ["nombre"],
	roles: ["ADMIN_CENTRAL"],
});

registrarRecurso(router, "Estancias", {
	tabla: "estancias",
	columnas: ["region_id", "clave", "nombre", "direccion", "max_sesiones"],
	roles: ["ADMIN_CENTRAL"],
});

module.exports=router;
