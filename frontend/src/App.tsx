import { Admin, Resource , CustomRoutes} from "react-admin";
import {Route} from "react-router-dom";
import { Layout } from "./Layout";
import {listarProductos, editarProductos, crearProductos} from "./Productos"
import {dataProvider} from "./dataProvider"
import Registrarse from "./registrarse";
import authProvider from "./AuthProvider";

export const App = () => (
    <Admin layout={Layout} dataProvider={dataProvider} authProvider={authProvider}>
        <Resource
            name="Productos"
            list={listarProductos}
            edit={editarProductos}
            create={crearProductos}
        />
        <CustomRoutes>
            <Route path="/registrarse" element={<Registrarse />}/>
        </CustomRoutes>
    </Admin>
    
);
