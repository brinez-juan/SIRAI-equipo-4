const express=require("express");
const {db, uuidv7, responderError}=require("../db");
const {log, permitir}=require("../seguridad");
const {cifrar, descifrar}=require("../cifrado");

const router=express.Router();
const PARENTESCOS=["MADRE", "PADRE", "ABUELO_A", "TIO_A", "HERMANO_A", "TUTOR_LEGAL", "OTRO"];
const MAX_PRIORIDAD=10;
const COLUMNAS="id, infante_id, nombre, parentesco, telefono_cifrado, prioridad, created_at, updated_at";

// Solo DIRECTORA (ficha del infante). TRABAJO_SOCIAL y MEDICO ven estos contactos desde el seguimiento (issue 20).
// El token debe traer estancia: la estancia nunca sale del request.
const soloDirectora=[
	permitir("DIRECTORA"),
	(req, res, next)=>req.usuario.estancia_id==null?res.sendStatus(403):next()
];

// El infante de la URL debe ser de la estancia del token; si es de otra se comporta como si no existiera (404).
async function infanteDeMiEstancia(req){
	let [filas]=await db.query("SELECT id FROM infantes WHERE id=? AND estancia_id=? AND deleted_at IS NULL", [req.params.id, req.usuario.estancia_id]);
	return filas[0];
}

async function buscarContacto(req){
	let [filas]=await db.query("SELECT "+COLUMNAS+" FROM contactos_emergencia WHERE id=? AND infante_id=? AND deleted_at IS NULL", [req.params.contactoId, req.params.id]);
	return filas[0];
}

// Copia de la fila con el teléfono descifrado. La fila original (cifrada) es la que va a la bitácora.
function paraRespuesta(fila){
	return {...fila, telefono_cifrado: descifrar(fila.telefono_cifrado)};
}

// Revisa el body antes de tocar la base. Al crear exige los cuatro campos; al editar solo revisa los que vengan.
// Exigir tipo evita que un objeto o arreglo llegue a la consulta SQL. La prioridad va de 1 a MAX_PRIORIDAD:
// los números negativos quedan reservados para los contactos borrados (ver borrar).
function validarContacto(cuerpo, creando){
	if(creando){
		for(let campo of ["nombre", "parentesco", "telefono_cifrado", "prioridad"]){
			if(!(campo in cuerpo)){
				return "Falta "+campo+".";
			}
		}
	}
	if("nombre" in cuerpo && (typeof cuerpo.nombre!="string" || cuerpo.nombre.trim()=="" || cuerpo.nombre.length>150)){
		return "El nombre debe ser un texto de 1 a 150 caracteres.";
	}
	if("parentesco" in cuerpo && !PARENTESCOS.includes(cuerpo.parentesco)){
		return "El parentesco no es válido.";
	}
	if("telefono_cifrado" in cuerpo && (typeof cuerpo.telefono_cifrado!="string" || !/^[0-9+()\s-]{7,20}$/.test(cuerpo.telefono_cifrado.trim()))){
		return "El teléfono debe tener entre 7 y 20 caracteres: números, +, -, paréntesis o espacios.";
	}
	if("prioridad" in cuerpo && (!Number.isInteger(cuerpo.prioridad) || cuerpo.prioridad<1 || cuerpo.prioridad>MAX_PRIORIDAD)){
		return "La prioridad debe ser un número entero de 1 a "+MAX_PRIORIDAD+".";
	}
	return null;
}

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Contactos del infante, ordenados por prioridad (1 = primero en llamarse), con el teléfono descifrado.
router.get("/infantes/:id/contactos", soloDirectora, async (req, res)=>{
	try{
		if(await infanteDeMiEstancia(req)==null){
			return res.sendStatus(404);
		}
		let [filas]=await db.query("SELECT "+COLUMNAS+" FROM contactos_emergencia WHERE infante_id=? AND deleted_at IS NULL ORDER BY prioridad", [req.params.id]);
		res.json(filas.map(paraRespuesta));
	}catch(error){
		responderError(res, error);
	}
});

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Agrega un contacto. El id, el infante y created_by los pone el servidor. Una prioridad ya usada por
// otro contacto del infante responde 409 (clave única infante_id + prioridad).
router.post("/infantes/:id/contactos", soloDirectora, async (req, res)=>{
	try{
		if(await infanteDeMiEstancia(req)==null){
			return res.sendStatus(404);
		}
		let cuerpo=req.body??{};
		let invalido=validarContacto(cuerpo, true);
		if(invalido){
			return res.status(400).json({message: invalido});
		}
		let id=uuidv7();
		await db.query(
			"INSERT INTO contactos_emergencia (id, infante_id, nombre, parentesco, telefono_cifrado, prioridad, created_by) VALUES (?,?,?,?,?,?,?)",
			[id, req.params.id, cuerpo.nombre.trim(), cuerpo.parentesco, cifrar(cuerpo.telefono_cifrado.trim()), cuerpo.prioridad, req.usuario.usuario]
		);
		req.params.contactoId=id;
		let fila=await buscarContacto(req);
		await log(req.usuario, "CREATE", "contactos_emergencia", id, null, fila, req);
		res.status(201).json(paraRespuesta(fila));
	}catch(error){
		responderError(res, error);
	}
});

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Edita solo nombre, parentesco, teléfono y prioridad, y guarda en la bitácora el antes y el después.
router.put("/infantes/:id/contactos/:contactoId", soloDirectora, async (req, res)=>{
	try{
		if(await infanteDeMiEstancia(req)==null){
			return res.sendStatus(404);
		}
		let antes=await buscarContacto(req);
		if(antes==null){
			return res.sendStatus(404);
		}
		let cuerpo=req.body??{};
		let invalido=validarContacto(cuerpo, false);
		if(invalido){
			return res.status(400).json({message: invalido});
		}
		let asignaciones=[];
		let valores=[];
		for(let campo of ["nombre", "parentesco", "telefono_cifrado", "prioridad"]){
			if(campo in cuerpo){
				asignaciones.push(campo+"=?");
				valores.push(campo=="telefono_cifrado"?cifrar(cuerpo[campo].trim()):campo=="nombre"?cuerpo[campo].trim():cuerpo[campo]);
			}
		}
		await db.query(
			"UPDATE contactos_emergencia SET "+asignaciones.concat("updated_at=CURRENT_TIMESTAMP(3)").join(", ")+" WHERE id=? AND infante_id=? AND deleted_at IS NULL",
			[...valores, req.params.contactoId, req.params.id]
		);
		let despues=await buscarContacto(req);
		await log(req.usuario, "UPDATE", "contactos_emergencia", req.params.contactoId, antes, despues, req);
		res.json(paraRespuesta(despues));
	}catch(error){
		responderError(res, error);
	}
});

