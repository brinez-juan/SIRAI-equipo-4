// Datos sintéticos y usuarios iniciales para la demo.
// Uso: sobre una base recién creada con docs/schema.sql, desde backend/: node seed.js
process.loadEnvFile(".env");
if(!process.env.DATABASE_URL){
	console.error("Falta DATABASE_URL en backend/.env (ver .env.example)");
	process.exit(1);
}

const argon2=require("argon2");
const {db, uuidv7}=require("./db");

// cifrar() llega con el issue 07 (cifrado.js). Mientras no exista, los teléfonos se guardan en claro.
// TODO: quitar este respaldo cuando cifrado.js esté en develop.
let cifrar;
try{
	({cifrar}=require("./cifrado"));
}catch{
	console.warn("AVISO: no existe cifrado.js (issue 07); los teléfonos se guardan SIN cifrar.");
	cifrar=texto=>texto;
}

const PASSWORD_DEMO="Sirai#2026";
const INFANTES_POR_ESTANCIA=20;
const VERSION_AVISO="2026.1";

const REGIONES=["Región Centro", "Región Norte"];

const ESTANCIAS=[
	{region: 0, clave: "EBDI-001", nombre: "Estancia de Bienestar No. 1", direccion: "Av. Insurgentes Sur 1000, CDMX"},
	{region: 0, clave: "EBDI-002", nombre: "Estancia de Bienestar No. 2", direccion: "Calz. de Tlalpan 2500, CDMX"},
	{region: 1, clave: "EBDI-003", nombre: "Estancia de Bienestar No. 3", direccion: "Av. Constitución 400, Monterrey"},
];

// Un usuario por rol. Los roles de estancia van a la primera estancia y el supervisor a la primera región
// (así se cumple chk_usuarios_alcance).
const USUARIOS=[
	{rol: "ADMIN_CENTRAL", correo: "admin@sirai.mx", nombre: "Laura", primer_apellido: "Méndez"},
	{rol: "SUPERVISOR", correo: "supervisor@sirai.mx", nombre: "Ricardo", primer_apellido: "Salas", region: 0},
	{rol: "DIRECTORA", correo: "directora@sirai.mx", nombre: "Patricia", primer_apellido: "Ortega", estancia: 0},
	{rol: "DOCENTE", correo: "docente@sirai.mx", nombre: "Mariana", primer_apellido: "López", estancia: 0},
	{rol: "TRABAJO_SOCIAL", correo: "trabajosocial@sirai.mx", nombre: "Fernanda", primer_apellido: "Ruiz", estancia: 0},
	{rol: "MEDICO", correo: "medico@sirai.mx", nombre: "Andrés", primer_apellido: "Castillo", estancia: 0},
];

const NOMBRES=["Sofía", "Mateo", "Valentina", "Santiago", "Regina", "Leonardo", "Camila", "Emiliano", "Ximena", "Diego",
	"Renata", "Sebastián", "Victoria", "Daniel", "Isabella", "Gael", "Romina", "Iker", "Natalia", "Thiago"];
const APELLIDOS=["Hernández", "García", "Martínez", "López", "González", "Pérez", "Rodríguez", "Sánchez", "Ramírez", "Cruz",
	"Flores", "Gómez", "Morales", "Vázquez", "Jiménez", "Reyes", "Díaz", "Torres", "Gutiérrez", "Ruiz"];
const NOMBRES_ADULTOS=["María", "José", "Guadalupe", "Juan", "Rosa", "Luis", "Carmen", "Jorge", "Ana", "Miguel"];

// [IA] Generado con Claude (prompts #4 y #6 en docs/ia/prompts.md). Revisado por: pendiente
// Teléfono de 10 dígitos que empieza con 55, distinto para cada número n.
function telefono(n){
	return "55"+String(10000000+n*7919%90000000).padStart(8, "0");
}

// [IA] Generado con Claude (prompts #4 y #6 en docs/ia/prompts.md). Revisado por: pendiente
// Fecha de nacimiento entre 1 y 5 años antes de hoy, fija para cada i (la demo siempre se ve igual).
function fechaNacimiento(i){
	let fecha=new Date();
	fecha.setUTCFullYear(fecha.getUTCFullYear()-1-i%5);
	fecha.setUTCDate(fecha.getUTCDate()-(i*37)%300);
	return fecha.toISOString().slice(0, 10);
}

