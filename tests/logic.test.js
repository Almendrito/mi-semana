/* Pruebas de la logica pura: node tests/logic.test.js */
var assert = require('assert');
var L = require('../js/logic.js');
var S = require('../js/storage.js');

var pass = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    console.error('FALLA: ' + name);
    console.error('  ' + e.message);
    process.exitCode = 1;
  }
}

var pendientes = [];
function testAsync(name, fn) {
  pendientes.push(function () {
    return Promise.resolve().then(fn).then(function () {
      pass++;
    }, function (e) {
      console.error('FALLA: ' + name);
      console.error('  ' + e.message);
      process.exitCode = 1;
    });
  });
}

var AREAS = S.DEFAULT_AREAS;
var TODAY = '2026-07-29';   // miercoles
var WEEK = '2026-07-27';    // lunes de esa semana

// ------------------------------------------------------------------ fechas

test('weekdayIndex usa lunes = 0', function () {
  assert.strictEqual(L.weekdayIndex('2026-07-27'), 0);
  assert.strictEqual(L.weekdayIndex('2026-08-02'), 6);
});

test('startOfWeek retrocede al lunes, incluso desde domingo', function () {
  assert.strictEqual(L.startOfWeek('2026-07-29'), '2026-07-27');
  assert.strictEqual(L.startOfWeek('2026-08-02'), '2026-07-27');
  assert.strictEqual(L.startOfWeek('2026-08-03'), '2026-08-03');
});

test('addDays cruza fin de mes sin usar UTC', function () {
  assert.strictEqual(L.addDays('2026-07-31', 1), '2026-08-01');
  assert.strictEqual(L.addDays('2026-01-01', -1), '2025-12-31');
});

test('weekDates devuelve 7 dias correlativos', function () {
  var d = L.weekDates(WEEK);
  assert.strictEqual(d.length, 7);
  assert.strictEqual(d[0], '2026-07-27');
  assert.strictEqual(d[6], '2026-08-02');
});

test('isISO rechaza fechas inexistentes', function () {
  assert.strictEqual(L.isISO('2026-02-30'), false);
  assert.strictEqual(L.isISO('2026-2-3'), false);
  assert.strictEqual(L.isISO('2026-02-28'), true);
});

test('formatMinutes y endTime', function () {
  assert.strictEqual(L.formatMinutes(90), '1 h 30 min');
  assert.strictEqual(L.formatMinutes(120), '2 h');
  assert.strictEqual(L.formatMinutes(45), '45 min');
  assert.strictEqual(L.endTime('20:30', 90), '22:00');
  assert.strictEqual(L.endTime('23:30', 60), '00:30');  // pasa medianoche
  assert.strictEqual(L.endTime(null, 60), null);
});

// ------------------------------------------------------------------- areas

test('matchArea: exacto, prefijo unico y ambiguo', function () {
  assert.strictEqual(L.matchArea(AREAS, 'pareja'), 'pareja');
  assert.strictEqual(L.matchArea(AREAS, 'par'), 'pareja');
  assert.strictEqual(L.matchArea(AREAS, 'per'), 'personal');
  assert.strictEqual(L.matchArea(AREAS, 'pro'), 'profesional');
  assert.strictEqual(L.matchArea(AREAS, 'p'), null);   // demasiado corto
  assert.strictEqual(L.matchArea(AREAS, 'xyz'), null);
});

test('matchArea ignora acentos y mayusculas', function () {
  var areas = [{ id: 'academico', label: 'Académico' }];
  assert.strictEqual(L.matchArea(areas, 'ACADEMICO'), 'academico');
  assert.strictEqual(L.matchArea(areas, 'acadé'), 'academico');
});

// --------------------------------------------------------------- quick add

function q(text) {
  return L.parseQuickAdd(text, { areas: AREAS, today: TODAY, weekStart: WEEK });
}

test('quick add completo: area, dia, hora y duracion', function () {
  var r = q('Cena con Ayleen #pareja vie 20:30 2h');
  assert.strictEqual(r.title, 'Cena con Ayleen');
  assert.strictEqual(r.areaId, 'pareja');
  assert.strictEqual(r.date, '2026-07-31');
  assert.strictEqual(r.time, '20:30');
  assert.strictEqual(r.minutes, 120);
  assert.strictEqual(r.repeat, false);
});

