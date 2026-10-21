// Revisión de endpoints por rol (issue 30). Uso, con el backend corriendo y la base creada con schema.sql + seed.js:
//   node pruebas/permisos.js              solo lecturas y escrituras que el backend rechaza (no cambia datos)
//   node pruebas/permisos.js --preparar   además crea un caso de seguimiento completo (falta, llamada, causa y alta)
//                                         para revisar también las respuestas con datos confidenciales
// SIRAI_URL cambia el servidor (por defecto https://localhost:3000). Sale con código 1 si algo falla.
const path=require("path");
const https=require("https");

process.loadEnvFile(path.join(__dirname, "..", ".env"));
const {descifrar}=require("../cifrado");

const URL_BASE=process.env.SIRAI_URL??"https://localhost:3000";
const PASSWORD_DEMO="Sirai#2026";
// Id que no existe en ninguna tabla: las sondas de escritura con un rol permitido deben dar 404, sin cambiar nada
const NO_EXISTE="00000000-0000-7000-8000-000000000000";
// Día del caso de prueba de --preparar (pasado, para que el cierre lo acepte)
const FECHA_PRUEBA="2026-01-05";

const USUARIOS={
	ADMIN_CENTRAL: "admin@sirai.mx",
	SUPERVISOR: "supervisor@sirai.mx",
	DIRECTORA: "directora@sirai.mx",
	TRABAJO_SOCIAL: "trabajosocial@sirai.mx",
	MEDICO: "medico@sirai.mx",
	DOCENTE: "docente@sirai.mx",
};
const ROLES=Object.keys(USUARIOS);
// Tabla 2.5 del plan
const DE_ESTANCIA=["DIRECTORA", "DOCENTE", "TRABAJO_SOCIAL", "MEDICO"];
const SEGUIMIENTO=["TRABAJO_SOCIAL", "MEDICO", "DIRECTORA"];
const PASE_LISTA=["DOCENTE", "DIRECTORA"];
// Llaves que delatan datos de un infante o su familia: SUPERVISOR no debe recibir ninguna
const LLAVES_PERSONALES=["matricula", "primer_apellido", "segundo_apellido", "fecha_nacimiento", "infante_id", "infante", "infantes", "tutores", "contactos", "telefono", "correo"];

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// Petición HTTPS al backend. rejectUnauthorized: false porque el certificado de desarrollo es autofirmado;
// solo se usa en este script de pruebas. Devuelve {status, tipo, texto, json}.
function pedir(metodo, ruta, token, cuerpo){
	return new Promise((resolver, rechazar)=>{
		let datos=cuerpo===undefined?null:JSON.stringify(cuerpo);
		let headers={Accept: "application/json"};
		if(token){
			headers.Authentication=token;
		}
		if(datos!=null){
			headers["Content-Type"]="application/json";
			headers["Content-Length"]=Buffer.byteLength(datos);
		}
		let peticion=https.request(URL_BASE+ruta, {method: metodo, headers, rejectUnauthorized: false}, respuesta=>{
			let partes=[];
			respuesta.on("data", parte=>partes.push(parte));
			respuesta.on("end", ()=>{
				let texto=Buffer.concat(partes).toString("utf8");
				let tipo=respuesta.headers["content-type"]??"";
				let json=null;
				if(tipo.includes("application/json")){
					try{
						json=JSON.parse(texto);
					}catch{
						json=null;
					}
				}
				resolver({status: respuesta.statusCode, tipo, texto, json});
			});
		});
		peticion.on("error", rechazar);
		if(datos!=null){
			peticion.write(datos);
		}
		peticion.end();
	});
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// Inicia sesión con cada usuario del seed y devuelve {rol: {token, id}}.
async function iniciarSesiones(){
	let sesiones={};
	for(let rol of ROLES){
		let respuesta=await pedir("POST", "/login", null, {username: USUARIOS[rol], password: PASSWORD_DEMO});
		if(respuesta.status!=200){
			throw new Error("No se pudo iniciar sesión como "+USUARIOS[rol]+" ("+respuesta.status+"). ¿La base tiene el seed?");
		}
		sesiones[rol]={token: respuesta.json.token, id: respuesta.json.id};
	}
	return sesiones;
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// Con --preparar: como DIRECTORA marca a todos presentes en FECHA_PRUEBA salvo un infante con falta y cierra el turno
// (se abre un seguimiento); TRABAJO_SOCIAL registra una llamada con notas y clasifica con una causa que requiere alta;
// MEDICO emite la alta. Así quedan llenos todos los campos cifrados. Si ya se corrió antes, los 409 se ignoran.
async function preparar(sesiones, infanteId){
	let d=sesiones.DIRECTORA.token;
	let ts=sesiones.TRABAJO_SOCIAL.token;
	let dia={fecha: FECHA_PRUEBA, turno: "MATUTINO"};
	await pedir("POST", "/pase-lista/todos-presentes", d, dia);
	await pedir("PUT", "/pase-lista/"+infanteId, d, {...dia, estado_codigo: "FALTA_INJUSTIFICADA"});
	await pedir("POST", "/cierres", d, dia);
	let bandeja=await pedir("GET", "/seguimientos?_start=0&_end=1000", ts);
	let caso=(bandeja.json??[]).find(fila=>fila.infante_id==infanteId && fila.fecha==FECHA_PRUEBA);
	if(caso==null){
		return;
	}
	let tutores=await pedir("GET", "/Infantes/"+infanteId+"/tutores", d);
	let causas=await pedir("GET", "/causas", ts);
	let causa=(causas.json??[]).find(fila=>Number(fila.requiere_alta)==1);
	if(tutores.json?.length){
		await pedir("POST", "/seguimientos/"+caso.id+"/llamadas", ts, {tutor_id: tutores.json[0].id, resultado: "SIN_RESPUESTA", notas: "Nota de prueba del issue 30"});
	}
	if(causa){
		await pedir("PUT", "/seguimientos/"+caso.id+"/clasificar", ts, {causa_codigo: causa.codigo, detalle: "Detalle de prueba del issue 30", fecha_probable_retorno: null});
	}
	await pedir("POST", "/seguimientos/"+caso.id+"/alta", sesiones.MEDICO.token, {folio: "PRUEBA-30", observaciones: "Observaciones de prueba del issue 30"});
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// Ids reales para armar las rutas: un infante, un tutor, un seguimiento y un registro de bitácora.
async function contexto(sesiones, conPreparar){
	let d=sesiones.DIRECTORA.token;
	let infantes=await pedir("GET", "/Infantes?_sort=id&_order=ASC&_start=0&_end=1000", d);
	let infanteId=infantes.json?.[0]?.id;
	if(infanteId==null){
		throw new Error("La estancia de la directora no tiene infantes. ¿La base tiene el seed?");
	}
	if(conPreparar){
		await preparar(sesiones, infanteId);
	}
	let tutores=await pedir("GET", "/Tutores?_sort=id&_order=ASC&_start=0&_end=1", d);
	let seguimientos=await pedir("GET", "/seguimientos?_start=0&_end=1", d);
	let bitacora=await pedir("GET", "/Bitacora?_sort=id&_order=DESC&_start=0&_end=1", sesiones.ADMIN_CENTRAL.token);
	return {
		infanteId,
		tutorId: tutores.json?.[0]?.id??NO_EXISTE,
		seguimientoId: seguimientos.json?.[0]?.id??null,
		bitacoraId: bitacora.json?.[0]?.id??1,
		usuarioId: sesiones.ADMIN_CENTRAL.id,
		// Nombres y matrículas reales: ninguno debe aparecer en lo que recibe SUPERVISOR
		datosInfantes: (infantes.json??[]).flatMap(infante=>[infante.matricula, infante.nombre+" "+infante.primer_apellido]),
	};
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// Todos los endpoints del backend con los roles que la tabla 2.5 deja pasar. "ruta" lleva ids reales; "nombre" es
// como se documenta. Las escrituras mandan cuerpos vacíos o ids inexistentes: un rol permitido recibe 400 o 404 y
// no se cambia nada, un rol no permitido debe recibir 403 antes de que se lea el cuerpo.
function endpoints(ctx){
	let hoy=new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(new Date());
	let seg=ctx.seguimientoId??NO_EXISTE;
	let inf=ctx.infanteId;
	let lista="?_sort=id&_order=ASC&_start=0&_end=50";
	let crud=(recurso, roles, escritura, idReal)=>[
		{nombre: "GET /"+recurso, ruta: "/"+recurso+lista, roles},
		{nombre: "GET /"+recurso+"/:id", ruta: "/"+recurso+"/"+idReal, roles},
		{nombre: "POST /"+recurso, ruta: "/"+recurso, roles: escritura, cuerpo: {}},
		{nombre: "PUT /"+recurso+"/:id", ruta: "/"+recurso+"/"+(typeof idReal=="number"?999999:NO_EXISTE), roles: escritura, cuerpo: {}},
		{nombre: "DELETE /"+recurso+"/:id", ruta: "/"+recurso+"/"+(typeof idReal=="number"?999999:NO_EXISTE), roles: escritura},
	];
	return [
		...crud("Regiones", ["ADMIN_CENTRAL"], ["ADMIN_CENTRAL"], 1),
		...crud("Estancias", ["ADMIN_CENTRAL"], ["ADMIN_CENTRAL"], 1),
		...crud("Usuarios", ["ADMIN_CENTRAL"], ["ADMIN_CENTRAL"], ctx.usuarioId),
		...crud("Infantes", DE_ESTANCIA, ["DIRECTORA"], inf),
		...crud("Tutores", ["DIRECTORA", "TRABAJO_SOCIAL"], ["DIRECTORA", "TRABAJO_SOCIAL"], ctx.tutorId),
		{nombre: "GET /Infantes/:id/tutores", ruta: "/Infantes/"+inf+"/tutores", roles: DE_ESTANCIA},
		{nombre: "POST /Infantes/:id/tutores", ruta: "/Infantes/"+inf+"/tutores", roles: ["DIRECTORA"], cuerpo: {}},
		{nombre: "DELETE /Infantes/:id/tutores/:tutorId", ruta: "/Infantes/"+inf+"/tutores/"+NO_EXISTE, roles: ["DIRECTORA"]},
		{nombre: "GET /infantes/:id/contactos", ruta: "/infantes/"+inf+"/contactos", roles: ["DIRECTORA"]},
		{nombre: "POST /infantes/:id/contactos", ruta: "/infantes/"+inf+"/contactos", roles: ["DIRECTORA"], cuerpo: {}},
		{nombre: "PUT /infantes/:id/contactos/:contactoId", ruta: "/infantes/"+inf+"/contactos/"+NO_EXISTE, roles: ["DIRECTORA"], cuerpo: {}},
		{nombre: "DELETE /infantes/:id/contactos/:contactoId", ruta: "/infantes/"+inf+"/contactos/"+NO_EXISTE, roles: ["DIRECTORA"]},
		{nombre: "GET /pase-lista", ruta: "/pase-lista?fecha="+hoy+"&turno=MATUTINO", roles: DE_ESTANCIA},
		{nombre: "PUT /pase-lista/:infanteId", ruta: "/pase-lista/"+inf, roles: PASE_LISTA, cuerpo: {}},
		{nombre: "POST /pase-lista/todos-presentes", ruta: "/pase-lista/todos-presentes", roles: PASE_LISTA, cuerpo: {}},
		{nombre: "PUT /pase-lista/:infanteId/salida", ruta: "/pase-lista/"+inf+"/salida", roles: PASE_LISTA, cuerpo: {}},
		{nombre: "GET /Asistencias", ruta: "/Asistencias?_sort=fecha&_order=DESC&_start=0&_end=50", roles: DE_ESTANCIA},
		{nombre: "POST /cierres", ruta: "/cierres", roles: ["DIRECTORA"], cuerpo: {}},
		{nombre: "GET /seguimientos", ruta: "/seguimientos?_start=0&_end=50", roles: SEGUIMIENTO},
		{nombre: "GET /seguimientos/:id", ruta: "/seguimientos/"+seg, roles: SEGUIMIENTO},
		{nombre: "PUT /seguimientos/:id/clasificar", ruta: "/seguimientos/"+seg+"/clasificar", roles: SEGUIMIENTO, cuerpo: {}},
		{nombre: "POST /seguimientos/:id/llamadas", ruta: "/seguimientos/"+seg+"/llamadas", roles: SEGUIMIENTO, cuerpo: {}},
		{nombre: "POST /seguimientos/:id/alta", ruta: "/seguimientos/"+seg+"/alta", roles: ["MEDICO", "DIRECTORA"], cuerpo: {}},
		{nombre: "PUT /seguimientos/:id/cerrar", ruta: "/seguimientos/"+NO_EXISTE+"/cerrar", roles: SEGUIMIENTO},
		{nombre: "GET /causas", ruta: "/causas", roles: SEGUIMIENTO},
		{nombre: "GET /infantes/:id/expediente", ruta: "/infantes/"+inf+"/expediente", roles: SEGUIMIENTO},
		{nombre: "GET /tablero", ruta: "/tablero", roles: ["SUPERVISOR", "ADMIN_CENTRAL"]},
		{nombre: "GET /reportes/asistencia (JSON)", ruta: "/reportes/asistencia?desde=2026-01-01&hasta="+hoy+"&formato=json", roles: ["DIRECTORA", "SUPERVISOR", "ADMIN_CENTRAL"]},
		{nombre: "GET /reportes/asistencia (CSV)", ruta: "/reportes/asistencia?desde=2026-01-01&hasta="+hoy, roles: ["DIRECTORA", "SUPERVISOR", "ADMIN_CENTRAL"]},
		{nombre: "GET /Bitacora", ruta: "/Bitacora?_sort=id&_order=DESC&_start=0&_end=500", roles: ["ADMIN_CENTRAL"]},
		{nombre: "GET /Bitacora/:id", ruta: "/Bitacora/"+ctx.bitacoraId, roles: ["ADMIN_CENTRAL"]},
	];
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// true si el texto es un valor cifrado con cifrar() (AES-256-GCM con LLAVE_CIFRADO): GCM solo lo acepta si es auténtico.
function esCifrado(valor){
	if(typeof valor!="string" || valor.length<40 || !/^[A-Za-z0-9+/]+=*$/.test(valor)){
		return false;
	}
	try{
		descifrar(valor);
		return true;
	}catch{
		return false;
	}
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// Recorre la respuesta y devuelve los problemas de contenido: password_hash, valores todavía cifrados (con cualquier
// llave, también dentro de "antes"/"despues" de la bitácora) y, si el rol es SUPERVISOR, datos personales.
function revisarContenido(respuesta, rol, ctx){
	let problemas=new Set();
	let recorrer=(valor, ruta)=>{
		if(Array.isArray(valor)){
			valor.forEach((elemento, indice)=>recorrer(elemento, ruta+"["+indice+"]"));
		}else if(valor!==null && typeof valor=="object"){
			for(let llave in valor){
				if(llave=="password_hash"){
					problemas.add("trae password_hash");
				}
				if(rol=="SUPERVISOR" && LLAVES_PERSONALES.includes(llave)){
					problemas.add("SUPERVISOR recibe "+llave);
				}
				recorrer(valor[llave], llave);
			}
		}else if(typeof valor=="string"){
			if(esCifrado(valor)){
				problemas.add("valor sin descifrar en "+ruta);
			}
			// La bitácora guarda antes/después como JSON: también se revisa por dentro
			if(/^[{[]/.test(valor)){
				try{
					recorrer(JSON.parse(valor), ruta);
				}catch{
					// no era JSON
				}
			}
		}
	};
	recorrer(respuesta.json, "respuesta");
	if(respuesta.json==null && respuesta.texto.includes("password_hash")){
		problemas.add("trae password_hash");
	}
	if(rol=="SUPERVISOR"){
		for(let dato of ctx.datosInfantes){
			if(respuesta.texto.includes(dato)){
				problemas.add("SUPERVISOR recibe datos de un infante ("+dato+")");
				break;
			}
		}
	}
	return [...problemas];
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// Prueba un endpoint: sin token y con token alterado (401), con cada rol no permitido (403) y con cada rol permitido
// (ni 401, ni 403, ni 5xx; en GET además 200 y el contenido limpio). Devuelve el renglón del reporte.
async function probar(endpoint, sesiones, ctx){
	let [metodo]=endpoint.nombre.split(" ");
	let fallas=[];
	let sinToken=await pedir(metodo, endpoint.ruta, null, endpoint.cuerpo);
	let alterado=await pedir(metodo, endpoint.ruta, sesiones.ADMIN_CENTRAL.token.slice(0, -2)+"xx", endpoint.cuerpo);
	if(sinToken.status!=401 || alterado.status!=401){
		fallas.push("sin token o con token alterado respondió "+sinToken.status+"/"+alterado.status+" y no 401");
	}
	let permitidos=[];
	for(let rol of ROLES){
		let respuesta=await pedir(metodo, endpoint.ruta, sesiones[rol].token, endpoint.cuerpo);
		if(!endpoint.roles.includes(rol)){
			if(respuesta.status!=403){
				fallas.push(rol+" no está permitido y recibió "+respuesta.status);
			}
			continue;
		}
		permitidos.push(rol+" "+respuesta.status);
		if([401, 403].includes(respuesta.status) || respuesta.status>=500){
			fallas.push(rol+" está permitido y recibió "+respuesta.status);
		}else if(metodo=="GET" && respuesta.status!=200 && !(endpoint.ruta.includes(NO_EXISTE) && respuesta.status==404)){
			fallas.push(rol+" recibió "+respuesta.status+" en una lectura");
		}
		for(let problema of revisarContenido(respuesta, rol, ctx)){
			fallas.push(rol+": "+problema);
		}
	}
	return {endpoint, permitidos, fallas};
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// /login es la única ruta pública: con credenciales válidas da un token sin password_hash, con un usuario que no
// existe da 401 (no se usa uno real para no sumarle intentos fallidos) y con correo o contraseña que no son texto, 400.
async function probarLogin(){
	let fallas=[];
	let valido=await pedir("POST", "/login", null, {username: USUARIOS.DOCENTE, password: PASSWORD_DEMO});
	if(valido.status!=200 || typeof valido.json?.token!="string" || valido.texto.includes("password_hash")){
		fallas.push("credenciales válidas respondió "+valido.status+" o trajo password_hash");
	}
	let inexistente=await pedir("POST", "/login", null, {username: "no-existe@sirai.mx", password: PASSWORD_DEMO});
	if(inexistente.status!=401){
		fallas.push("usuario inexistente respondió "+inexistente.status+" y no 401");
	}
	for(let cuerpo of [{username: {correo: 1}, password: "x"}, {username: USUARIOS.DOCENTE, password: 123}, {username: USUARIOS.DOCENTE}]){
		let respuesta=await pedir("POST", "/login", null, cuerpo);
		if(respuesta.status!=400){
			fallas.push(JSON.stringify(cuerpo)+" respondió "+respuesta.status+" y no 400");
		}
	}
	return {endpoint: {nombre: "POST /login"}, permitidos: ["pública: 200 / 401 / 400"], fallas, publica: true};
}

// [IA] Generado con Claude (prompt #30 en docs/ia/prompts.md). Revisado por: pendiente
// Corre todas las pruebas e imprime el reporte en Markdown (se copia a docs/seguridad/permisos.md).
async function main(){
	let conPreparar=process.argv.includes("--preparar");
	let sesiones=await iniciarSesiones();
	let ctx=await contexto(sesiones, conPreparar);
	let renglones=[await probarLogin()];
	for(let endpoint of endpoints(ctx)){
		renglones.push(await probar(endpoint, sesiones, ctx));
	}
	let fallidos=renglones.filter(renglon=>renglon.fallas.length>0);
	console.log("# Revisión de endpoints por rol\n");
	console.log("Servidor: "+URL_BASE+" · "+new Date().toISOString()+(conPreparar?" · con --preparar":""));
	if(ctx.seguimientoId==null){
		console.log("\n> ⚠ No hay seguimientos en la base: el detalle de seguimiento se probó con un id inexistente. Corre con --preparar para revisar sus datos confidenciales.");
	}
	console.log("\n| Endpoint | Roles permitidos (status) | 401 sin token | 403 a los demás | Contenido | Resultado |");
	console.log("|---|---|---|---|---|---|");
	for(let {endpoint, permitidos, fallas, publica} of renglones){
		let de401=publica?"—":fallas.some(falla=>falla.startsWith("sin token"))?"✖":"✔";
		let de403=publica?"—":fallas.some(falla=>falla.includes("no está permitido"))?"✖":"✔";
		let contenido=fallas.some(falla=>falla.includes(": ") || falla.includes("password_hash"))?"✖":"✔";
		console.log("| `"+endpoint.nombre+"` | "+permitidos.join(", ")+" | "+de401+" | "+de403+" | "+contenido+" | "+(fallas.length?"FALLA":"OK")+" |");
	}
	console.log("\n**"+renglones.length+" endpoints, "+(renglones.length-fallidos.length)+" OK, "+fallidos.length+" con fallas.**");
	for(let {endpoint, fallas} of fallidos){
		console.log("\n- `"+endpoint.nombre+"`");
		for(let falla of fallas){
			console.log("  - "+falla);
		}
	}
	process.exitCode=fallidos.length?1:0;
}

main().catch(error=>{
	console.error(error.message);
	process.exitCode=1;
});
