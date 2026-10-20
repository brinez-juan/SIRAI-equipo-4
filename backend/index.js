const express=require("express");
const MongoClient= require("mongodb").MongoClient;
var cors=require("cors");
const bodyParser=require("body-parser")
const argon2=require("argon2");
const app=express();
const jwt=require("jsonwebtoken");
const fs=require("fs");
const https=require("https");

const PORT=3000;
let db;
app.use(cors());
app.use(bodyParser.json());

async function connectToDB(){
	let client=new MongoClient(await process.env.DB);
	await client.connect();
	db=client.db();
	console.log("conectado a la base de datos");
}

async function log(sujeto, accion, objeto){
	let nuevoLog={};
	nuevoLog["timestamp"]=new Date();
	nuevoLog["sujeto"]=sujeto;
	nuevoLog["accion"]=accion;
	nuevoLog["objeto"]=objeto;
	await db.collection("logs").insertOne(nuevoLog);

}

async function getList(collection, req, res){
	let sortBy=req.query._sort;
	let sortOrder=req.query._order=="ASC"?1:-1;
	let inicio=Number(req.query._start);
	let fin=Number(req.query._end);
	let sorter={}
	sorter[sortBy]=sortOrder;
	let data=await db.collection(collection).find({}).sort(sorter).project({_id:0}).toArray();
	res.set("Access-Control-Expose-Headers", "X-Total-Count");
	res.set("X-Total-Count", data.length);
	data=await data.slice(inicio, fin);
	res.json(data);
}

async function getMany(collection, req, res){
	let data=[]
	for(let index=0;index<req.query.id.length; index++){
		let dataParcial=await db.collection(collection).find({id:Number(req.query.id[index])}).project({_id:0}).toArray();
		data=await data.concat(dataParcial);
	}
	res.json(data);
}

async function getManyReference(collection, req, res){
	let data=await db.collection("productos").find(req.query).project({_id:0}).toArray();
	res.set("Access-Control-Expose-Headers", "X-Total-Count");
	res.set("X-Total-Count", data.length);
	res.json(data);
}

async function getOne(collection, id, req,res){
	let data=await db.collection(collection).find({"id":id}).project({"_id":0}).toArray();
	res.json(data[0]);
}

async function updateData(collection, req, res){
	let valores=req.body;
	valores["id"]=Number(valores["id"]);
	let data=await db.collection(collection).updateOne({"id":valores["id"]},{"$set":valores});
	data=await db.collection(collection).find({"id":valores["id"]}).project({"_id":0}).toArray();
	res.json(data[0]);
}

async function deleteData(collection, id, req, res){
	let data=await db.collection(collection).deleteOne({"id":id});
	res.json(data);
}

async function createData(collection, req, res){
	let valores=req.body;
	valores["id"]=Number(valores["id"]);
	let data=db.collection(collection).insertOne(valores);
	res.json(data);

}

app.get("/Productos", async (req,res)=>{
	try{
		let token=req.get("Authentication");
		let verifiedToken=await jwt.verify(token, await process.env.LLAVESECRETA);
		let user=verifiedToken.usuario;
		await log(user, "consultar datos", "Productos");
		if("_sort" in req.query){
			await getList("productos", req, res);
		}else if("id" in req.query){
			await getMany("productos", req, res);
		}else{
			await getManyReference("productos", req, res);
		}
	}catch{
		res.sendStatus(401);
	}
});

app.get("/Productos/:id", async(req, res)=>{
	await getOne("productos", Number(req.params.id), req, res);
});

app.put("/Productos/:id", async(req, res)=>{
	await updateData("productos", req, res);
});

app.delete("/Productos/:id", async(req, res)=>{
	await deleteData("productos", Number(req.params.id), req, res);
});

app.post("/Productos/", async(req, res)=>{
	await createData("productos",  req, res);
});


app.post("/registrarse", async(req, res)=>{
	let user=req.body.username;
	let pass=req.body.password;
	console.log(req.body.password)
	let data=await db.collection("usuarios").findOne({"usuario":user});
	console.log(data)
	if (data==null){
		const hash=await argon2.hash(pass, {type: argon2.argon2id, memoryCost: 64*1024, timeCost:3, parallelism:1, saltLength:128});
		let usuarioAgregar={"usuario": user, "password": hash}
		data=await db.collection("usuarios").insertOne(usuarioAgregar);
		res.sendStatus(201);
	}else{
		res.sendStatus(403);
	}
});

app.post("/login", async (req, res)=>{
	let user=req.body.username;
	let pass=req.body.password;
	let data=await db.collection("usuarios").findOne({"usuario":user});
	if(data==null){
		res.sendStatus(401);
	}else if(await argon2.verify(data.password, pass)){
		let token=jwt.sign({"usuario":data.usuario}, await process.env.LLAVESECRETA, {expiresIn:900});
		res.json({"token": token, "id":data.usuario});
	}else{
		res.sendStatus(401);
	}
})

const options={
	key: fs.readFileSync("backend.key"),
	cert: fs.readFileSync("backend.crt")
};

https.createServer(options,app).listen(PORT, async ()=>{
	await process.loadEnvFile(".env");
	await connectToDB();
	console.log("Backend corriendo en puerto 3000");
});



/*app.listen(PORT, async ()=>{
	await process.loadEnvFile(".env");
	await connectToDB();
	console.log("Backend corriendo en puerto 3000");
});*/