test('quick add sin nada extra usa hoy y una hora por defecto', function () {
  var r = q('Ordenar el escritorio');
  assert.strictEqual(r.title, 'Ordenar el escritorio');
  assert.strictEqual(r.date, TODAY);
  assert.strictEqual(r.time, null);
  assert.strictEqual(r.minutes, 60);
  assert.strictEqual(r.areaId, AREAS[0].id);
});

test('quick add: hoy / manana / pasado', function () {
  assert.strictEqual(q('Algo manana').date, '2026-07-30');
  assert.strictEqual(q('Algo mañana').date, '2026-07-30');
  assert.strictEqual(q('Algo pasado').date, '2026-07-31');
  assert.strictEqual(q('Algo hoy').date, TODAY);
});

test('quick add: fecha dd/mm', function () {
  var r = q('Llamar a mama 25/08 #familia');
  assert.strictEqual(r.date, '2026-08-25');
  assert.strictEqual(r.areaId, 'familia');
  assert.strictEqual(r.title, 'Llamar a mama');
});

test('quick add: duracion separada y en minutos', function () {
  assert.strictEqual(q('Almuerzo 1.5 h').minutes, 90);
  assert.strictEqual(q('Almuerzo 1,5h').minutes, 90);
  assert.strictEqual(q('Trote 45min').minutes, 45);
  assert.strictEqual(q('Trote 45 minutos').minutes, 45);
});

test('quick add: la hora necesita dos puntos, Nh es duracion', function () {
  var r = q('Reunion 9:00 2h');
  assert.strictEqual(r.time, '09:00');
  assert.strictEqual(r.minutes, 120);
  assert.strictEqual(r.title, 'Reunion');
});

test('quick add: "cada martes" crea rutina en el dia correcto', function () {
  var r = q('Gimnasio #personal cada martes 45min');
  assert.strictEqual(r.repeat, true);
  assert.strictEqual(r.weekday, 1);
  assert.strictEqual(r.date, '2026-07-28');
  assert.strictEqual(r.title, 'Gimnasio');
  assert.strictEqual(r.minutes, 45);
});

test('quick add: "todos los domingos" tambien repite', function () {
  var r = q('Almuerzo familiar #familia todos los domingos 13:00');
  assert.strictEqual(r.repeat, true);
  assert.strictEqual(r.weekday, 6);
  assert.strictEqual(r.date, '2026-08-02');
  assert.strictEqual(r.time, '13:00');
});

test('quick add: "cada semana" repite el dia indicado', function () {
  var r = q('Informe vie cada semana');
  assert.strictEqual(r.repeat, true);
  assert.strictEqual(r.weekday, 4);
  assert.strictEqual(r.title, 'Informe');
});

test('quick add: texto vacio no inventa titulo', function () {
  assert.strictEqual(q('   ').title, '');
});

test('quick add: no se come palabras del titulo que no son tokens', function () {
  var r = q('Marcar el informe #profesional');
  assert.strictEqual(r.title, 'Marcar el informe');
  assert.strictEqual(r.date, TODAY);
});

// -------------------------------------------------------------- resumen

var DATES = L.weekDates(WEEK);

function act(o) {
  return {
    id: o.id || L.uid('a'), title: o.title || 'x', areaId: o.areaId,
    date: o.date, time: o.time || null, minutes: o.minutes,
    done: !!o.done, routineId: o.routineId || null, createdAt: '2026-07-27T00:00:00Z'
  };
}

test('inWeek filtra por la semana pedida', function () {
  var list = [act({ areaId: 'pareja', date: '2026-07-28', minutes: 60 }),
              act({ areaId: 'pareja', date: '2026-08-05', minutes: 60 })];
  assert.strictEqual(L.inWeek(list, DATES).length, 1);
});

test('summarizeWeek suma planificado y hecho por area', function () {
  var list = [
    act({ areaId: 'pareja', date: '2026-07-28', minutes: 120, done: true }),
    act({ areaId: 'pareja', date: '2026-07-30', minutes: 60 }),
    act({ areaId: 'familia', date: '2026-08-01', minutes: 180, done: true })
  ];
  var s = L.summarizeWeek(list, AREAS);
  var pareja = s.areas.filter(function (a) { return a.id === 'pareja'; })[0];
  assert.strictEqual(pareja.planned, 180);
  assert.strictEqual(pareja.done, 120);
  assert.strictEqual(pareja.count, 2);
  assert.strictEqual(pareja.doneCount, 1);
  assert.strictEqual(pareja.pct, 20);          // 120 de 600
  assert.strictEqual(s.totals.planned, 360);
  assert.strictEqual(s.totals.done, 300);
});

