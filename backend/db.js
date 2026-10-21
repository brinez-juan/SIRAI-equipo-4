const mysql=require("mysql2/promise");
const crypto=require("crypto");

// Pool de conexiones: reutiliza conexiones abiertas en vez de abrir una por consulta.
// timezone "Z": las fechas se guardan y se leen en UTC.
const db=mysql.createPool({uri: process.env.DATABASE_URL, timezone: "Z"});

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// UUID v7: los primeros 48 bits son la hora, así los ids nuevos quedan ordenados en el índice.
function uuidv7(){
	let bytes=crypto.randomBytes(16);
	let ts=BigInt(Date.now());
	for(let i=0; i<6; i++){
		bytes[i]=Number((ts>>BigInt(8*(5-i)))&0xffn);
	}
	bytes[6]=(bytes[6]&0x0f)|0x70;
	bytes[8]=(bytes[8]&0x3f)|0x80;
	let hex=bytes.toString("hex");
	return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
}

// [IA] Generado con Claude (prompt #1 en docs/ia/prompts.md). Revisado por: pendiente
// Traduce errores de MySQL a códigos HTTP: datos duplicados = 409, datos inválidos = 400.
// Modificado con el prompt #9: falta un campo obligatorio o una fecha inválida también son 400.
function responderError(res, error){
	if(error.code=="ER_DUP_ENTRY"){
		res.sendStatus(409);
	}else if(["ER_NO_REFERENCED_ROW_2", "ER_ROW_IS_REFERENCED_2", "ER_CHECK_CONSTRAINT_VIOLATED", "ER_BAD_NULL_ERROR", "ER_DATA_TOO_LONG", "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD", "WARN_DATA_TRUNCATED",
		"ER_NO_DEFAULT_FOR_FIELD", "ER_TRUNCATED_WRONG_VALUE"].includes(error.code)){
		res.sendStatus(400);
	}else{
		console.error(error);
		res.sendStatus(500);
	}
}

module.exports={db, uuidv7, responderError};
