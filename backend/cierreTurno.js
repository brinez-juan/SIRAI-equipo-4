const {db, uuidv7}=require("./db");
const {log}=require("./seguridad");

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Fecha de hoy (AAAA-MM-DD) en la hora local de México, que es el "día" de asistencias.fecha.
function hoy(){
	return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(new Date());
}

// [IA+Humano] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Cierra el pase de lista de un día y turno de una estancia, todo en una transacción (si algo falla no se guarda nada):
//  1. Inserta el cierre. Va primero a propósito: el registro de asistencia del issue 13 toma un FOR SHARE sobre
//     esta llave, así que el cierre espera a que terminen los registros en curso y los posteriores reciben 409.
//     Un segundo cierre del mismo día y turno también choca aquí.
//  2. Los infantes sin registro quedan como FALTA_INJUSTIFICADA (sin hora de entrada).
//  3. Cada asistencia cuyo estado tenga genera_seguimiento = 1 recibe un seguimiento ABIERTO (uno por asistencia),
//     o CLASIFICADO con la causa de su justificación si se marcó Ausente justificado.
// usuarioId = null es el cierre automático (issue 18): automatico = 1 y cerrado_por/created_by quedan en NULL.
// Devuelve {cierre, faltas, seguimientos} con los ids creados, o null si ese día y turno ya estaba cerrado.
async function cerrarTurno(estanciaId, fecha, turno, usuarioId){
	let automatico=usuarioId==null?1:0;
	let ahora=new Date();
	let cierreId=uuidv7();
	let conexion=await db.getConnection();
	try{
		await conexion.beginTransaction();
		try{
			await conexion.query(
				"INSERT INTO cierres_pase_lista (id, estancia_id, fecha, turno, cerrado_en, automatico, cerrado_por, created_by) VALUES (?,?,?,?,?,?,?,?)",
				[cierreId, estanciaId, fecha, turno, ahora, automatico, usuarioId, usuarioId]
			);
		}catch(error){
			if(error.code=="ER_DUP_ENTRY"){
				await conexion.rollback();
				return null;
			}
			throw error;
		}
		// Sin registro ese día y turno (se cuenta cualquier fila, también borrada, porque la clave única uq_asistencia_dia la incluye)
		let [sinRegistro]=await conexion.query(
			"SELECT i.id FROM infantes i WHERE i.estancia_id=? AND i.deleted_at IS NULL AND NOT EXISTS"+
			" (SELECT 1 FROM asistencias a WHERE a.infante_id=i.id AND a.estancia_id=i.estancia_id AND a.fecha=? AND a.turno=?)",
			[estanciaId, fecha, turno]
		);
		let faltas=sinRegistro.map(infante=>[uuidv7(), estanciaId, infante.id, fecha, turno, "FALTA_INJUSTIFICADA", ahora, usuarioId]);
		if(faltas.length>0){
			await conexion.query(
				"INSERT INTO asistencias (id, estancia_id, infante_id, fecha, turno, estado_codigo, capturado_en, created_by) VALUES ? ON DUPLICATE KEY UPDATE id=id",
				[faltas]
			);
		}
		// Incluye las faltas recién creadas. Si la asistencia ya tiene seguimiento (clave única por asistencia), no se duplica.
		let [conSeguimiento]=await conexion.query(
			"SELECT a.id, a.justificacion_causa_codigo, a.justificacion_cifrado FROM asistencias a JOIN estados_asistencia e ON e.codigo=a.estado_codigo"+
			" WHERE a.estancia_id=? AND a.fecha=? AND a.turno=? AND a.deleted_at IS NULL AND e.genera_seguimiento=1"+
			" AND NOT EXISTS (SELECT 1 FROM seguimientos s WHERE s.asistencia_id=a.id)",
			[estanciaId, fecha, turno]
		);
		// Una falta justificada ya trae su causa del pase de lista (feature 42): el caso nace CLASIFICADO con ese motivo
		// y su nota (mismo cifrado, se copia tal cual), y en el detalle ya no se pide clasificar.
		let seguimientos=conSeguimiento.map(asistencia=>{
			let justificada=asistencia.justificacion_causa_codigo!=null;
			return [uuidv7(), asistencia.id, justificada?"CLASIFICADO":"ABIERTO", asistencia.justificacion_causa_codigo,
				justificada?asistencia.justificacion_cifrado:null, usuarioId];
		});
		if(seguimientos.length>0){
			await conexion.query(
				"INSERT INTO seguimientos (id, asistencia_id, estado, causa_codigo, detalle_causa_cifrado, created_by) VALUES ? ON DUPLICATE KEY UPDATE id=id",
				[seguimientos]
			);
		}
		await conexion.commit();
		return {
			cierre: {id: cierreId, fecha: fecha, turno: turno, cerrado_en: ahora, automatico: automatico, cerrado_por: usuarioId},
			faltas: faltas.map(fila=>fila[0]),
			seguimientos: seguimientos.map(fila=>fila[0])
		};
	}catch(error){
		await conexion.rollback();
		throw error;
	}finally{
		conexion.release();
	}
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Cierre automático (issue 18): cierra hoy cada turno activo cuya hora_cierre (hora local de México) ya pasó y que
// todavía no tenga cierre. Sábado y domingo no se cierra nada: las estancias no operan y marcaría falta a todos.
// Si dos procesos cierran el mismo turno a la vez, la clave única del cierre deja pasar solo a uno.
async function cerrarTurnosVencidos(){
	let partes=Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Mexico_City", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
	}).formatToParts(new Date()).map(parte=>[parte.type, parte.value]));
	if(partes.weekday=="Sat" || partes.weekday=="Sun"){
		return;
	}
	let fecha=hoy();
	let hora=partes.hour+":"+partes.minute+":"+partes.second;
	let [vencidos]=await db.query(
		"SELECT t.estancia_id, t.turno FROM estancia_turnos t JOIN estancias e ON e.id=t.estancia_id"+
		" WHERE t.deleted_at IS NULL AND e.deleted_at IS NULL AND t.hora_cierre<=?"+
		" AND NOT EXISTS (SELECT 1 FROM cierres_pase_lista c WHERE c.estancia_id=t.estancia_id AND c.fecha=? AND c.turno=t.turno)",
		[hora, fecha]
	);
	for(let vencido of vencidos){
		// Un turno que falla no detiene a los demás; se reintenta en la siguiente vuelta
		try{
			let resumen=await cerrarTurno(vencido.estancia_id, fecha, vencido.turno, null);
			if(resumen){
				// Sujeto null = proceso del sistema en audit_log
				await log(null, "CREATE", "cierres_pase_lista", resumen.cierre.id, null,
					{...resumen.cierre, estancia_id: vencido.estancia_id, asistencias_falta_creadas: resumen.faltas, seguimientos_creados: resumen.seguimientos});
				console.log("Cierre automático: estancia "+vencido.estancia_id+", "+vencido.turno+" "+fecha+" ("+resumen.faltas.length+" faltas)");
			}
		}catch(error){
			console.error("No se pudo cerrar automáticamente la estancia "+vencido.estancia_id+", turno "+vencido.turno, error);
		}
	}
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Revisa cada minuto si hay turnos por cerrar. Si una vuelta tarda más de un minuto, la siguiente se salta.
function iniciarCierreAutomatico(){
	let enCurso=false;
	let revisar=async ()=>{
		if(enCurso){
			return;
		}
		enCurso=true;
		try{
			await cerrarTurnosVencidos();
		}catch(error){
			console.error("Falló la revisión del cierre automático", error);
		}finally{
			enCurso=false;
		}
	};
	revisar();
	return setInterval(revisar, 60*1000);
}

module.exports={hoy, cerrarTurno, cerrarTurnosVencidos, iniciarCierreAutomatico};