test('summarizeWeek incluye areas sin actividades y respeta el orden', function () {
  var s = L.summarizeWeek([], AREAS);
  assert.strictEqual(s.areas.length, AREAS.length);
  assert.strictEqual(s.areas[0].id, AREAS[0].id);
  assert.strictEqual(s.areas[0].planned, 0);
});

test('summarizeWeek no se cae con un area desconocida', function () {
  var s = L.summarizeWeek([act({ areaId: 'fantasma', date: DATES[0], minutes: 30 })], AREAS);
  var extra = s.areas.filter(function (a) { return a.id === 'fantasma'; })[0];
  assert.strictEqual(extra.planned, 30);
  assert.strictEqual(s.areas[s.areas.length - 1].id, 'fantasma');
});

test('minutesByDay reparte por dia', function () {
  var list = [act({ areaId: 'pareja', date: DATES[1], minutes: 60 }),
              act({ areaId: 'familia', date: DATES[1], minutes: 30 })];
  var m = L.minutesByDay(list, DATES);
  assert.strictEqual(m[1], 90);
  assert.strictEqual(m[0], 0);
});

test('balanceWarnings avisa por area vacia, area bajo la meta y dia sobrecargado', function () {
  var list = [act({ areaId: 'pareja', date: DATES[1], minutes: 60 }),
              act({ areaId: 'profesional', date: DATES[1], minutes: 13 * 60 })];
  var w = L.balanceWarnings(L.summarizeWeek(list, AREAS), list, DATES);
  var texts = w.map(function (x) { return x.text; }).join(' | ');
  assert.ok(/no tienes nada agendado en familia/i.test(texts), 'falta aviso de Familia vacia');
  assert.ok(/pareja: agendaste/i.test(texts), 'falta aviso de Pareja bajo la meta');
  assert.ok(/martes tiene/i.test(texts), 'falta aviso de dia sobrecargado');
});

test('balanceWarnings calla si la meta esta cubierta', function () {
  var areas = [{ id: 'pareja', label: 'Pareja', color: '#fff', goalMinutes: 60 }];
  var list = [act({ areaId: 'pareja', date: DATES[1], minutes: 90 })];
  var w = L.balanceWarnings(L.summarizeWeek(list, areas), list, DATES);
  assert.strictEqual(w.length, 0);
});

// -------------------------------------------------------------- rutinas

var ROUTINES = [
  { id: 'r1', title: 'Gimnasio', areaId: 'personal', weekday: 1, time: '19:00', minutes: 45, active: true },
  { id: 'r2', title: 'Cena en pareja', areaId: 'pareja', weekday: 4, time: '20:30', minutes: 120, active: true },
  { id: 'r3', title: 'Apagada', areaId: 'familia', weekday: 6, minutes: 60, active: false }
];

test('pendingRoutineActivities crea una instancia por rutina activa', function () {
  var out = L.pendingRoutineActivities(ROUTINES, [], DATES, {});
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].date, '2026-07-28');
  assert.strictEqual(out[1].date, '2026-07-31');
  assert.strictEqual(out[0].routineId, 'r1');
  assert.strictEqual(out[0].done, false);
});

test('pendingRoutineActivities no duplica lo ya creado', function () {
  var existing = [act({ areaId: 'personal', date: '2026-07-28', minutes: 45, routineId: 'r1' })];
  var out = L.pendingRoutineActivities(ROUTINES, existing, DATES, {});
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].routineId, 'r2');
});

test('pendingRoutineActivities respeta lo borrado a mano (skips)', function () {
  var skips = {};
  skips[L.skipKey('r1', '2026-07-28')] = true;
  var out = L.pendingRoutineActivities(ROUTINES, [], DATES, skips);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].routineId, 'r2');
});

// -------------------------------------------------------------- choques

test('overlaps detecta actividades encimadas el mismo dia', function () {
  var list = [
    act({ id: 'a', areaId: 'pareja', date: DATES[1], time: '20:00', minutes: 90 }),
    act({ id: 'b', areaId: 'familia', date: DATES[1], time: '21:00', minutes: 60 }),
    act({ id: 'c', areaId: 'personal', date: DATES[1], time: '22:00', minutes: 30 }),
    act({ id: 'd', areaId: 'personal', date: DATES[2], time: '20:00', minutes: 60 })
  ];
  var o = L.overlaps(list);
  assert.strictEqual(o.length, 1);
  assert.strictEqual(o[0].a, 'a');
  assert.strictEqual(o[0].b, 'b');
});

