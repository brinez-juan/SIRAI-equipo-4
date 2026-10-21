// Las variables del .env se cargan antes de todo: db.js las lee al importarse.
process.loadEnvFile(".env");
if(!process.env.DATABASE_URL || !process.env.LLAVESECRETA || !process.env.LLAVE_CIFRADO){
	console.error("Faltan DATABASE_URL, LLAVESECRETA o LLAVE_CIFRADO en backend/.env (ver .env.example)");
	process.exit(1);
}

const express=require("express");
const cors=require("cors");
const fs=require("fs");
const https=require("https");
const {db}=require("./db");
const {autenticar, registrarPeticion}=require("./seguridad");
const rutasSesion=require("./rutas/sesion");
const rutasCatalogos=require("./rutas/catalogos");
const rutasUsuarios=require("./rutas/usuarios");
const rutasInfantes=require("./rutas/infantes");
const rutasTutores=require("./rutas/tutores");
const rutasInfanteTutor=require("./rutas/infanteTutor");
const rutasContactos=require("./rutas/contactos");
const rutasAsistencia=require("./rutas/asistencia");
const rutasSalida=require("./rutas/salida");

const PORT=3000;
const app=express();
app.use(cors());
app.use(express.json());

// Única ruta pública: /login
app.use(rutasSesion);

// De aquí para abajo TODA ruta exige token válido y queda registrada en audit_log.
// Cada módulo nuevo se monta debajo de estas dos líneas.
app.use(autenticar);
app.use(registrarPeticion);
app.use(rutasCatalogos);
app.use(rutasUsuarios);
app.use(rutasInfantes);
app.use(rutasTutores);
app.use(rutasInfanteTutor);
app.use(rutasContactos);
app.use(rutasAsistencia);
app.use(rutasSalida);

// [Humano] Escrito por: pendiente. Arranque HTTPS del servidor con los certificados backend.key y backend.crt
const options={
	key: fs.readFileSync("backend.key"),
	cert: fs.readFileSync("backend.crt")
};

https.createServer(options,app).listen(PORT, async ()=>{
	await db.query("SELECT 1");
	console.log("conectado a la base de datos");
	console.log("Backend corriendo en puerto 3000");
});



/*app.listen(PORT, async ()=>{
	await db.query("SELECT 1");
	console.log("Backend corriendo en puerto 3000");
});*/
