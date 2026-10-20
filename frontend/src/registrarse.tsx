import React, {useState, ChangeEvent} from "react";

const Registrarse: React.FC =()=>{
    const [datos, setDatos]=useState({username:"", password:""});

    const handleChange=(event:ChangeEvent<HTMLInputElement>)=>{setDatos({...datos, [event.target.name]:event.target.value})};
     
    const handleSendData=async()=>{
        const request= new Request("http://10.49.61.59:3000/registrarse", {
            method: "POST",
            body: JSON.stringify(datos),
            headers: new Headers({"Content-Type": "application/json"})
        });
        try{
            const res=await fetch(request)
            if(res.status<200 || res.status>=300){
                throw new Error(res.statusText);
            }
        }catch{
            throw new Error("No se pudo registrar el usuario")
        }

    };
    
    
    return(
    
        <div>
            <h2> Registro de usuario</h2>
            <form>
                <div>
                    <label>Usuario: </label>
                    <input type="text" id="username" name="username" value={datos.username} onChange={handleChange}/>
                </div>
                <div>
                    <label>Password: </label>
                    <input type="password" id="password" name="password" value={datos.password} onChange={handleChange} />
                </div>
                <div>
                    <button type="button" onClick={handleSendData}>
                        Crear usuario
                    </button>
                </div>
            </form>
        </div>
    )
}
export default Registrarse;