test('overlaps ignora actividades sin hora', function () {
  var list = [act({ id: 'a', areaId: 'pareja', date: DATES[1], minutes: 600 }),
              act({ id: 'b', areaId: 'familia', date: DATES[1], minutes: 600 })];
  assert.strictEqual(L.overlaps(list).length, 0);
});

// ------------------------------------------------------------ calendario

test('timeToMin convierte la hora a minutos del dia', function () {
  assert.strictEqual(L.timeToMin('00:00'), 0);
  assert.strictEqual(L.timeToMin('09:30'), 570);
  assert.strictEqual(L.timeToMin('23:59'), 1439);
});

test('layoutDay deja en una sola columna lo que no se pisa', function () {
  var lista = [
    act({ id: 'a', areaId: 'pareja', date: DATES[0], time: '09:00', minutes: 60 }),
    act({ id: 'b', areaId: 'pareja', date: DATES[0], time: '10:00', minutes: 60 })
  ];
  var out = L.layoutDay(lista);
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out.map(function (b) { return [b.col, b.cols]; }), [[0, 1], [0, 1]]);
  assert.strictEqual(out[0].start, 540);
  assert.strictEqual(out[0].end, 600);
});

test('layoutDay pone lado a lado lo que se pisa', function () {
  var lista = [
    act({ id: 'a', areaId: 'pareja', date: DATES[0], time: '09:00', minutes: 120 }),
    act({ id: 'b', areaId: 'familia', date: DATES[0], time: '09:30', minutes: 60 }),
    act({ id: 'c', areaId: 'personal', date: DATES[0], time: '10:00', minutes: 30 })
  ];
  var out = L.layoutDay(lista);
  var porId = {};
  out.forEach(function (b) { porId[b.id] = b; });
  assert.strictEqual(porId.a.cols, 3, 'las tres se pisan entre si');
  assert.strictEqual(porId.a.col, 0);
  assert.strictEqual(porId.b.col, 1);
  assert.strictEqual(porId.c.col, 2);
});

test('layoutDay reutiliza la columna cuando la anterior ya termino', function () {
  var lista = [
    act({ id: 'a', areaId: 'pareja', date: DATES[0], time: '09:00', minutes: 180 }),
    act({ id: 'b', areaId: 'familia', date: DATES[0], time: '09:00', minutes: 60 }),
    act({ id: 'c', areaId: 'personal', date: DATES[0], time: '10:30', minutes: 60 })
  ];
  var porId = {};
  L.layoutDay(lista).forEach(function (b) { porId[b.id] = b; });
  assert.strictEqual(porId.c.col, porId.b.col, 'c entra en la columna de b, que ya termino');
  assert.notStrictEqual(porId.a.col, porId.b.col, 'a y b se pisan, no pueden compartir columna');
  assert.strictEqual(porId.a.cols, 2, 'el grupo necesita dos columnas, no tres');
});

test('layoutDay ignora lo que no tiene hora y no se pasa de medianoche', function () {
  var lista = [
    act({ id: 'a', areaId: 'pareja', date: DATES[0], minutes: 60 }),
    act({ id: 'b', areaId: 'pareja', date: DATES[0], time: '23:00', minutes: 180 })
  ];
  var out = L.layoutDay(lista);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].end, 24 * 60);
});

test('layoutDay le da alto minimo a las actividades de cero minutos', function () {
  var out = L.layoutDay([act({ id: 'a', areaId: 'pareja', date: DATES[0], time: '09:00', minutes: 0 })]);
  assert.strictEqual(out[0].end - out[0].start, 15);
});

test('calendarRange usa el horario por defecto y lo estira si hace falta', function () {
  assert.deepStrictEqual(L.calendarRange([]), { startHour: 7, endHour: 22 });
  var temprano = [act({ id: 'a', areaId: 'pareja', date: DATES[0], time: '06:15', minutes: 30 })];
  assert.strictEqual(L.calendarRange(temprano).startHour, 6);
  var tarde = [act({ id: 'b', areaId: 'pareja', date: DATES[0], time: '22:30', minutes: 60 })];
  assert.strictEqual(L.calendarRange(tarde).endHour, 24);
});