// [IA] Generado con Claude (prompts #4 y #6 en docs/ia/prompts.md). Revisado por: pendiente
// Inserta todo en una sola transacción: si algo falla, la base queda como estaba.
// Los catálogos (estados_asistencia, causas_inasistencia) ya los inserta schema.sql.
async function sembrar(conn){
	let hash=await argon2.hash(PASSWORD_DEMO, {type: argon2.argon2id});

	// El administrador va primero porque es el created_by de todo lo demás
	let admin=USUARIOS[0];
	let adminId=uuidv7();
	await conn.query(
		"INSERT INTO usuarios (id, nombre, primer_apellido, correo, password_hash, rol) VALUES (?,?,?,?,?,?)",
		[adminId, admin.nombre, admin.primer_apellido, admin.correo, hash, admin.rol]
	);

	let regionIds=[];
	for(let nombre of REGIONES){
		let [resultado]=await conn.query("INSERT INTO regiones (nombre, created_by) VALUES (?,?)", [nombre, adminId]);
		regionIds.push(resultado.insertId);
	}

	let estanciaIds=[];
	for(let estancia of ESTANCIAS){
		let [resultado]=await conn.query(
			"INSERT INTO estancias (region_id, clave, nombre, direccion, created_by) VALUES (?,?,?,?,?)",
			[regionIds[estancia.region], estancia.clave, estancia.nombre, estancia.direccion, adminId]
		);
		estanciaIds.push(resultado.insertId);
		await conn.query(
			"INSERT INTO estancia_turnos (estancia_id, turno, hora_inicio, hora_cierre, created_by) VALUES (?, 'MATUTINO', '07:00:00', '09:00:00', ?)",
			[resultado.insertId, adminId]
		);
	}

	let directoraId=null;
	for(let usuario of USUARIOS.slice(1)){
		let id=uuidv7();
		await conn.query(
			"INSERT INTO usuarios (id, nombre, primer_apellido, correo, password_hash, rol, estancia_id, region_id, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
			[id, usuario.nombre, usuario.primer_apellido, usuario.correo, hash, usuario.rol,
			usuario.estancia==null?null:estanciaIds[usuario.estancia], usuario.region==null?null:regionIds[usuario.region], adminId]
		);
		if(usuario.rol=="DIRECTORA"){
			directoraId=id;
		}
	}

	let n=0;
	for(let e=0; e<estanciaIds.length; e++){
		for(let i=0; i<INFANTES_POR_ESTANCIA; i++){
			n++;
			let apellido1=APELLIDOS[(n*3)%APELLIDOS.length];
			let apellido2=APELLIDOS[(n*7+5)%APELLIDOS.length];
			let infanteId=uuidv7();
			let folio=String(i+1).padStart(4, "0");
			await conn.query(
				"INSERT INTO infantes (id, estancia_id, matricula, nombre, primer_apellido, segundo_apellido, fecha_nacimiento, codigo_credencial, created_by) VALUES (?,?,?,?,?,?,?,?,?)",
				[infanteId, estanciaIds[e], ESTANCIAS[e].clave+"-"+folio, NOMBRES[(n+e)%NOMBRES.length], apellido1, apellido2,
				fechaNacimiento(n), "INF-"+ESTANCIAS[e].clave+"-"+folio, adminId]
			);

			// Madre autorizada para recoger; el padre solo en la mitad de los casos
			let tutores=[
				{parentesco: "MADRE", nombre: NOMBRES_ADULTOS[n%NOMBRES_ADULTOS.length], apellido: apellido2, autorizado: 1},
				{parentesco: "PADRE", nombre: NOMBRES_ADULTOS[(n+5)%NOMBRES_ADULTOS.length], apellido: apellido1, autorizado: n%2},
			];
			for(let t=0; t<tutores.length; t++){
				let tutor=tutores[t];
				let tutorId=uuidv7();
				await conn.query(
					"INSERT INTO tutores (id, nombre, primer_apellido, telefono_cifrado, codigo_credencial, created_by) VALUES (?,?,?,?,?,?)",
					[tutorId, tutor.nombre, tutor.apellido, cifrar(telefono(n*10+t)), "TUT-"+ESTANCIAS[e].clave+"-"+folio+"-"+(t+1), adminId]
				);
				// El parentesco y la autorización para recoger viven en el vínculo, no en el tutor
				await conn.query(
					"INSERT INTO infante_tutor (infante_id, tutor_id, parentesco, autorizado_recoger, created_by) VALUES (?,?,?,?,?)",
					[infanteId, tutorId, tutor.parentesco, tutor.autorizado, adminId]
				);
				// El tutor de la demo ya aceptó el aviso de privacidad (lo mismo que exige el issue 10)
				await conn.query(
					"INSERT INTO consentimientos (id, tutor_id, version_aviso, acepta_contacto_telefonico, aceptado_en, registrado_por, created_by) VALUES (?,?,?,1,CURRENT_TIMESTAMP(3),?,?)",
					[uuidv7(), tutorId, VERSION_AVISO, directoraId, adminId]
				);
			}

			let contactos=[
				{parentesco: "ABUELO_A", nombre: NOMBRES_ADULTOS[(n+2)%NOMBRES_ADULTOS.length]+" "+apellido1},
				{parentesco: "TIO_A", nombre: NOMBRES_ADULTOS[(n+7)%NOMBRES_ADULTOS.length]+" "+apellido2},
			];
			for(let c=0; c<contactos.length; c++){
				await conn.query(
					"INSERT INTO contactos_emergencia (id, infante_id, nombre, parentesco, telefono_cifrado, prioridad, created_by) VALUES (?,?,?,?,?,?,?)",
					[uuidv7(), infanteId, contactos[c].nombre, contactos[c].parentesco, cifrar(telefono(n*10+5+c)), c+1, adminId]
				);
			}
		}
	}
}

// [IA] Generado con Claude (prompts #4 y #6 en docs/ia/prompts.md). Revisado por: pendiente
async function main(){
	let conn=await db.getConnection();
	try{
		let [[{total}]]=await conn.query("SELECT COUNT(*) AS total FROM usuarios");
		if(total>0){
			console.error("La base ya tiene usuarios. El seed es para una base recién creada con schema.sql.");
			process.exitCode=1;
			return;
		}
		await conn.beginTransaction();
		await sembrar(conn);
		await conn.commit();
		console.log("Base lista para la demo. Usuarios iniciales (contraseña: "+PASSWORD_DEMO+"):");
		console.table(USUARIOS.map(usuario=>({rol: usuario.rol, correo: usuario.correo,
			alcance: usuario.estancia!=null?ESTANCIAS[usuario.estancia].clave:usuario.region!=null?REGIONES[usuario.region]:"todas"})));
		console.log(ESTANCIAS.length+" estancias, "+ESTANCIAS.length*INFANTES_POR_ESTANCIA+" infantes, 2 tutores vinculados y 2 contactos de emergencia por infante.");
	}catch(error){
		await conn.rollback();
		console.error("No se pudo sembrar la base; no se guardó nada.", error);
		process.exitCode=1;
	}finally{
		conn.release();
		await db.end();
	}
}

main();