// [IA] Codigo escrito con asistencia de Claude (prompt # en declaracion de IA).
// Borrado lógico. La clave única (infante_id, prioridad) no mira deleted_at, así que un contacto borrado
// seguiría ocupando su prioridad y no se podría volver a usar. Por eso, al borrar, su prioridad pasa a un
// número negativo libre (el activo siempre es 1 o más). La bitácora conserva la prioridad original en "antes".
router.delete("/infantes/:id/contactos/:contactoId", soloDirectora, async (req, res)=>{
	try{
		if(await infanteDeMiEstancia(req)==null){
			return res.sendStatus(404);
		}
		let conexion=await db.getConnection();
		let antes;
		try{
			await conexion.beginTransaction();
			let [filas]=await conexion.query("SELECT "+COLUMNAS+" FROM contactos_emergencia WHERE id=? AND infante_id=? AND deleted_at IS NULL FOR UPDATE", [req.params.contactoId, req.params.id]);
			antes=filas[0];
			if(antes!=null){
				let [[{minimo}]]=await conexion.query("SELECT MIN(prioridad) AS minimo FROM contactos_emergencia WHERE infante_id=? FOR UPDATE", [req.params.id]);
				await conexion.query(
					"UPDATE contactos_emergencia SET deleted_at=CURRENT_TIMESTAMP(3), prioridad=? WHERE id=?",
					[Math.min(minimo, 0)-1, req.params.contactoId]
				);
			}
			await conexion.commit();
		}catch(error){
			await conexion.rollback();
			throw error;
		}finally{
			conexion.release();
		}
		if(antes==null){
			return res.sendStatus(404);
		}
		await log(req.usuario, "SOFT_DELETE", "contactos_emergencia", req.params.contactoId, antes, null, req);
		res.json(paraRespuesta(antes));
	}catch(error){
		responderError(res, error);
	}
});

module.exports=router;