test('calendarRange nunca se sale del dia', function () {
  var r = L.calendarRange([act({ id: 'a', areaId: 'pareja', date: DATES[0], time: '23:50', minutes: 300 })]);
  assert.ok(r.startHour >= 0 && r.endHour <= 24 && r.endHour > r.startHour);
});

// -------------------------------------------------------------- storage

test('normalize rellena un estado vacio con los valores por defecto', function () {
  var s = S.normalize(null);
  assert.strictEqual(s.areas.length, 4);
  assert.deepStrictEqual(s.activities, []);
  assert.deepStrictEqual(s.routines, []);
});

test('normalize descarta actividades con fecha invalida y reasigna areas huerfanas', function () {
  var s = S.normalize({
    areas: [{ id: 'x', label: 'X', color: '#123456', goalMinutes: 60 }],
    activities: [
      { id: '1', title: 'ok', areaId: 'x', date: '2026-07-28', minutes: 30 },
      { id: '2', title: 'mala fecha', areaId: 'x', date: 'ayer', minutes: 30 },
      { id: '3', title: 'area muerta', areaId: 'zzz', date: '2026-07-28', minutes: 30 }
    ]
  });
  assert.strictEqual(s.activities.length, 2);
  assert.strictEqual(s.activities[1].areaId, 'x');
});

test('normalize limpia colores y horas invalidas', function () {
  var s = S.normalize({
    areas: [{ id: 'x', label: 'X', color: 'javascript:alert(1)', goalMinutes: -5 }],
    activities: [{ id: '1', title: 'ok', areaId: 'x', date: '2026-07-28', minutes: 30, time: '99:99' }]
  });
  assert.strictEqual(s.areas[0].color, '#8a8f98');
  assert.strictEqual(s.areas[0].goalMinutes, 0);
  assert.strictEqual(s.activities[0].time, null);
});

test('exportText / importText hacen ida y vuelta', function () {
  var s = S.normalize({
    areas: S.DEFAULT_AREAS,
    activities: [{ id: '1', title: 'Cena', areaId: 'pareja', date: '2026-07-31', minutes: 120, time: '20:30' }],
    routines: [ROUTINES[0]],
    skips: { 'r1|2026-07-28': true }
  });
  var back = S.importText(S.exportText(s));
  assert.deepStrictEqual(back, s);
});

function memStorage(seed) {
  var mem = seed || {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = v; },
    _mem: mem
  };
}

testAsync('makeLocalStore guarda y relee', function () {
  var fake = memStorage();
  var st = S.makeLocalStore(fake);
  return st.load()
    .then(function () {
      return st.mutate(function (s) {
        s.activities.push({ id: '1', title: 'Cena', areaId: 'pareja', date: '2026-07-31', minutes: 120 });
      });
    })
    .then(function (s) {
      assert.strictEqual(s.activities.length, 1);
      return S.makeLocalStore(fake).load();
    })
    .then(function (s2) {
      assert.strictEqual(s2.activities.length, 1);
      assert.strictEqual(s2.activities[0].title, 'Cena');
    });
});

testAsync('makeLocalStore avisa si el storage falla en vez de mentir', function () {
  var fake = {
    getItem: function () { return '{{{ roto'; },
    setItem: function () { throw new Error('QuotaExceeded'); }
  };
  var st = S.makeLocalStore(fake);
  return st.load()
    .then(function (s) {
      assert.strictEqual(s.activities.length, 0);
      return st.mutate(function (d) { d.activities.push({}); }).then(
        function () { throw new Error('deberia haber fallado'); },
        function (err) { assert.ok(/No se pudo guardar/.test(err.message)); }
      );
    });
});

// ------------------------------------------------- store de Supabase (falso)

/**
 * Cliente falso que imita lo justo de supabase-js: select/insert/update
 * encadenables y thenables, con la guarda de rev que da la concurrencia.
 */
