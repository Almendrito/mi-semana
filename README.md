# Mi Semana

Registro semanal de actividades para no dejar de lado ninguna parte de la vida:
trabajo, pareja, familia y lo personal. Cada actividad pertenece a un area, cada
area tiene una meta de horas por semana, y la app muestra cuanto llevas agendado
y cuanto hecho en cada una.

Funciona en dos modos:

- **Nube** (el configurado hoy): entras con tu usuario y contrasena y la agenda
  es la misma en el computador y en el celular.
- **Local**: si dejas `js/config.js` con los campos vacios, todo se guarda solo
  en ese navegador y no necesita internet.

## Puesta en marcha del modo nube

Hay que hacer esto **una sola vez**, y lo tienes que hacer tu porque son pasos
con tu cuenta:

1. Entra a tu proyecto de Supabase (`zfksqtrorfraifnrgaot`), abre **SQL Editor**
   y ejecuta el contenido completo de `supabase/schema.sql`. Crea la tabla
   `semana_state` y sus politicas; es idempotente, se puede volver a ejecutar.
   Convive con las tablas de logros-tracker sin tocarlas (todo lleva prefijo
   `semana_`).
2. En **Authentication > Sign In / Providers > Email**, **apaga "Confirm
   email"**. Esto es obligatorio: las cuentas son por usuario, no por correo,
   asi que el mensaje de confirmacion no llegaria a ninguna parte y la cuenta
   quedaria bloqueada para siempre.
3. Abre la app, escribe un usuario (por ejemplo `mateo`) y una contrasena y
   aprieta **Crear cuenta**. La app no guarda la contrasena en ninguna parte.
4. En el celular, abre la misma direccion y entra con el mismo usuario.

Si abres la app antes del paso 1, te va a decir "Falta crear la tabla: ejecuta
supabase/schema.sql en el SQL Editor de Supabase". Si te saltas el paso 2, al
crear la cuenta te avisa que falta apagar "Confirm email".

### Cuentas por usuario, sin correo

Supabase Auth siempre pide un email, asi que cada usuario se traduce a uno
sintetico e inmutable: `mateo` -> `mateo@almendrito.github.io`
(`AUTH_EMAIL_DOMAIN` en `js/storage.js`).

- Se eligio un dominio `*.github.io` porque GoTrue valida que el dominio
  resuelva por DNS y rechaza los inventados tipo `@mi-semana.local`. Ese
  dominio resuelve, no recibe correo (no tiene MX) y nadie mas lo puede
  registrar, asi que no hay forma de secuestrar la cuenta pidiendo "recuperar
  contrasena".
- **No cambiar el dominio**: dejaria fuera a todas las cuentas ya creadas (hay
  una prueba que falla si alguien lo mueve sin querer).
- El usuario no distingue mayusculas ni acentos (`Máteo` y `mateo` son el
  mismo) y admite letras, numeros, punto, guion y guion bajo, entre 3 y 32
  caracteres.
- **No hay recuperacion de contrasena**: no hay correo donde mandarla. Si se te
  olvida, se cambia desde Supabase en Authentication > Users > el usuario >
  Reset password.

## Como se usa

**Agregado rapido.** Una linea basta:

```
Cena con Ayleen #pareja vie 20:30 2h
Reunion GOLEM #profesional mie 15:00 1.5h
Gimnasio #personal cada martes 19:00 45min
Llamar a mi mama #familia 25/08
```

- `#area`: `#pareja`, `#familia`, `#prof`... basta el prefijo si no es ambiguo.
- Dia: `hoy`, `manana`, `pasado`, `lun`..`dom` (el de la semana que estas viendo)
  o `25/08`. Si no pones nada, es hoy.
- Hora: **siempre con dos puntos** (`20:30`, `9:00`).
- Duracion: `2h`, `1.5h`, `45min`. Por defecto 1 hora.
- `cada martes` / `todos los domingos`: crea una **rutina** que se agenda sola
  cada semana.

**Formulario.** El boton **Formulario** (y el `+` de cada dia) abre el alta
completa, que es lo mas comodo para agendar de verdad:

- **Que vas a hacer**: el titulo.
- **Categoria**: la lista de siempre, y al final **+ Crear categoria nueva**,
  que abre ahi mismo el nombre y el color sin salir del formulario.
- **Dias de esta semana**: se marcan varios de una vez. "Gimnasio lunes,
  miercoles y viernes" es un solo guardado, no tres.
- **Hora** (opcional) y **cuanto tiempo** (lista de duraciones tipicas).
- **Repetir todas las semanas en esos dias**: crea la rutina para cada dia
  marcado.

## Las dos vistas

Arriba a la derecha se cambia entre **Lista** y **Calendario**; la eleccion
queda guardada para la proxima vez.

- **Lista**: siete tarjetas, una por dia, con el total de horas de cada una.
- **Calendario**: la semana por horas, para ver de un vistazo que tan ocupada
  esta. Cada actividad es un bloque del alto de su duracion y del color de su
  categoria; lo que se pisa aparece lado a lado; en la cabecera de cada dia va
  el total y una barra de ocupacion (comparada contra 12 horas); una linea roja
  marca la hora actual. Lo que no tiene hora va en la fila "sin hora" de arriba.
  El rango horario se ajusta solo: parte en 7:00-22:00 y se estira si tienes
  algo mas temprano o mas tarde.

En las dos vistas se hace clic en una actividad para editarla.

**La semana.** El check marca lo hecho; al hacer clic en la actividad se edita;
la `x` la borra. Las flechas de arriba cambian de semana.

