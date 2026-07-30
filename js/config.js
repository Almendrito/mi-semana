// Configuracion de la app.
//
// MODO LOCAL: si dejas los dos campos vacios, todo se guarda solo en este
// navegador (localStorage). Sirve para probar; el celular no ve nada.
//
// MODO NUBE: con la URL y la key del proyecto Supabase, los datos se guardan
// en la base y se ven igual desde el PC y el celular, entrando con tu correo
// y contrasena. Antes hay que ejecutar supabase/schema.sql en el SQL Editor.
//
// La key "publishable" esta hecha para ir en el codigo del navegador: no da
// acceso a nada por si sola. Lo que protege los datos son las politicas RLS
// del schema (cada usuario solo ve su propia fila).
window.APP_CONFIG = {
  SUPABASE_URL: 'https://zfksqtrorfraifnrgaot.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_tnZgW4xeiJq_VC7WfGb8wA_sseoOxcl',
};