function fakeClient(db) {
  function run(op) {
    var row = db.row;
    if (op.type === 'select') {
      var hit = row && row.user_id === op.filters.user_id ? { data: row.data, rev: row.rev } : null;
      return Promise.resolve({ data: hit, error: null });
    }
    if (op.type === 'insert') {
      if (row) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
      db.row = { user_id: op.payload.user_id, data: op.payload.data, rev: op.payload.rev };
      return Promise.resolve({ data: { data: db.row.data, rev: db.row.rev }, error: null });
    }
    if (op.type === 'update') {
      db.updates = (db.updates || 0) + 1;
      if (!row || row.user_id !== op.filters.user_id || row.rev !== op.filters.rev) {
        return Promise.resolve({ data: [], error: null });   // no toco ninguna fila
      }
      db.row = { user_id: row.user_id, data: op.payload.data, rev: op.payload.rev };
      return Promise.resolve({ data: [{ rev: db.row.rev }], error: null });
    }
    return Promise.resolve({ data: null, error: { message: 'op desconocida' } });
  }

  function builder() {
    var op = { type: 'select', payload: null, filters: {} };
    var b = {
      select: function () { return b; },
      insert: function (p) { op.type = 'insert'; op.payload = p; return b; },
      update: function (p) { op.type = 'update'; op.payload = p; return b; },
      eq: function (k, v) { op.filters[k] = v; return b; },
      maybeSingle: function () { return b; },
      single: function () { return b; },
      then: function (res, rej) { return run(op).then(res, rej); }
    };
    return b;
  }

  return {
    auth: {
      getSession: function () {
        return Promise.resolve({ data: { session: db.session || null } });
      },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; }
    },
    from: function () { return builder(); }
  };
}

function supaStore(db, storage) {
  return S.makeSupabaseStore(
    { SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'k' },
    { createClient: function () { return fakeClient(db); } },
    storage || memStorage()
  );
}

var SESION = { user: { id: 'u1', email: 'yo@ejemplo.cl' } };

testAsync('el store de Supabase exige sesion', function () {
  var db = { row: null, session: null };
  return supaStore(db).load().then(
    function () { throw new Error('deberia haber fallado'); },
    function (err) { assert.strictEqual(err.message, 'SIN_SESION'); }
  );
});

testAsync('la primera carga crea la fila del usuario', function () {
  var db = { row: null, session: SESION };
  var st = supaStore(db);
  return st.load().then(function (s) {
    assert.strictEqual(s.areas.length, 4);
    assert.strictEqual(db.row.user_id, 'u1');
    assert.ok(db.row.rev);
  });
});

testAsync('la primera carga sube lo que ya habia en este navegador', function () {
  var previo = S.normalize({
    areas: S.DEFAULT_AREAS,
    activities: [{ id: '1', title: 'Cena', areaId: 'pareja', date: '2026-07-31', minutes: 120 }]
  });
  var storage = memStorage();
  storage.setItem(S.KEY, JSON.stringify(previo));
  var db = { row: null, session: SESION };
  return supaStore(db, storage).load().then(function (s) {
    assert.strictEqual(s.activities.length, 1);
    assert.strictEqual(db.row.data.activities[0].title, 'Cena');
  });
});

testAsync('mutate guarda y avanza el rev', function () {
  var db = { row: null, session: SESION };
  var st = supaStore(db);
  return st.load().then(function () {
    var revAntes = db.row.rev;
    return st.mutate(function (s) {
      s.activities.push({ id: 'a1', title: 'Gimnasio', areaId: 'personal', date: '2026-07-28', minutes: 45 });
    }).then(function (s) {
      assert.strictEqual(s.activities.length, 1);
      assert.strictEqual(db.row.data.activities.length, 1);
      assert.notStrictEqual(db.row.rev, revAntes);
    });
  });
});

// Regresion: app.js aplica el cambio de una vez en su copia (optimista) y
// ademas se lo pasa al store. Si load/mutate entregaran la cache interna en vez
// de una copia, el cambio quedaria aplicado dos veces (actividades duplicadas).
function noDuplicaAlAplicarOptimista(st) {
  var act = { id: 'a1', title: 'Cena', areaId: 'pareja', date: '2026-07-31', minutes: 120 };
  var fn = function (s) { s.activities.push(act); };
  return st.load().then(function (ui) {
    fn(ui);                       // lo que hace commit() antes de renderizar
    return st.mutate(fn);
  }).then(function (fresh) {
    assert.strictEqual(fresh.activities.length, 1, 'la actividad quedo duplicada');
    return st.load();
  }).then(function (recargado) {
    assert.strictEqual(recargado.activities.length, 1);
  });
}

testAsync('el store local devuelve copias y no duplica el cambio optimista', function () {
  return noDuplicaAlAplicarOptimista(S.makeLocalStore(memStorage()));
});

testAsync('el store de Supabase devuelve copias y no duplica el cambio optimista', function () {
  return noDuplicaAlAplicarOptimista(supaStore({ row: null, session: SESION }));
});

