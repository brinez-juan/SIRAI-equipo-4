// Medición de CPU y memoria por proceso, en reposo y bajo carga (issue 33).
//
// Uso, desde backend/, con el backend, el frontend (npm run dev) y MySQL ya corriendo:
//   node pruebas/medicion.js
// Mide tres procesos: el backend (puerto 3000), el frontend (puerto PUERTO_FRONT) y MySQL (contenedor de Docker
// o, si no hay, el proceso mysqld). Primero deja pasar REPOSO segundos sin tocar nada y luego lanza autocannon
// contra GET /pase-lista durante DURACION segundos con CONEXIONES conexiones (212 = una por estancia, SRS).
// Solo funciona en macOS y Linux (usa top, lsof y docker). En Windows se mide a mano con el Administrador de tareas.
//
// Variables opcionales: BASE, PUERTO_FRONT, CONTENEDOR_MYSQL, CONEXIONES, DURACION, REPOSO, USUARIO, CLAVE, TURNO.
const {spawn, execFile, execFileSync}=require("child_process");
const {promisify}=require("util");
const execFileAsync=promisify(execFile);

const BASE=process.env.BASE??"https://localhost:3000";
const PUERTO_FRONT=process.env.PUERTO_FRONT??"5173";
const CONTENEDOR_MYSQL=process.env.CONTENEDOR_MYSQL??"sirai-mysql";
const CONEXIONES=Number(process.env.CONEXIONES??212);
const DURACION=Number(process.env.DURACION??30);
const REPOSO=Number(process.env.REPOSO??20);
const USUARIO=process.env.USUARIO??"docente@sirai.mx";
const CLAVE=process.env.CLAVE??"Sirai#2026";
const TURNO=process.env.TURNO??"MATUTINO";

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// El backend usa un certificado autofirmado, así que se desactiva la verificación TLS, pero solo si el destino es
// la propia máquina: contra cualquier otro servidor el script se niega a correr.
const anfitrion=new URL(BASE).hostname;
if(!["localhost", "127.0.0.1", "::1"].includes(anfitrion)){
	console.error("Este script solo mide una instancia local (BASE debe apuntar a localhost).");
	process.exit(1);
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";

const dormir=ms=>new Promise(resolve=>setTimeout(resolve, ms));

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// PID del proceso que escucha en un puerto TCP (undefined si nadie escucha).
function pidEnPuerto(puerto){
	try{
		let salida=execFileSync("lsof", ["-iTCP:"+puerto, "-sTCP:LISTEN", "-t"], {encoding: "utf8"});
		return Number(salida.split("\n")[0])||undefined;
	}catch{
		return undefined;
	}
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Convierte "109M", "57M+", "1.2G", "512K" o "300" (KiB en Linux) a megabytes.
function aMegas(texto, porDefecto){
	let encontrado=/^([\d.]+)\s*([KMGBkmgb]?)/.exec(texto.trim());
	if(!encontrado){
		return NaN;
	}
	let numero=Number(encontrado[1]);
	let unidad=(encontrado[2]||porDefecto).toUpperCase();
	return unidad=="G"?numero*1024:unidad=="M"?numero:unidad=="K"?numero/1024:numero/1024/1024;
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Muestrea con top (una vez por segundo) el CPU y la memoria residente de varios PID. CPU es el porcentaje de UN núcleo
// (puede pasar de 100 con varios hilos). Se descarta la primera lectura de top: es el promedio desde que arrancó.
// Devuelve {pid: {cpu: [...], ram: [...]}} cuando top termina.
function muestrearProcesos(pids, segundos){
	return new Promise(resolve=>{
		let lecturas={};
		pids.forEach(pid=>lecturas[pid]={cpu: [], ram: []});
		let mac=process.platform=="darwin";
		let args=mac
			?["-l", String(segundos+1), "-s", "1", "-stats", "pid,cpu,rsize", ...pids.flatMap(pid=>["-pid", String(pid)])]
			:["-b", "-d", "1", "-n", String(segundos+1), "-p", pids.join(",")];
		let proceso=spawn("top", args);
		let buffer="";
		let vistos={};
		let columnas;
		proceso.stdout.on("data", trozo=>{
			buffer+=trozo;
			let lineas=buffer.split("\n");
			buffer=lineas.pop();
			for(let linea of lineas){
				let partes=linea.trim().split(/\s+/);
				if(!mac && partes[0]=="PID"){
					columnas={cpu: partes.indexOf("%CPU"), ram: partes.indexOf("RES")};
					continue;
				}
				let pid=Number(partes[0]);
				if(!lecturas[pid] || !/^\d+$/.test(partes[0])){
					continue;
				}
				vistos[pid]=(vistos[pid]??0)+1;
				if(vistos[pid]==1){
					continue;
				}
				let cpu=mac?Number(partes[1]):Number(partes[columnas.cpu].replace(",", "."));
				let ram=mac?aMegas(partes[2], "M"):aMegas(partes[columnas.ram], "K");
				if(!Number.isNaN(cpu) && !Number.isNaN(ram)){
					lecturas[pid].cpu.push(cpu);
					lecturas[pid].ram.push(ram);
				}
			}
		});
		proceso.on("close", ()=>resolve(lecturas));
	});
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Muestrea un contenedor de Docker con "docker stats" (tarda cerca de 1 s por lectura). El CPU también es
// porcentaje de un núcleo. La memoria es la que reporta Docker para el contenedor.
// Usa execFile asíncrono a propósito: con execFileSync el bucle bloquearía todo el programa y la carga
// no arrancaría hasta que terminara el muestreo, midiendo un servidor en reposo.
async function muestrearContenedor(nombre, segundos){
	let lecturas={cpu: [], ram: []};
	let fin=Date.now()+segundos*1000;
	while(Date.now()<fin){
		try{
			let {stdout}=await execFileAsync("docker", ["stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}", nombre]);
			let salida=stdout.trim();
			let [cpu, memoria]=salida.split("|");
			lecturas.cpu.push(Number(cpu.replace("%", "")));
			lecturas.ram.push(aMegas(memoria.split("/")[0].replace("iB", ""), "M"));
		}catch{
			break;
		}
	}
	return lecturas;
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
function resumen(valores){
	if(valores.length==0){
		return {promedio: NaN, mediana: NaN, maximo: NaN, muestras: 0, serie: []};
	}
	let ordenados=[...valores].sort((a, b)=>a-b);
	let mitad=Math.floor(ordenados.length/2);
	return {
		promedio: valores.reduce((suma, v)=>suma+v, 0)/valores.length,
		// La mediana no se deja arrastrar por las lecturas de los últimos segundos, que caen cuando la carga ya terminó
		mediana: ordenados.length%2?ordenados[mitad]:(ordenados[mitad-1]+ordenados[mitad])/2,
		maximo: Math.max(...valores),
		muestras: valores.length,
		serie: valores,
	};
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Lanza autocannon (se baja con npx la primera vez) y devuelve su resultado en JSON.
function cargar(url, token){
	return new Promise((resolve, reject)=>{
		let proceso=spawn("npx", ["--yes", "autocannon", "-c", String(CONEXIONES), "-d", String(DURACION), "--json", "-H", "Authentication="+token, url]);
		let salida="";
		proceso.stdout.on("data", trozo=>salida+=trozo);
		proceso.on("close", ()=>{
			try{
				resolve(JSON.parse(salida));
			}catch{
				reject(new Error("autocannon no devolvió un resultado válido"));
			}
		});
	});
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Mide una fase (reposo o carga): muestrea los tres procesos a la vez durante "segundos" y, si se pide, corre la carga.
async function medirFase(objetivos, segundos, trabajo){
	let pids=objetivos.filter(objetivo=>objetivo.pid).map(objetivo=>objetivo.pid);
	let porPid=muestrearProcesos(pids, segundos);
	let contenedor=objetivos.find(objetivo=>objetivo.contenedor);
	let porContenedor=contenedor?muestrearContenedor(contenedor.contenedor, segundos):Promise.resolve(null);
	let resultadoTrabajo=trabajo?trabajo():Promise.resolve(null);
	let [lecturas, lecturasContenedor, carga]=await Promise.all([porPid, porContenedor, resultadoTrabajo]);
	let filas=objetivos.map(objetivo=>{
		let datos=objetivo.pid?lecturas[objetivo.pid]:lecturasContenedor;
		return {nombre: objetivo.nombre, cpu: resumen(datos?.cpu??[]), ram: resumen(datos?.ram??[])};
	});
	return {filas, carga};
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
const f=(numero, decimales=1)=>Number.isNaN(numero)?"n/d":numero.toFixed(decimales);

async function main(){
	let pidBackend=pidEnPuerto(3000);
	let pidFront=pidEnPuerto(PUERTO_FRONT);
	if(!pidBackend){
		console.error("No hay nada escuchando en el puerto 3000: arranca el backend primero.");
		process.exit(1);
	}
	let objetivos=[{nombre: "Backend (Node, Express)", pid: pidBackend}];
	if(pidFront){
		objetivos.push({nombre: "Frontend (Vite, React-admin)", pid: pidFront});
	}else{
		console.warn("Aviso: nadie escucha en el puerto "+PUERTO_FRONT+" (PUERTO_FRONT); no se mide el frontend.");
	}
	let hayDocker=false;
	try{
		execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", CONTENEDOR_MYSQL], {stdio: "pipe"});
		hayDocker=true;
	}catch{}
	if(hayDocker){
		objetivos.push({nombre: "MySQL (contenedor "+CONTENEDOR_MYSQL+")", contenedor: CONTENEDOR_MYSQL});
	}else{
		let pidMysql=Number(execFileSyncSeguro("pgrep", ["-x", "mysqld"]).split("\n")[0])||undefined;
		if(pidMysql){
			objetivos.push({nombre: "MySQL (mysqld)", pid: pidMysql});
		}else{
			console.warn("Aviso: no se encontró MySQL (ni el contenedor "+CONTENEDOR_MYSQL+" ni mysqld); no se mide.");
		}
	}

	let respuesta=await fetch(BASE+"/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({username: USUARIO, password: CLAVE})});
	if(!respuesta.ok){
		console.error("No se pudo iniciar sesión con "+USUARIO+" (HTTP "+respuesta.status+"). ¿Corriste node seed.js?");
		process.exit(1);
	}
	let {token}=await respuesta.json();
	let hoy=new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(new Date());
	let url=BASE+"/pase-lista?fecha="+hoy+"&turno="+TURNO;
	let prueba=await fetch(url, {headers: {Authentication: token}});
	if(!prueba.ok){
		console.error("GET /pase-lista respondió "+prueba.status+"; no se puede medir un endpoint que falla.");
		process.exit(1);
	}

	console.log("Midiendo "+objetivos.length+" proceso(s). Reposo: "+REPOSO+" s. Carga: "+CONEXIONES+" conexiones durante "+DURACION+" s sobre "+url);
	let reposo=await medirFase(objetivos, REPOSO);
	await dormir(2000);
	let carga=await medirFase(objetivos, DURACION, ()=>cargar(url, token));

	console.log("\n| Proceso | CPU reposo (mediana / máx %) | RAM reposo (mediana / máx MB) | CPU carga (mediana / máx %) | RAM carga (mediana / máx MB) |");
	console.log("|---|---|---|---|---|");
	for(let i=0; i<objetivos.length; i++){
		let r=reposo.filas[i];
		let c=carga.filas[i];
		console.log("| "+r.nombre+" | "+f(r.cpu.mediana)+" / "+f(r.cpu.maximo)+" | "+f(r.ram.mediana, 0)+" / "+f(r.ram.maximo, 0)+" | "+f(c.cpu.mediana)+" / "+f(c.cpu.maximo)+" | "+f(c.ram.mediana, 0)+" / "+f(c.ram.maximo, 0)+" |");
	}
	let a=carga.carga;
	if(process.env.DETALLE){
		for(let i=0; i<objetivos.length; i++){
			console.log("\nSerie por segundo de "+objetivos[i].nombre+" (CPU %):");
			console.log("  reposo: "+reposo.filas[i].cpu.serie.map(v=>f(v)).join(" "));
			console.log("  carga:  "+carga.filas[i].cpu.serie.map(v=>f(v)).join(" "));
			console.log("Serie por segundo de "+objetivos[i].nombre+" (RAM MB):");
			console.log("  reposo: "+reposo.filas[i].ram.serie.map(v=>f(v, 0)).join(" "));
			console.log("  carga:  "+carga.filas[i].ram.serie.map(v=>f(v, 0)).join(" "));
		}
	}
	console.log("\nResultado de autocannon ("+CONEXIONES+" conexiones, "+DURACION+" s):");
	console.log("- Peticiones por segundo: "+f(a.requests.average)+" (total "+a.requests.total+")");
	console.log("- Latencia (ms): promedio "+f(a.latency.average)+", p50 "+f(a.latency.p50)+", p97.5 "+f(a.latency.p97_5)+", p99 "+f(a.latency.p99)+", máxima "+f(a.latency.max));
	console.log("- Respuestas 2xx: "+a["2xx"]+" · no 2xx: "+a.non2xx+" · errores de conexión: "+a.errors+" · tiempos agotados: "+a.timeouts);
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
function execFileSyncSeguro(comando, args){
	try{
		return execFileSync(comando, args, {encoding: "utf8"});
	}catch{
		return "";
	}
}

main().catch(error=>{
	console.error(error);
	process.exit(1);
});