**Balance y avisos.** Las tarjetas de arriba comparan lo hecho contra la meta
semanal de cada area (barra clara: lo agendado; barra llena: lo hecho). Debajo
aparecen los avisos: areas sin nada agendado, areas bajo la meta y dias con mas
de 12 horas encima.

**Rutinas.** Lo que se repite todas las semanas se guarda una sola vez y se
agenda solo al abrir cada semana nueva. Se pueden pausar sin borrarlas. Si
borras una instancia suelta, esa semana no vuelve a aparecer.

**Categorias y metas.** Boton "Areas y metas" abajo: nombre, color y horas
semanales de cada una. Se pueden agregar y eliminar (al eliminar, sus
actividades pasan a la primera categoria). Las categorias creadas desde el
formulario de alta parten con meta 0, o sea sin aviso, hasta que les pongas una
aqui.

**Respaldo.** "Exportar copia" baja un `.json` con todo; "Importar" lo restaura
(en modo nube reemplaza tambien lo que ve el celular).

## Como se sincroniza

Todo el estado del usuario vive en una fila de `semana_state` como `jsonb`, con
una columna `rev` (uuid) que cambia en cada escritura.

- Al guardar, la app manda `update ... where user_id = tuyo and rev = <el que
  tenia>`. Si el celular guardo primero, el `rev` ya no calza, no se actualiza
  ninguna fila, la app **recarga lo que hay en la base y vuelve a aplicar tu
  cambio encima**. Asi no se pisan los cambios entre dispositivos.
- Por eso las funciones que se pasan a `commit()` tienen que ser deterministas:
  los ids y las fechas se calculan antes de llamarla, nunca adentro.
- La app recarga sola al volver a la pestana y al recuperar la conexion; el
  boton "Actualizar" del pie hace lo mismo a mano.
- Sin conexion muestra la ultima copia vista (guardada en el dispositivo) y
  **no deja editar**, para no crear cambios que despues se pierdan.

Lo que protege los datos son las politicas RLS: cada fila solo la ve y la
escribe su dueno (`auth.uid() = user_id`). La key `publishable` que va en
`js/config.js` esta hecha para ir en el navegador y no da acceso a nada por si
sola.

## Estructura

```
index.html        estructura minima, carga los scripts en orden
css/styles.css    tema claro/oscuro segun el sistema, mobile-first
js/config.js      URL y key de Supabase (vacio = modo local)
js/logic.js       logica pura: fechas, parseo de texto, resumen, rutinas
js/storage.js     unica capa de persistencia: store local y store Supabase
js/app.js         UI: render completo + delegacion de eventos
supabase/schema.sql  tabla, politicas RLS y trigger (idempotente)
tests/logic.test.js  pruebas de logic.js y storage.js
manifest.json, sw.js, icon.svg   para instalarla como app
```

Pruebas (65, incluidas las del calendario y las de sincronizacion y login
contra un Supabase falso):

```bash
node tests/logic.test.js
```

## Convenciones (no romper)

- Sin build ni dependencias propias. Orden de scripts:
  supabase (CDN) -> `config.js` -> `logic.js` -> `storage.js` -> `app.js`.
- Fechas SIEMPRE strings `'YYYY-MM-DD'` en hora local. Nunca `toISOString()`
  para fechas de dia: en Chile (UTC-3/-4) corre el dia.
- `js/logic.js` se mantiene puro (sin DOM ni estado) y compatible con
  CommonJS: lo consumen los tests con `require()`. Si se toca la logica, se
  agrega prueba.
- Todo string del usuario pasa por `esc()` antes de interpolarse en HTML.
- Toda escritura pasa por `commit(fn)` y `fn` tiene que ser determinista e
  idempotente: se puede reaplicar sobre lo que venga de la base.
- `load()` y `mutate()` del store devuelven **copias**, nunca la cache interna:
  si devolvieran la cache, el cambio optimista de `commit()` quedaria aplicado
  dos veces (esto ya paso una vez, hay prueba de regresion).
- `render()` no escribe nada. Lo que crea instancias de rutinas es
  `ensureRoutines()`, que se llama explicitamente.
- Ningun control de formulario puede llamarse `id`, `action`, `method`,
  `elements` ni `submit`: el named getter del DOM sombrea esas propiedades del
  `<form>` (por eso el campo oculto se llama `actId`).
- `AUTH_EMAIL_DOMAIN` es intocable: cambiarlo deja fuera a todas las cuentas.
  Y el proyecto de Supabase tiene que quedarse con "Confirm email" apagado.
- El service worker es **network-first**: al publicar cambios llegan al tiro y
  el cache queda solo para uso sin conexion. Al cambiar archivos del shell hay
  que subir el numero de `CACHE`.

## Publicar

Para abrirla desde el celular tiene que estar en una direccion web. Con GitHub
Pages: el repositorio debe ser **publico** si la cuenta usa GitHub Free ("If the
account that owns the repository uses GitHub Free... the repository must be
public"). El codigo publico no expone nada: los datos estan en la base,
protegidos por el login y las politicas RLS.

Una vez publicada, en el celular: abrir la direccion, menu del navegador,
"Agregar a la pantalla de inicio". Queda con icono propio y sin barra de
direcciones.

## Ideas pendientes

- Vista de mes y arrastrar actividades entre dias.
- Avisar de choques de horario en la UI (`Logic.overlaps` ya los calcula).
- Realtime de Supabase para que el cambio del celular aparezca sin recargar.
- Plantillas de semana ("semana tipica") para partir de una base.
- Recordatorios con notificaciones.
