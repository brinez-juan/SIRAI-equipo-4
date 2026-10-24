const crypto=require("crypto");

const IV_BYTES=12;  // tamaño recomendado para GCM
const TAG_BYTES=16; // etiqueta de autenticación de GCM

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// La llave se lee al usarla (no al importar el módulo) para que un .env incompleto falle con un
// mensaje claro y no deje a seed.js guardando datos en claro por error.
function llave(){
	let hex=process.env.LLAVE_CIFRADO;
	if(!hex || !/^[0-9a-fA-F]{64}$/.test(hex)){
		throw new Error("LLAVE_CIFRADO debe ser 32 bytes en hex (64 caracteres) en backend/.env (ver .env.example)");
	}
	return Buffer.from(hex, "hex");
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// AES-256-GCM con un IV aleatorio por valor. Devuelve base64 de iv + etiqueta + texto cifrado,
// así el mismo texto cifrado dos veces da resultados distintos. null/undefined se quedan null.
function cifrar(texto){
	if(texto==null){
		return null;
	}
	let iv=crypto.randomBytes(IV_BYTES);
	let cifrador=crypto.createCipheriv("aes-256-gcm", llave(), iv);
	let cifrado=Buffer.concat([cifrador.update(String(texto), "utf8"), cifrador.final()]);
	return Buffer.concat([iv, cifrador.getAuthTag(), cifrado]).toString("base64");
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Inverso de cifrar(). Si el valor fue alterado o la llave no es la misma, GCM lo detecta y lanza error.
// Acepta Buffer porque mysql2 devuelve así las columnas binarias.
function descifrar(texto){
	if(texto==null){
		return null;
	}
	let datos=Buffer.from(Buffer.isBuffer(texto)?texto.toString("utf8"):texto, "base64");
	if(datos.length<IV_BYTES+TAG_BYTES){
		throw new Error("Valor cifrado inválido");
	}
	let descifrador=crypto.createDecipheriv("aes-256-gcm", llave(), datos.subarray(0, IV_BYTES));
	descifrador.setAuthTag(datos.subarray(IV_BYTES, IV_BYTES+TAG_BYTES));
	return Buffer.concat([descifrador.update(datos.subarray(IV_BYTES+TAG_BYTES)), descifrador.final()]).toString("utf8");
}

module.exports={cifrar, descifrar};
