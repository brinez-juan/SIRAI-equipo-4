import {Datagrid, List, TextField, Edit, SimpleForm, TextInput, Create} from "react-admin";

export const listarProductos = () =>(
    <List>
        <Datagrid>
            <TextField source="id" />
            <TextField source="nombre" />
        </Datagrid>
    </List>
);

export const editarProductos = ()=>(
    <Edit>
        <SimpleForm>
            <TextInput source="id" />
            <TextInput source="nombre" />
            <TextInput source="marca" />
        </SimpleForm>
    </Edit>
);

export const crearProductos = ()=>(
    <Create>
        <SimpleForm>
            <TextInput source="id" />
            <TextInput source="nombre" />
            <TextInput source="marca" />
        </SimpleForm>
    </Create>
);