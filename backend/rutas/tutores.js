const express=require("express");
const {registrarRecurso}=require("../crud");
const {uuidv7}=require("../db");

const router=express.Router();
const VERSION_AVISO="2026.1";

// [IA] Generado con Claude (prompt #10 en docs/ia/prompts.md). Revisado por: pendiente
// tutores no tiene estancia_id: la estancia llega por el vínculo infante_tutor. Un usuario ve los tutores
// vinculados a infantes de SU estancia (la del token) y los que creó alguien de su estancia y aún no
// tienen vínculo (el vínculo se agrega después, issue 11). Nunca se usa una estancia que mande el request.
function alcanceTutores(req){
	let estancia=req.usuario.estancia_id;
	return {
		sql: " AND (id IN (SELECT it.tutor_id FROM infante_tutor it JOIN infantes i ON i.id=it.infante_id"
			+" WHERE it.deleted_at IS NULL AND i.deleted_at IS NULL AND i.estancia_id=?)"
			+" OR created_by IN (SELECT u.id FROM usuarios u WHERE u.estancia_id=?))",
		valores: [estancia, estancia]
	};
}

// [IA] Generado con Claude (prompt #10 en docs/ia/prompts.md). Revisado por: pendiente
// Revisa el body antes de tocar la base. Al crear exige nombre, primer apellido, teléfono y la casilla del
// aviso de privacidad (debe ser el booleano true, no el texto "true"). Al editar solo revisa lo que venga.
// Exigir string evita que un objeto o arreglo llegue a la consulta SQL.
function validarTutor(req, creando){
	let cuerpo=req.body??{};
	let obligatorios=["nombre", "primer_apellido", "telefono_cifrado"];
	let opcionales=["segundo_apellido", "correo"];
	for(let campo of obligatorios){
		let viene=campo in cuerpo;
		if(!viene && creando){
			return "Falta "+campo+".";
		}
		if(viene && (typeof cuerpo[campo]!="string" || cuerpo[campo].trim()=="")){
			return campo+" debe ser un texto no vacío.";
		}
	}
	for(let campo of opcionales){
		if(campo in cuerpo && cuerpo[campo]!=null && typeof cuerpo[campo]!="string"){
			return campo+" no es un texto válido.";
		}
	}
	if("telefono_cifrado" in cuerpo && !/^[0-9+()\s-]{7,20}$/.test(cuerpo.telefono_cifrado.trim())){
		return "El teléfono debe tener entre 7 y 20 caracteres: números, +, -, paréntesis o espacios.";
	}
	if(creando && cuerpo.acepta_aviso!==true){
		return "Debe aceptarse el aviso de privacidad y el contacto telefónico.";
	}
	return null;
}

// [IA] Generado con Claude (prompt #10 en docs/ia/prompts.md). Revisado por: pendiente
// Inserta el consentimiento en la misma transacción que el tutor, con la versión vigente del aviso y el
// usuario que lo registró (del token). Devuelve la fila para que createData la registre en audit_log.
async function registrarConsentimiento(conexion, req, tutorId){
	let id=uuidv7();
	let usuario=req.usuario.usuario;
	await conexion.query(
		"INSERT INTO consentimientos (id, tutor_id, version_aviso, acepta_contacto_telefonico, aceptado_en, registrado_por, created_by) VALUES (?,?,?,1,CURRENT_TIMESTAMP(3),?,?)",
		[id, tutorId, VERSION_AVISO, usuario, usuario]
	);
	return [{tabla: "consentimientos", id: id, fila: {tutor_id: tutorId, version_aviso: VERSION_AVISO, acepta_contacto_telefonico: 1, registrado_por: usuario}}];
}

// [IA] Generado con Claude (prompt #10 en docs/ia/prompts.md). Revisado por: pendiente
// DIRECTORA y TRABAJO_SOCIAL gestionan tutores (plan, issue 10). El teléfono se guarda cifrado.
registrarRecurso(router, "Tutores", {
	tabla: "tutores",
	columnas: ["nombre", "primer_apellido", "segundo_apellido", "correo", "telefono_cifrado"],
	roles: ["DIRECTORA", "TRABAJO_SOCIAL"],
	cifrados: ["telefono_cifrado"],
	uuid: true,
	alcance: alcanceTutores,
	busqueda: ["nombre", "primer_apellido", "segundo_apellido"],
	validar: validarTutor,
	alCrear: registrarConsentimiento,
});

module.exports=router;
// rutas/infanteTutor.js lo usa para revisar que el tutor que se vincula sea visible para el usuario
module.exports.alcanceTutores=alcanceTutores;
