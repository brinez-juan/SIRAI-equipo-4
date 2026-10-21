const express=require("express");
const {db, responderError}=require("../db");
const {log, permitir}=require("../seguridad");
const {descifrar}=require("../cifrado");

const router=express.Router();

// [IA] Generado con Claude (prompt #25 en docs/ia/prompts.md). Revisado por: pendiente
// Mismos roles que la bandeja de seguimiento (issue 20): DOCENTE no ve notas ni seguimientos.
// El token debe traer estancia: la estancia nunca sale del request.
const acceso=[
	permitir("TRABAJO_SOCIAL", "MEDICO", "DIRECTORA"),
	(req, res, next)=>req.usuario.estancia_id==null?res.sendStatus(403):next()
];

// [IA] Generado con Claude (prompt #25 en docs/ia/prompts.md). Revisado por: pendiente
// GET /infantes/:id/expediente — expediente imprimible (issue 25): datos del infante y TODOS sus seguimientos
// (también los cerrados), del más reciente al más antiguo, cada uno con su falta, causa, llamadas y alta médica.
// Notas, detalle de la causa y observaciones salen descifrados; los teléfonos no se incluyen (el documento
// se imprime). Un infante de otra estancia responde 404. Cada consulta queda en audit_log como READ_CONFIDENCIAL.
router.get("/infantes/:id/expediente", acceso, async (req, res)=>{
	try{
		let [infantes]=await db.query(
			"SELECT i.id, i.matricula, i.nombre, i.primer_apellido, i.segundo_apellido, DATE_FORMAT(i.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,"+
			" e.clave AS estancia_clave, e.nombre AS estancia_nombre"+
			" FROM infantes i JOIN estancias e ON e.id=i.estancia_id WHERE i.id=? AND i.estancia_id=? AND i.deleted_at IS NULL",
			[req.params.id, req.usuario.estancia_id]
		);
		let infante=infantes[0];
		if(infante==null){
			return res.sendStatus(404);
		}
		let [seguimientos]=await db.query(
			"SELECT s.id, s.estado, s.detalle_causa_cifrado, DATE_FORMAT(s.fecha_probable_retorno, '%Y-%m-%d') AS fecha_probable_retorno, s.cerrado_en,"+
			" CONCAT_WS(' ', uc.nombre, uc.primer_apellido) AS cerrado_por_nombre,"+
			" DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, a.turno, ea.nombre AS estado_nombre,"+
			" c.codigo AS causa_codigo, c.nombre AS causa_nombre, c.requiere_alta"+
			" FROM seguimientos s JOIN asistencias a ON a.id=s.asistencia_id JOIN estados_asistencia ea ON ea.codigo=a.estado_codigo"+
			" LEFT JOIN causas_inasistencia c ON c.codigo=s.causa_codigo LEFT JOIN usuarios uc ON uc.id=s.cerrado_por"+
			" WHERE a.infante_id=? AND a.estancia_id=? AND s.deleted_at IS NULL AND a.deleted_at IS NULL"+
			" ORDER BY a.fecha DESC, a.turno DESC",
			[infante.id, req.usuario.estancia_id]
		);
		let ids=seguimientos.map(seguimiento=>seguimiento.id);
		let llamadas=[];
		let altas=[];
		if(ids.length>0){
			// A quién se llamó: nombre del tutor o del contacto, sin teléfono
			[llamadas]=await db.query(
				"SELECT l.id, l.seguimiento_id, l.intento, l.realizada_en, l.resultado, l.notas_cifrado, l.siguiente_intento_en,"+
				" CONCAT_WS(' ', u.nombre, u.primer_apellido) AS realizada_por_nombre,"+
				" IF(l.tutor_id IS NULL, ce.nombre, CONCAT_WS(' ', t.nombre, t.primer_apellido)) AS destinatario,"+
				" IF(l.tutor_id IS NULL, 'CONTACTO', 'TUTOR') AS tipo_destinatario"+
				" FROM llamadas l JOIN usuarios u ON u.id=l.realizada_por"+
				" LEFT JOIN tutores t ON t.id=l.tutor_id LEFT JOIN contactos_emergencia ce ON ce.id=l.contacto_emergencia_id"+
				" WHERE l.seguimiento_id IN (?) AND l.deleted_at IS NULL ORDER BY l.seguimiento_id, l.intento",
				[ids]
			);
			[altas]=await db.query(
				"SELECT a.id, a.seguimiento_id, a.folio_justificante, a.emitida_en, a.observaciones_cifrado,"+
				" CONCAT_WS(' ', u.nombre, u.primer_apellido) AS emitida_por_nombre"+
				" FROM altas_medicas a JOIN usuarios u ON u.id=a.emitida_por WHERE a.seguimiento_id IN (?) AND a.deleted_at IS NULL",
				[ids]
			);
		}
		let expediente={
			infante: infante,
			generado_en: new Date(),
			seguimientos: seguimientos.map(({detalle_causa_cifrado, causa_codigo, causa_nombre, requiere_alta, ...seguimiento})=>{
				let alta=altas.find(fila=>fila.seguimiento_id==seguimiento.id);
				return {
					...seguimiento,
					causa: causa_codigo==null?null:{codigo: causa_codigo, nombre: causa_nombre, requiere_alta: requiere_alta, detalle: descifrar(detalle_causa_cifrado)},
					llamadas: llamadas.filter(llamada=>llamada.seguimiento_id==seguimiento.id)
						.map(({notas_cifrado, seguimiento_id, ...llamada})=>({...llamada, notas: descifrar(notas_cifrado)})),
					alta: alta==null?null:(({observaciones_cifrado, seguimiento_id, ...resto})=>({...resto, observaciones: descifrar(observaciones_cifrado)}))(alta),
				};
			}),
		};
		// Solo los ids de lo que se vio: la bitácora no guarda los datos descifrados
		await log(req.usuario, "READ_CONFIDENCIAL", "infantes", infante.id, null, {
			expediente: true,
			seguimientos: ids,
			llamadas: llamadas.map(llamada=>llamada.id),
			altas: altas.map(alta=>alta.id)
		}, req);
		res.json(expediente);
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