testAsync('si el celular guardo primero, el cambio del PC se combina en vez de pisarlo', function () {
  var db = { row: null, session: SESION };
  var pc = supaStore(db);
  return pc.load().then(function () {
    // el celular escribe algo con OTRO rev mientras el PC tenia el anterior
    db.row = {
      user_id: 'u1',
      rev: 'rev-del-celular',
      data: {
        areas: S.DEFAULT_AREAS,
        activities: [{ id: 'cel', title: 'Almuerzo con mis papas', areaId: 'familia', date: '2026-08-02', minutes: 120 }],
        routines: [], skips: {}
      }
    };
    return pc.mutate(function (s) {
      s.activities.push({ id: 'pc', title: 'Cena con Ayleen', areaId: 'pareja', date: '2026-07-31', minutes: 120 });
    });
  }).then(function (s) {
    var titulos = s.activities.map(function (a) { return a.id; }).sort();
    assert.deepStrictEqual(titulos, ['cel', 'pc'], 'deben quedar las dos actividades');
    assert.strictEqual(db.row.data.activities.length, 2);
    assert.strictEqual(db.updates, 2, 'el primer intento choca y el segundo entra');
  });
});

testAsync('mutate se rinde con un mensaje claro si nunca logra escribir', function () {
  var db = { row: null, session: SESION };
  var st = supaStore(db);
  return st.load().then(function () {
    var original = db.row;
    // cada vez que alguien lee, otro dispositivo ya escribio: conflicto infinito
    Object.defineProperty(db, 'row', {
      get: function () { return { user_id: 'u1', rev: 'rev-' + Math.random(), data: original.data }; },
      set: function () {},
      configurable: true
    });
    return st.mutate(function (s) { s.activities.push({ id: 'x' }); }).then(
      function () { throw new Error('deberia haber fallado'); },
      function (err) { assert.ok(/otro dispositivo/.test(err.message), err.message); }
    );
  });
});

testAsync('lastKnownState devuelve la copia local de lo ultimo visto', function () {
  var storage = memStorage();
  var db = { row: null, session: SESION };
  var st = supaStore(db, storage);
  return st.load().then(function () {
    return st.mutate(function (s) {
      s.activities.push({ id: 'a1', title: 'Cena', areaId: 'pareja', date: '2026-07-31', minutes: 120 });
    });
  }).then(function () {
    var copia = S.lastKnownState(storage);
    assert.strictEqual(copia.activities.length, 1);
    assert.strictEqual(copia.activities[0].title, 'Cena');
  });
});

test('authMessage traduce los errores tipicos', function () {
  assert.ok(/incorrect/i.test(S.authMessage({ message: 'Invalid login credentials' })));
  assert.ok(/ya existe/i.test(S.authMessage({ message: 'User already registered' })));
  assert.ok(/6 caracteres/.test(S.authMessage({ message: 'Password should be at least 6 characters' })));
  assert.ok(/Sin conexion/.test(S.authMessage({ message: 'Failed to fetch' })));
  assert.ok(/Confirm email/.test(S.authMessage({ message: 'Email not confirmed' })));
});

// ------------------------------------------------------ usuarios sin correo

test('userToEmail arma el correo sintetico y es estable', function () {
  assert.strictEqual(S.userToEmail('mateo'), 'mateo@' + S.AUTH_EMAIL_DOMAIN);
  assert.strictEqual(S.userToEmail('  Mateo  '), 'mateo@' + S.AUTH_EMAIL_DOMAIN);
  assert.strictEqual(S.userToEmail('MATEO'), S.userToEmail('mateo'));
  assert.strictEqual(S.userToEmail('Mateo Ayanez'), 'mateoayanez@' + S.AUTH_EMAIL_DOMAIN);
  assert.strictEqual(S.userToEmail('mateo.a_1-x'), 'mateo.a_1-x@' + S.AUTH_EMAIL_DOMAIN);
});

test('userToEmail ignora acentos para que el usuario sea el mismo siempre', function () {
  assert.strictEqual(S.userToEmail('Mateo'), S.userToEmail('Máteo'));
});

