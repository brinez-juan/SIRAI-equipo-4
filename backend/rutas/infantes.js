const express=require("express");
const {registrarRecurso}=require("../crud");

const router=express.Router();

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Padrón de infantes de la estancia del usuario (tabla 2.5 del plan): DIRECTORA crea y edita;
// DOCENTE, TRABAJO_SOCIAL y MEDICO solo consultan. estancia_id no está en "columnas":
// lo pone el servidor con el del token y no se puede cambiar desde el request.
registrarRecurso(router, "Infantes", {
	tabla: "infantes",
	columnas: ["matricula", "nombre", "primer_apellido", "segundo_apellido", "fecha_nacimiento"],
	roles: ["DIRECTORA", "DOCENTE", "TRABAJO_SOCIAL", "MEDICO"],
	escritura: ["DIRECTORA"],
	uuid: true,
	porEstancia: true,
	busqueda: ["nombre", "primer_apellido", "segundo_apellido", "matricula"],
});

module.exports=router;
