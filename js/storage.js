/*
 * storage.js - unica capa que toca la persistencia.
 *
 * Dos implementaciones con la MISMA interfaz (todo promesas):
 *   load()        -> Promise<state>
 *   mutate(fn)    -> Promise<state>   fn(draft) modifica una copia
 *   dispose()
 * makeLocalStore   : localStorage, un solo navegador.
 * makeSupabaseStore: fila por usuario en la base, sincroniza PC y celular.
 *
 * mutate recibe una FUNCION y no un estado ya modificado a proposito: si el
 * celular guardo algo entremedio, el store recarga lo de la base y reaplica el
 * cambio encima, en vez de pisarlo. Por eso fn tiene que ser determinista:
 * los ids y las fechas se calculan ANTES de llamar a mutate, nunca adentro.
 */
(function (root, factory) {
  var api = factory(root.Logic || (typeof require === 'function' ? require('./logic.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Store = api;
})(typeof self !== 'undefined' ? self : this, function (Logic) {
  'use strict';

  var KEY = 'mi-semana:v1';        // estado en modo local
  var MIRROR = 'mi-semana:nube';   // ultima copia vista de la nube (solo lectura)
  var TABLE = 'semana_state';
  var SCHEMA = 1;

  var DEFAULT_AREAS = [
    { id: 'profesional', label: 'Profesional', color: '#4f8cff', goalMinutes: 2400 },
    { id: 'pareja', label: 'Pareja', color: '#ff6b9d', goalMinutes: 600 },
    { id: 'familia', label: 'Familia', color: '#ffb84f', goalMinutes: 360 },
    { id: 'personal', label: 'Personal', color: '#4fd39a', goalMinutes: 300 }
  ];

  function defaultState() {
    return {
      schema: SCHEMA,
      areas: DEFAULT_AREAS.map(function (a) { return Object.assign({}, a); }),
      activities: [],
      routines: [],
      skips: {}
    };
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function isColor(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c)); }

  /** Rellena campos faltantes y descarta basura: tolera datos viejos o importados. */
  function normalize(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;

    var areas = Array.isArray(raw.areas) ? raw.areas : [];
    base.areas = areas
      .filter(function (a) { return a && typeof a.id === 'string' && a.id; })
      .map(function (a) {
        return {
          id: a.id,
          label: String(a.label || a.id),
          color: isColor(a.color) ? a.color : '#8a8f98',
          goalMinutes: Math.max(0, Math.round(Number(a.goalMinutes) || 0))
        };
      });
    if (!base.areas.length) base.areas = defaultState().areas;

    var areaIds = {};
    base.areas.forEach(function (a) { areaIds[a.id] = true; });
    var fallbackArea = base.areas[0].id;

    base.activities = (Array.isArray(raw.activities) ? raw.activities : [])
      .filter(function (a) { return a && Logic.isISO(a.date); })
      .map(function (a) {
        return {
          id: String(a.id || Logic.uid('act')),
          title: String(a.title || '(sin titulo)'),
          areaId: areaIds[a.areaId] ? a.areaId : fallbackArea,
          date: a.date,
          time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(a.time)) ? a.time : null,
          minutes: Math.max(0, Math.round(Number(a.minutes) || 0)),
          done: !!a.done,
          notes: String(a.notes || ''),
          routineId: a.routineId ? String(a.routineId) : null,
          createdAt: String(a.createdAt || new Date().toISOString())
        };
      });

    base.routines = (Array.isArray(raw.routines) ? raw.routines : [])
      .filter(function (r) { return r && Number(r.weekday) >= 0 && Number(r.weekday) <= 6; })
      .map(function (r) {
        return {
          id: String(r.id || Logic.uid('rut')),
          title: String(r.title || '(sin titulo)'),
          areaId: areaIds[r.areaId] ? r.areaId : fallbackArea,
          weekday: Number(r.weekday),
          time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.time)) ? r.time : null,
          minutes: Math.max(0, Math.round(Number(r.minutes) || 0)) || 60,
          notes: String(r.notes || ''),
          active: r.active !== false
        };
      });

    base.skips = {};
    if (raw.skips && typeof raw.skips === 'object') {
      Object.keys(raw.skips).forEach(function (k) {
        if (raw.skips[k]) base.skips[k] = true;
      });
    }
    base.schema = SCHEMA;
    return base;
  }

  // ------------------------------------------------------------ localStorage

  function browserStorage(given) {
    if (given) return given;
    try { return typeof localStorage !== 'undefined' ? localStorage : null; }
    catch (e) { return null; }   // cookies bloqueadas / modo incognito estricto
  }

  function readKey(storage, key) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeKey(storage, key, value) {
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;   // cuota llena
    }
  }

  function makeLocalStore(storage) {
    var s = browserStorage(storage);
    var cache = null;
    return {
      name: 'local',
      requiresAuth: false,
      // load y mutate SIEMPRE devuelven una copia: si entregaran la cache, quien
      // llama podria modificarla y el proximo mutate aplicaria el cambio dos veces.
      load: function () {
        cache = normalize(readKey(s, KEY));
        return Promise.resolve(clone(cache));
      },
      mutate: function (fn) {
        if (!cache) cache = normalize(readKey(s, KEY));
        var draft = clone(cache);
        fn(draft);
        if (!writeKey(s, KEY, draft)) {
          return Promise.reject(new Error('No se pudo guardar en este navegador (sin espacio o bloqueado).'));
        }
        cache = draft;
        return Promise.resolve(clone(cache));
      },
      replace: function (next) {
        return this.mutate(function (draft) {
          Object.keys(draft).forEach(function (k) { delete draft[k]; });
          Object.assign(draft, next);
        });
      },
      dispose: function () {}
    };
  }

  // --------------------------------------------------------------- Supabase

  function uuidv4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /*
   * Cuentas por USUARIO, no por correo. Supabase Auth exige un email, asi que
   * cada usuario se traduce a uno sintetico e inmutable
   * `<usuario>@almendrito.github.io`.
   *
   * Por que ese dominio y no algo tipo @mi-semana.local: GoTrue valida que el
   * dominio resuelva por DNS y rechaza los inventados. *.github.io resuelve
   * siempre, no recibe correo (no tiene MX) y nadie mas lo puede registrar, asi
   * que no hay forma de secuestrar la cuenta por "recuperar contrasena".
   *
   * NO CAMBIAR el dominio: romperia todos los logins ya creados.
   */
  var AUTH_EMAIL_DOMAIN = 'almendrito.github.io';

  function normalizeUser(name) {
    return Logic.norm(name).replace(/[^a-z0-9._-]+/g, '');
  }

  /** Devuelve el email sintetico, o null si el usuario no sirve. */
  function userToEmail(name) {
    var u = normalizeUser(name);
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(u)) return null;
    return u + '@' + AUTH_EMAIL_DOMAIN;
  }

  function emailToUser(email) {
    return String(email || '').split('@')[0];
  }

  var USUARIO_INVALIDO = 'El usuario necesita entre 3 y 32 caracteres: letras, numeros, punto, guion o guion bajo, sin espacios.';
  var FALTA_AUTOCONFIRM = 'Hay que apagar "Confirm email" en Supabase (Authentication > Sign In / Providers > Email). ' +
    'Con usuarios en vez de correos no hay donde llegue el mensaje de confirmacion.';

  /** Traduce los errores de Supabase Auth a algo legible. */
  function authMessage(err) {
    var m = String((err && (err.message || err.error_description)) || err || '');
    if (/Invalid login credentials/i.test(m)) return 'Usuario o contrasena incorrectos.';
    if (/Email not confirmed/i.test(m)) return FALTA_AUTOCONFIRM;
    if (/User already registered|already been registered/i.test(m)) return 'Ese usuario ya existe: entra en vez de crearlo.';
    if (/Password should be at least/i.test(m)) return 'La contrasena necesita al menos 6 caracteres.';
    if (/valid email|Email address .* invalid/i.test(m)) return USUARIO_INVALIDO;
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos seguidos: espera un momento.';
    if (/Signups not allowed/i.test(m)) return 'El proyecto tiene desactivado crear cuentas nuevas.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexion con la base.';
    return m || 'Error desconocido.';
  }

  /** Traduce los errores de la base (no los de login) a algo accionable. */
  function dbMessage(err) {
    var code = String((err && err.code) || '');
    var m = String((err && (err.message || err.hint)) || err || '');
    if (code === '42P01' || code === 'PGRST205' || /semana_state.*does not exist|Could not find the table/i.test(m)) {
      return 'Falta crear la tabla: ejecuta supabase/schema.sql en el SQL Editor de Supabase.';
    }
    if (code === '42501' || /row-level security|violates row-level/i.test(m)) {
      return 'La base rechazo la escritura (RLS). Revisa que ejecutaste el schema completo.';
    }
    if (/JWT|token is expired/i.test(m)) return 'Se vencio la sesion: entra de nuevo.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexion con la base.';
    return m || 'Error al hablar con la base.';
  }

  function makeSupabaseStore(cfg, lib, storage) {
    var client = lib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    var mirrorStorage = browserStorage(storage);
    var cache = null;
    var rev = null;
    var uid = null;

    function session() {
      return client.auth.getSession().then(function (r) {
        return (r.data && r.data.session) || null;
      });
    }

    function requireUid() {
      return session().then(function (s) {
        if (!s) throw new Error('SIN_SESION');
        uid = s.user.id;
        return uid;
      });
    }

    function mirror(state) { writeKey(mirrorStorage, MIRROR, state); }

    /** Primera vez de este usuario: sube lo que ya tenia en este navegador. */
    function seed() {
      var local = readKey(mirrorStorage, KEY);
      var initial = local ? normalize(local) : defaultState();
      var newRev = uuidv4();
      return client.from(TABLE)
        .insert({ user_id: uid, data: initial, rev: newRev })
        .select('data,rev')
        .single()
        .then(function (res) {
          if (res.error) {
            // 23505: otra pestana la creo primero. No es un error real.
            if (String(res.error.code) === '23505') return load();
            throw new Error(dbMessage(res.error));
          }
          cache = normalize(res.data.data);
          rev = res.data.rev;
          mirror(cache);
          return clone(cache);
        });
    }

    function load() {
      return requireUid()
        .then(function () {
          return client.from(TABLE).select('data,rev').eq('user_id', uid).maybeSingle();
        })
        .then(function (res) {
          if (res.error) throw new Error(dbMessage(res.error));
          if (!res.data) return seed();
          cache = normalize(res.data.data);
          rev = res.data.rev;
          mirror(cache);
          return clone(cache);
        });
    }

    function attempt(fn, tries) {
      var draft = clone(cache);
      fn(draft);
      var newRev = uuidv4();
      return client.from(TABLE)
        .update({ data: draft, rev: newRev })
        .eq('user_id', uid)
        .eq('rev', rev)
        .select('rev')
        .then(function (res) {
          if (res.error) throw new Error(dbMessage(res.error));
          if (res.data && res.data.length) {
            cache = draft;
            rev = res.data[0].rev;
            mirror(cache);
            return clone(cache);
          }
          // Nadie actualizo: o cambio el rev (guardo otro dispositivo) o no
          // existe la fila. En ambos casos recargar y reaplicar el cambio.
          if (tries <= 0) {
            throw new Error('Hay cambios desde otro dispositivo y no se pudo combinar. Recarga la pagina.');
          }
          return load().then(function () { return attempt(fn, tries - 1); });
        });
    }

    return {
      name: 'supabase',
      requiresAuth: true,
      client: client,
      session: session,
      onAuthChange: function (cb) {
        var sub = client.auth.onAuthStateChange(function (_evt, s) {
          if (!s) { cache = null; rev = null; uid = null; }
          cb(s || null);
        });
        return function () {
          if (sub && sub.data && sub.data.subscription) sub.data.subscription.unsubscribe();
        };
      },
      signIn: function (usuario, password) {
        var email = userToEmail(usuario);
        if (!email) return Promise.reject(new Error(USUARIO_INVALIDO));
        return client.auth.signInWithPassword({ email: email, password: password })
          .then(function (r) {
            if (r.error) throw new Error(authMessage(r.error));
            return r.data.session;
          });
      },
      signUp: function (usuario, password) {
        var email = userToEmail(usuario);
        if (!email) return Promise.reject(new Error(USUARIO_INVALIDO));
        return client.auth.signUp({ email: email, password: password })
          .then(function (r) {
            if (r.error) throw new Error(authMessage(r.error));
            // Sin sesion = el proyecto todavia exige confirmar el correo, y con
            // usuarios sinteticos ese correo no llega a ninguna parte.
            if (!r.data.session) throw new Error(FALTA_AUTOCONFIRM);
            return { session: r.data.session };
          });
      },
      signOut: function () {
        cache = null; rev = null; uid = null;
        return client.auth.signOut().then(function () { return true; });
      },
      /** Ultima copia vista, para mostrar algo cuando no hay conexion. */
      lastKnown: function () {
        var m = readKey(mirrorStorage, MIRROR);
        return m ? normalize(m) : null;
      },
      load: load,
      mutate: function (fn) {
        var start = cache ? Promise.resolve(cache) : load();
        return start.then(function () { return attempt(fn, 2); });
      },
      replace: function (next) {
        return this.mutate(function (draft) {
          Object.keys(draft).forEach(function (k) { delete draft[k]; });
          Object.assign(draft, next);
        });
      },
      dispose: function () {}
    };
  }

  // --------------------------------------------------------- exportar/importar

  function exportText(state) {
    return JSON.stringify({
      app: 'mi-semana',
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      data: state
    }, null, 2);
  }

  /** Acepta tanto el envoltorio de exportText como un estado plano. */
  function importText(text) {
    var parsed = JSON.parse(text);
    return normalize(parsed && parsed.data ? parsed.data : parsed);
  }

  /** Ultima copia vista de la nube, sin necesitar cliente ni sesion. */
  function lastKnownState(storage) {
    var m = readKey(browserStorage(storage), MIRROR);
    return m ? normalize(m) : null;
  }

  return {
    KEY: KEY,
    MIRROR: MIRROR,
    lastKnownState: lastKnownState,
    TABLE: TABLE,
    SCHEMA: SCHEMA,
    DEFAULT_AREAS: DEFAULT_AREAS,
    defaultState: defaultState,
    normalize: normalize,
    clone: clone,
    uuidv4: uuidv4,
    authMessage: authMessage,
    dbMessage: dbMessage,
    AUTH_EMAIL_DOMAIN: AUTH_EMAIL_DOMAIN,
    normalizeUser: normalizeUser,
    userToEmail: userToEmail,
    emailToUser: emailToUser,
    makeLocalStore: makeLocalStore,
    makeSupabaseStore: makeSupabaseStore,
    exportText: exportText,
    importText: importText
  };
});