test('userToEmail rechaza usuarios que no sirven', function () {
  assert.strictEqual(S.userToEmail('ab'), null);          // muy corto
  assert.strictEqual(S.userToEmail(''), null);
  assert.strictEqual(S.userToEmail('   '), null);
  assert.strictEqual(S.userToEmail('@@@'), null);         // no queda nada usable
  assert.strictEqual(S.userToEmail('.mateo'), null);      // no puede partir con punto
  assert.strictEqual(S.userToEmail('m'.repeat(33)), null); // muy largo
  assert.strictEqual(S.userToEmail('m'.repeat(32)), 'm'.repeat(32) + '@' + S.AUTH_EMAIL_DOMAIN);
});

test('emailToUser recupera el usuario para mostrarlo', function () {
  assert.strictEqual(S.emailToUser('mateo@' + S.AUTH_EMAIL_DOMAIN), 'mateo');
  assert.strictEqual(S.emailToUser(''), '');
});

test('el dominio sintetico no se cambia a la ligera', function () {
  // Cambiarlo deja fuera a todas las cuentas ya creadas: si esta prueba falla,
  // es porque alguien lo movio sin querer.
  assert.strictEqual(S.AUTH_EMAIL_DOMAIN, 'almendrito.github.io');
});

testAsync('signIn y signUp traducen el usuario a su correo sintetico', function () {
  var visto = {};
  var st = S.makeSupabaseStore(
    { SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'k' },
    { createClient: function () {
      return {
        from: function () { return {}; },
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: null } }); },
          onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
          signInWithPassword: function (c) {
            visto.signIn = c.email;
            return Promise.resolve({ data: { session: SESION }, error: null });
          },
          signUp: function (c) {
            visto.signUp = c.email;
            return Promise.resolve({ data: { session: SESION }, error: null });
          }
        }
      };
    } },
    memStorage()
  );
  return st.signIn('Mateo', 'clave123')
    .then(function () { return st.signUp('mateo', 'clave123'); })
    .then(function () {
      assert.strictEqual(visto.signIn, 'mateo@' + S.AUTH_EMAIL_DOMAIN);
      assert.strictEqual(visto.signUp, 'mateo@' + S.AUTH_EMAIL_DOMAIN);
      // usuario invalido ni siquiera llega a la red
      return st.signIn('ab', 'clave123').then(
        function () { throw new Error('deberia haber fallado'); },
        function (err) { assert.ok(/entre 3 y 32/.test(err.message), err.message); }
      );
    });
});

testAsync('si el proyecto exige confirmar el correo, signUp lo dice claro', function () {
  var st = S.makeSupabaseStore(
    { SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'k' },
    { createClient: function () {
      return {
        from: function () { return {}; },
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: null } }); },
          onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
          signUp: function () { return Promise.resolve({ data: { session: null, user: {} }, error: null }); }
        }
      };
    } },
    memStorage()
  );
  return st.signUp('mateo', 'clave123').then(
    function () { throw new Error('deberia haber fallado'); },
    function (err) { assert.ok(/Confirm email/.test(err.message), err.message); }
  );
});

test('dbMessage explica el error mas probable: falta correr el schema', function () {
  assert.ok(/schema\.sql/.test(S.dbMessage({ code: '42P01', message: 'relation "public.semana_state" does not exist' })));
  assert.ok(/schema\.sql/.test(S.dbMessage({ code: 'PGRST205', message: "Could not find the table 'public.semana_state'" })));
  assert.ok(/RLS/.test(S.dbMessage({ code: '42501', message: 'new row violates row-level security policy' })));
  assert.ok(/Sin conexion/.test(S.dbMessage({ message: 'Failed to fetch' })));
});

testAsync('un error de la base llega traducido a quien llama', function () {
  var db = { row: null, session: SESION };
  var st = S.makeSupabaseStore(
    { SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'k' },
    { createClient: function () {
      return {
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: SESION } }); },
          onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; }
        },
        from: function () {
          var b = {
            select: function () { return b; }, eq: function () { return b; },
            maybeSingle: function () { return b; },
            then: function (r) { return r({ data: null, error: { code: '42P01', message: 'does not exist' } }); }
          };
          return b;
        }
      };
    } },
    memStorage()
  );
  return st.load().then(
    function () { throw new Error('deberia haber fallado'); },
    function (err) { assert.ok(/schema\.sql/.test(err.message), err.message); }
  );
});

test('uuidv4 tiene forma de uuid', function () {
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(S.uuidv4()));
});

pendientes.reduce(function (chain, fn) {
  return chain.then(fn);
}, Promise.resolve()).then(function () {
  if (!process.exitCode) console.log('OK: ' + pass + ' pruebas');
});
