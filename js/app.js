/*
 * app.js - UI. Todo el HTML se genera aqui; render() reemplaza #app completo.
 *
 * Reglas:
 * - TODO string que venga del usuario pasa por esc() antes de interpolarse.
 * - Toda escritura pasa por commit(fn). fn tiene que ser DETERMINISTA: los
 *   ids y las fechas se calculan antes de llamarla, nunca adentro, porque el
 *   store puede reaplicarla sobre lo que venga de la base si el celular
 *   guardo primero.
 * - render() no escribe nada. Lo que crea instancias de rutinas es
 *   ensureRoutines(), que se llama explicitamente.
 */
(function () {
  'use strict';

  var store = null;
  var state = null;
  var session = null;
  var mode = 'local';        // 'local' | 'nube'
  var offline = false;       // modo nube sin poder hablar con la base
  var saving = false;
  var authMsg = '';

  var root = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  var view = {
    week: Logic.startOfWeek(Logic.todayISO()),
    modal: null,             // {type:'activity'|'areas', ...}
    quick: ''
  };

  // ------------------------------------------------------------- utilidades

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function color(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c)) ? c : '#8a8f98'; }

  function areaById(id) {
    for (var i = 0; state && i < state.areas.length; i++) {
      if (state.areas[i].id === id) return state.areas[i];
    }
    return { id: id, label: id || 'Sin area', color: '#8a8f98', goalMinutes: 0 };
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  function errText(err) {
    var m = String((err && err.message) || err || '');
    if (m === 'SIN_SESION') return 'Se cerro la sesion: entra de nuevo.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexion: el cambio no se guardo.';
    return m || 'No se pudo guardar.';
  }

  function slug(text, taken) {
    var base = Logic.norm(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'area';
    var id = base, n = 2;
    while (taken.indexOf(id) !== -1) id = base + '-' + (n++);
    return id;
  }

  // ------------------------------------------------------------- escrituras

  /** Aplica fn de inmediato (optimista) y la manda al store; revierte si falla. */
  function commit(fn, focusSel) {
    if (!store || offline) {
      toast('Sin conexion con la base: el cambio no se guardo.');
      return;
    }
    var before = Store.clone(state);
    fn(state);
    saving = true;
    render(focusSel);

    store.mutate(fn).then(function (fresh) {
      state = fresh;
      saving = false;
      render(focusSel);
    }).catch(function (err) {
      state = before;
      saving = false;
      render();
      toast(errText(err));
    });
  }

  /** Crea las instancias de las rutinas activas para la semana visible. */
  function ensureRoutines() {
    if (!state || offline) return;
    if (view.week < Logic.startOfWeek(Logic.todayISO())) return;   // no reescribir el pasado
    var dates = Logic.weekDates(view.week);
    var pending = Logic.pendingRoutineActivities(state.routines, state.activities, dates, state.skips);
    if (!pending.length) return;
    commit(function (s) {
      var have = {};
      s.activities.forEach(function (a) {
        if (a.routineId) have[Logic.skipKey(a.routineId, a.date)] = true;
      });
      s.activities = s.activities.concat(pending.filter(function (p) {
        return !have[Logic.skipKey(p.routineId, p.date)];
      }));
    });
  }

  function refresh(focusSel) {
    if (!store) return Promise.resolve();
    return store.load().then(function (fresh) {
      state = fresh;
      offline = false;
      render(focusSel);
      ensureRoutines();
    }).catch(function (err) {
      if (String(err && err.message) === 'SIN_SESION') { session = null; render(); return; }
      var last = mode === 'nube' ? Store.lastKnownState() : null;
      offline = true;
      state = last || state;
      render();
      toast(errText(err));
    });
  }

  // --------------------------------------------------------------- render

  function renderTopbar(dates) {
    var isThisWeek = view.week === Logic.startOfWeek(Logic.todayISO());
    return '' +
      '<div class="topbar">' +
        '<div>' +
          '<h1>Mi Semana</h1>' +
          '<div class="sub">' + esc(Logic.longDate(dates[0])) + ' al ' + esc(Logic.longDate(dates[6])) +
            (saving ? ' &middot; guardando...' : '') + '</div>' +
        '</div>' +
        '<div class="spacer"></div>' +
        '<div class="weeknav">' +
          '<button class="btn icon" data-act="week" data-delta="-1" aria-label="Semana anterior">&#8592;</button>' +
          '<span class="label">' + esc(Logic.weekLabel(view.week)) + '</span>' +
          '<button class="btn icon" data-act="week" data-delta="1" aria-label="Semana siguiente">&#8594;</button>' +
          (isThisWeek ? '' : '<button class="btn small" data-act="today">Hoy</button>') +
        '</div>' +
      '</div>';
  }

  function renderOfflineBanner() {
    if (!offline) return '';
    return '<div class="banner">Sin conexion con la base. Estas viendo la ultima copia guardada en este ' +
      'dispositivo y no se puede editar. <button class="btn small" data-act="reintentar">Reintentar</button></div>';
  }

  function renderQuick(dates) {
    var today = Logic.todayISO();
    var target = dates.indexOf(today) !== -1 ? today : dates[0];
    return '' +
      '<form class="quick" id="quick-form" autocomplete="off">' +
        '<input type="text" id="quick" name="quick" placeholder="Ej: Cena con Ayleen #pareja vie 20:30 2h" value="' + esc(view.quick) + '">' +
        '<button class="btn primary" type="submit">Agregar</button>' +
        '<button class="btn" type="button" data-act="new" data-date="' + esc(target) + '" title="Formulario completo">&#43;&#8230;</button>' +
      '</form>' +
      '<p class="hint">' +
        '<code>#area</code> &middot; dia (<code>hoy</code>, <code>manana</code>, <code>mar</code>, <code>25/08</code>) &middot; ' +
        'hora con dos puntos (<code>20:30</code>) &middot; duracion (<code>90min</code>, <code>1.5h</code>) &middot; ' +
        '<code>cada martes</code> para que se repita.' +
      '</p>';
  }

  function renderBalance(summary) {
    var cards = summary.areas.map(function (b) {
      var goal = b.goalMinutes
        ? '<b>' + esc(Logic.formatMinutes(b.done)) + '</b> de ' + esc(Logic.formatMinutes(b.goalMinutes))
        : '<b>' + esc(Logic.formatMinutes(b.done)) + '</b> hechos';
      return '' +
        '<div class="card" style="--area:' + color(b.color) + '">' +
          '<div class="card-top"><span class="dot"></span><h3>' + esc(b.label) + '</h3></div>' +
          '<div class="nums">' + goal + ' &middot; ' + esc(Logic.formatMinutes(b.planned)) + ' agendados (' + b.count + ')</div>' +
          '<div class="bar" role="img" aria-label="' + b.pct + ' por ciento de la meta">' +
            '<span class="planned" style="width:' + b.plannedPct + '%"></span>' +
            '<span class="done" style="width:' + b.pct + '%"></span>' +
          '</div>' +
        '</div>';
    }).join('');
    return '<div class="cards">' + cards + '</div>';
  }

  function renderWarnings(list) {
    if (!list.length) return '';
    return '<ul class="warnings">' + list.map(function (w) {
      return '<li class="' + (w.level === 'warn' ? 'warn' : '') + '">' + esc(w.text) + '</li>';
    }).join('') + '</ul>';
  }

  function renderItem(a) {
    var ar = areaById(a.areaId);
    var when = a.time
      ? esc(a.time) + '&ndash;' + esc(Logic.endTime(a.time, a.minutes))
      : 'sin hora';
    return '' +
      '<div class="item' + (a.done ? ' done' : '') + '" style="--area:' + color(ar.color) + '">' +
        '<input type="checkbox" data-act="toggle" data-id="' + esc(a.id) + '"' + (a.done ? ' checked' : '') +
          ' aria-label="Marcar ' + esc(a.title) + ' como hecho">' +
        '<div class="body" data-act="edit" data-id="' + esc(a.id) + '" tabindex="0" role="button">' +
          '<div class="title">' + esc(a.title) + (a.routineId ? ' &#8635;' : '') + '</div>' +
          '<div class="meta"><span>' + when + '</span><span>' + esc(Logic.formatMinutes(a.minutes)) + '</span>' +
            '<span>' + esc(ar.label) + '</span></div>' +
        '</div>' +
        '<button class="btn danger small rm" data-act="del" data-id="' + esc(a.id) + '" aria-label="Eliminar">&times;</button>' +
      '</div>';
  }

  function renderWeek(dates, weekActs) {
    var today = Logic.todayISO();
    var byDay = {};
    Logic.sortActivities(weekActs).forEach(function (a) {
      (byDay[a.date] = byDay[a.date] || []).push(a);
    });
    var loads = Logic.minutesByDay(weekActs, dates);

    return '<div class="week">' + dates.map(function (d, i) {
      var items = byDay[d] || [];
      var cls = 'day' + (d === today ? ' today' : '') + (d < today ? ' past' : '');
      return '' +
        '<div class="' + cls + '">' +
          '<div class="day-head">' +
            '<span class="name">' + esc(Logic.DAY_SHORT[i]) + '</span>' +
            '<span class="muted">' + esc(Logic.parseISO(d).getDate()) + '</span>' +
            '<span class="load">' + (loads[i] ? esc(Logic.formatMinutes(loads[i])) : '') + '</span>' +
          '</div>' +
          (items.length
            ? '<div class="items">' + items.map(renderItem).join('') + '</div>'
            : '<div class="empty">Libre</div>') +
          '<button class="add-day" data-act="new" data-date="' + esc(d) + '">+ agregar</button>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderRoutines() {
    var rows = state.routines.map(function (r) {
      var ar = areaById(r.areaId);
      return '' +
        '<div class="row' + (r.active === false ? ' off' : '') + '" style="--area:' + color(ar.color) + '">' +
          '<input type="checkbox" data-act="routine-active" data-id="' + esc(r.id) + '"' +
            (r.active === false ? '' : ' checked') + ' aria-label="Activar rutina">' +
          '<div class="grow">' +
            '<div>' + esc(r.title) + '</div>' +
            '<div class="muted">' + esc(Logic.DAY_NAMES[r.weekday]) + ' &middot; ' +
              (r.time ? esc(r.time) + ' &middot; ' : '') + esc(Logic.formatMinutes(r.minutes)) +
              ' &middot; ' + esc(ar.label) + '</div>' +
          '</div>' +
          '<button class="btn danger small" data-act="routine-del" data-id="' + esc(r.id) + '">Eliminar</button>' +
        '</div>';
    }).join('');
    return '' +
      '<div class="section-head"><h2>Rutinas semanales</h2>' +
        '<span class="sub muted">se agendan solas cada semana</span></div>' +
      (state.routines.length
        ? '<div class="rows">' + rows + '</div>'
        : '<div class="empty">Sin rutinas. Escribe <code>cada martes</code> en el agregado rapido, ' +
          'o marca "repetir cada semana" al crear una actividad.</div>');
  }

  function renderFooter() {
    var cuenta = mode === 'nube' && session
      ? '<span>Sincronizado como ' + esc(session.user.email) + '</span>' +
        '<button class="btn small" data-act="sync">Actualizar</button>' +
        '<button class="btn small" data-act="signout">Cerrar sesion</button>'
      : '<span>Los datos se guardan solo en este navegador.</span>';
    return '' +
      '<div class="footer">' +
        '<button class="btn small" data-act="areas">Areas y metas</button>' +
        '<button class="btn small" data-act="export">Exportar copia</button>' +
        '<button class="btn small" data-act="import">Importar</button>' +
        '<input type="file" id="import-file" accept="application/json,.json" hidden>' +
        '<span class="spacer"></span>' +
        cuenta +
      '</div>';
  }

  // ---------------------------------------------------------------- modales

  function areaOptions(selected) {
    return state.areas.map(function (a) {
      return '<option value="' + esc(a.id) + '"' + (a.id === selected ? ' selected' : '') + '>' +
        esc(a.label) + '</option>';
    }).join('');
  }

  function renderActivityModal(m) {
    var a = m.activity;
    var isNew = !a.id;
    return modalShell(isNew ? 'Nueva actividad' : 'Editar actividad',
      '<form id="activity-form" autocomplete="off">' +
        // ojo: no llamar "id" a un control, sombrearia form.id (named getter del DOM)
        '<input type="hidden" name="actId" value="' + esc(a.id || '') + '">' +
        '<div class="field"><label for="f-title">Que vas a hacer</label>' +
          '<input type="text" id="f-title" name="title" required value="' + esc(a.title || '') + '"></div>' +
        '<div class="grid2">' +
          '<div class="field"><label for="f-area">Area</label>' +
            '<select id="f-area" name="areaId">' + areaOptions(a.areaId) + '</select></div>' +
          '<div class="field"><label for="f-date">Dia</label>' +
            '<input type="date" id="f-date" name="date" value="' + esc(a.date || Logic.todayISO()) + '"></div>' +
        '</div>' +
        '<div class="grid2">' +
          '<div class="field"><label for="f-time">Hora (opcional)</label>' +
            '<input type="time" id="f-time" name="time" value="' + esc(a.time || '') + '"></div>' +
          '<div class="field"><label for="f-min">Duracion (min)</label>' +
            '<input type="number" id="f-min" name="minutes" min="0" step="5" value="' + esc(a.minutes || 60) + '"></div>' +
        '</div>' +
        '<div class="field"><label for="f-notes">Notas</label>' +
          '<textarea id="f-notes" name="notes" rows="2">' + esc(a.notes || '') + '</textarea></div>' +
        (isNew
          ? '<label class="check"><input type="checkbox" name="repeat"> Repetir cada semana este mismo dia</label>'
          : (a.routineId ? '<p class="hint">Viene de una rutina semanal. Editarla aqui solo cambia esta semana.</p>' : '')) +
        '<div class="modal-actions">' +
          (isNew ? '' : '<button type="button" class="btn danger" data-act="del" data-id="' + esc(a.id) + '">Eliminar</button>') +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn" data-act="close-modal">Cancelar</button>' +
          '<button type="submit" class="btn primary">Guardar</button>' +
        '</div>' +
      '</form>');
  }

  function renderAreasModal() {
    var rows = state.areas.map(function (a) {
      return '' +
        '<div class="area-row" data-area="' + esc(a.id) + '">' +
          '<input type="color" name="color" value="' + color(a.color) + '" aria-label="Color">' +
          '<input type="text" name="label" value="' + esc(a.label) + '" aria-label="Nombre del area">' +
          '<input type="number" name="goalHours" min="0" step="0.5" value="' +
            esc(Math.round(a.goalMinutes / 6) / 10) + '" aria-label="Meta semanal en horas">' +
          '<button type="button" class="btn danger small" data-act="area-del" data-id="' + esc(a.id) + '">&times;</button>' +
        '</div>';
    }).join('');
    return modalShell('Areas y metas semanales',
      '<form id="areas-form" autocomplete="off">' +
        '<p class="hint">La meta en horas es cuanto quieres dedicarle a cada area por semana. Deja 0 si no quieres que te avise.</p>' +
        rows +
        '<button type="button" class="btn small" data-act="area-add">+ agregar area</button>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn" data-act="close-modal">Cancelar</button>' +
          '<button type="submit" class="btn primary">Guardar</button>' +
        '</div>' +
      '</form>');
  }

  function modalShell(title, inner) {
    return '' +
      '<div class="overlay" id="overlay">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
          '<h2>' + esc(title) + '</h2>' + inner +
        '</div>' +
      '</div>';
  }

  function renderModal() {
    if (!view.modal || !state) return '';
    if (view.modal.type === 'activity') return renderActivityModal(view.modal);
    if (view.modal.type === 'areas') return renderAreasModal();
    return '';
  }

  // ----------------------------------------------------------------- login

  function renderAuth() {
    root.innerHTML = '' +
      '<div class="auth">' +
        '<h1>Mi Semana</h1>' +
        '<p class="sub">Entra con tu correo para ver la misma agenda en el computador y en el celular.</p>' +
        '<form id="auth-form" autocomplete="on">' +
          '<div class="field"><label for="a-email">Correo</label>' +
            '<input type="email" id="a-email" name="email" required autocomplete="username"></div>' +
          '<div class="field"><label for="a-pass">Contrasena</label>' +
            '<input type="password" id="a-pass" name="password" required minlength="6" autocomplete="current-password"></div>' +
          (authMsg ? '<p class="authmsg">' + esc(authMsg) + '</p>' : '') +
          '<div class="modal-actions">' +
            '<button type="button" class="btn" data-act="signup">Crear cuenta</button>' +
            '<span class="spacer"></span>' +
            '<button type="submit" class="btn primary">Entrar</button>' +
          '</div>' +
        '</form>' +
        '<p class="hint">La contrasena la maneja Supabase; esta pagina no la guarda ni la envia a ningun otro lado.</p>' +
      '</div>';
    var f = root.querySelector('#a-email');
    if (f) f.focus();
  }

  function credentials() {
    var f = document.getElementById('auth-form');
    if (!f) return null;
    var email = f.elements.email.value.trim();
    var password = f.elements.password.value;
    if (!email || !password) { authMsg = 'Falta el correo o la contrasena.'; renderAuth(); return null; }
    return { email: email, password: password };
  }

  // ---------------------------------------------------------------- render

  function render(focusSel) {
    if (mode === 'nube' && !session && !offline) { renderAuth(); return; }
    if (!state) {
      root.innerHTML = '<div class="auth"><h1>Mi Semana</h1><p class="sub">Cargando...</p></div>';
      return;
    }

    var dates = Logic.weekDates(view.week);
    var weekActs = Logic.inWeek(state.activities, dates);
    var summary = Logic.summarizeWeek(weekActs, state.areas);
    var warnings = Logic.balanceWarnings(summary, weekActs, dates);

    root.innerHTML =
      renderTopbar(dates) +
      renderOfflineBanner() +
      renderQuick(dates) +
      renderBalance(summary) +
      renderWarnings(warnings) +
      renderWeek(dates, weekActs) +
      renderRoutines() +
      renderFooter() +
      renderModal();

    var focus = focusSel && root.querySelector(focusSel);
    if (focus) {
      focus.focus();
      if (focus.setSelectionRange && focus.value) {
        try { focus.setSelectionRange(focus.value.length, focus.value.length); } catch (e) { /* input sin seleccion */ }
      }
    }
  }

  // -------------------------------------------------------------- acciones

  function addFromQuick(text) {
    var parsed = Logic.parseQuickAdd(text, {
      areas: state.areas,
      today: Logic.todayISO(),
      weekStart: view.week
    });
    if (!parsed.title) { toast('Falta el nombre de la actividad'); return; }

    if (parsed.repeat) {
      var routine = {
        id: Logic.uid('rut'),
        title: parsed.title,
        areaId: parsed.areaId,
        weekday: parsed.weekday,
        time: parsed.time,
        minutes: parsed.minutes,
        notes: '',
        active: true
      };
      view.quick = '';
      commit(function (s) { s.routines = s.routines.concat([routine]); }, '#quick');
      toast('Rutina creada: cada ' + Logic.DAY_NAMES[routine.weekday].toLowerCase());
      ensureRoutines();
    } else {
      var act = {
        id: Logic.uid('act'),
        title: parsed.title,
        areaId: parsed.areaId,
        date: parsed.date,
        time: parsed.time,
        minutes: parsed.minutes,
        done: false,
        notes: '',
        routineId: null,
        createdAt: new Date().toISOString()
      };
      view.quick = '';
      commit(function (s) { s.activities = s.activities.concat([act]); }, '#quick');
    }
  }

  function findActivity(id) {
    for (var i = 0; i < state.activities.length; i++) {
      if (state.activities[i].id === id) return state.activities[i];
    }
    return null;
  }

  function deleteActivity(id) {
    var a = findActivity(id);
    if (!a) return;
    var routineId = a.routineId, date = a.date;
    view.modal = null;
    commit(function (s) {
      if (routineId) s.skips[Logic.skipKey(routineId, date)] = true;
      s.activities = s.activities.filter(function (x) { return x.id !== id; });
    });
  }

  function saveActivityForm(form) {
    var data = {};
    ['actId', 'title', 'areaId', 'date', 'time', 'minutes', 'notes'].forEach(function (k) {
      data[k] = form.elements[k] ? form.elements[k].value : '';
    });
    var title = data.title.trim();
    if (!title) { toast('Falta el nombre'); return; }
    if (!Logic.isISO(data.date)) { toast('Fecha invalida'); return; }

    var minutes = Math.max(0, Math.round(Number(data.minutes) || 0));
    var time = /^([01]\d|2[0-3]):[0-5]\d$/.test(data.time) ? data.time : null;
    var campos = {
      title: title, areaId: data.areaId, date: data.date,
      time: time, minutes: minutes, notes: data.notes
    };

    if (data.actId) {
      var id = data.actId;
      view.modal = null;
      commit(function (s) {
        s.activities.forEach(function (a) { if (a.id === id) Object.assign(a, campos); });
      });
    } else {
      var nueva = Object.assign({
        id: Logic.uid('act'), done: false, routineId: null,
        createdAt: new Date().toISOString()
      }, campos);
      var rutina = null;
      if (form.elements.repeat && form.elements.repeat.checked) {
        rutina = {
          id: Logic.uid('rut'), title: title, areaId: data.areaId,
          weekday: Logic.weekdayIndex(data.date), time: time,
          minutes: minutes, notes: data.notes, active: true
        };
      }
      view.modal = null;
      commit(function (s) {
        s.activities = s.activities.concat([nueva]);
        if (rutina) s.routines = s.routines.concat([rutina]);
      });
    }
  }

  /** Lee el formulario de areas sin guardarlo todavia. */
  function readAreasForm() {
    var form = document.getElementById('areas-form');
    if (!form) return null;
    var next = [];
    var taken = [];
    Array.prototype.forEach.call(form.querySelectorAll('.area-row'), function (row) {
      var id = row.getAttribute('data-area');
      var label = row.querySelector('[name="label"]').value.trim() || 'Area';
      var hours = Number(row.querySelector('[name="goalHours"]').value) || 0;
      var col = row.querySelector('[name="color"]').value;
      if (!id) id = slug(label, taken);
      taken.push(id);
      next.push({ id: id, label: label, color: color(col), goalMinutes: Math.max(0, Math.round(hours * 60)) });
    });
    return next.length ? next : null;
  }

  function saveAreas(extra) {
    var next = readAreasForm();
    if (!next) { toast('Deja al menos un area'); return null; }
    if (extra) next = next.concat([extra]);
    return next;
  }

  function deleteArea(id) {
    var next = readAreasForm() || state.areas;
    if (next.length <= 1) { toast('Debe quedar al menos un area'); return; }
    var used = state.activities.filter(function (a) { return a.areaId === id; }).length +
      state.routines.filter(function (r) { return r.areaId === id; }).length;
    var label = areaById(id).label;
    if (used && !confirm('"' + label + '" tiene ' + used + ' actividad(es). Se moveran a la primera area. Continuar?')) return;

    var quedan = next.filter(function (a) { return a.id !== id; });
    var fallback = quedan[0].id;
    commit(function (s) {
      s.areas = quedan;
      s.activities.forEach(function (a) { if (a.areaId === id) a.areaId = fallback; });
      s.routines.forEach(function (r) { if (r.areaId === id) r.areaId = fallback; });
    });
  }

  function exportFile() {
    var text = Store.exportText(state);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'mi-semana-' + Logic.todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var imported;
      try {
        imported = Store.importText(String(reader.result));
      } catch (e) {
        toast('El archivo no es un respaldo valido');
        return;
      }
      if (!confirm('Esto reemplaza lo que tienes guardado ahora' +
        (mode === 'nube' ? ' en la base (tambien en el celular)' : '') + '. Continuar?')) return;
      if (!store || offline) { toast('Sin conexion con la base: no se importo.'); return; }
      store.replace(imported).then(function (fresh) {
        state = fresh;
        render();
        toast('Datos importados');
      }).catch(function (err) { toast(errText(err)); });
    };
    reader.readAsText(file);
  }

  // -------------------------------------------------------------- eventos

  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    // getAttribute y no form.id: un control llamado "id" sombrearia la propiedad
    var which = form.getAttribute('id');
    if (which === 'quick-form') {
      ev.preventDefault();
      addFromQuick(form.elements.quick.value);
    } else if (which === 'activity-form') {
      ev.preventDefault();
      saveActivityForm(form);
    } else if (which === 'areas-form') {
      ev.preventDefault();
      var next = saveAreas(null);
      if (!next) return;
      view.modal = null;
      commit(function (s) { s.areas = next; });
    } else if (which === 'auth-form') {
      ev.preventDefault();
      var c = credentials();
      if (!c) return;
      authMsg = 'Entrando...';
      renderAuth();
      store.signIn(c.email, c.password).then(function () {
        authMsg = '';
      }).catch(function (err) {
        authMsg = errText(err);
        renderAuth();
      });
    }
  });

  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'quick') view.quick = ev.target.value;
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    var act = t.getAttribute && t.getAttribute('data-act');
    if (act === 'toggle') {
      var id = t.getAttribute('data-id');
      var done = t.checked;
      commit(function (s) {
        s.activities.forEach(function (a) { if (a.id === id) a.done = done; });
      });
    } else if (act === 'routine-active') {
      var rid = t.getAttribute('data-id');
      var activa = t.checked;
      commit(function (s) {
        s.routines.forEach(function (r) { if (r.id === rid) r.active = activa; });
      });
      if (activa) ensureRoutines();
    } else if (t.id === 'import-file' && t.files && t.files[0]) {
      importFile(t.files[0]);
    }
  });

  var pointerDownOnOverlay = false;
  document.addEventListener('pointerdown', function (ev) {
    pointerDownOnOverlay = ev.target.id === 'overlay';
  });

  document.addEventListener('click', function (ev) {
    if (ev.target.id === 'overlay') {
      // cerrar solo si el gesto empezo y termino en el fondo: no perder el
      // formulario al arrastrar desde un input
      if (pointerDownOnOverlay) { view.modal = null; render(); }
      return;
    }
    var btn = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');

    if (act === 'week') {
      view.week = Logic.addDays(view.week, 7 * Number(btn.getAttribute('data-delta')));
      render();
      ensureRoutines();
    } else if (act === 'today') {
      view.week = Logic.startOfWeek(Logic.todayISO());
      render();
      ensureRoutines();
    } else if (act === 'new') {
      view.modal = {
        type: 'activity',
        activity: {
          date: btn.getAttribute('data-date') || Logic.todayISO(),
          areaId: state.areas[0].id,
          minutes: 60
        }
      };
      render('#f-title');
    } else if (act === 'edit') {
      var a = findActivity(id);
      if (a) { view.modal = { type: 'activity', activity: a }; render('#f-title'); }
    } else if (act === 'del') {
      deleteActivity(id);
    } else if (act === 'routine-del') {
      if (confirm('Eliminar la rutina? Las actividades ya agendadas se quedan.')) {
        commit(function (s) {
          s.routines = s.routines.filter(function (r) { return r.id !== id; });
        });
      }
    } else if (act === 'areas') {
      view.modal = { type: 'areas' };
      render();
    } else if (act === 'area-add') {
      var taken = state.areas.map(function (x) { return x.id; });
      var nueva = { id: slug('nueva', taken), label: 'Nueva area', color: '#8a8f98', goalMinutes: 0 };
      var next = saveAreas(nueva);
      if (next) commit(function (s) { s.areas = next; });
    } else if (act === 'area-del') {
      deleteArea(id);
    } else if (act === 'close-modal') {
      view.modal = null;
      render();
    } else if (act === 'export') {
      exportFile();
    } else if (act === 'import') {
      var input = document.getElementById('import-file');
      if (input) input.click();
    } else if (act === 'sync' || act === 'reintentar') {
      refresh();
    } else if (act === 'signout') {
      store.signOut().then(function () {
        session = null; state = null; authMsg = ''; render();
      });
    } else if (act === 'signup') {
      var c = credentials();
      if (!c) return;
      authMsg = 'Creando cuenta...';
      renderAuth();
      store.signUp(c.email, c.password).then(function (r) {
        if (r.needsConfirm) {
          authMsg = 'Cuenta creada. Revisa tu correo para confirmarla y despues entra aqui.';
          renderAuth();
        } else {
          authMsg = '';
        }
      }).catch(function (err) {
        authMsg = errText(err);
        renderAuth();
      });
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && view.modal) { view.modal = null; render(); }
    if (ev.key === 'Enter' && ev.target.getAttribute && ev.target.getAttribute('data-act') === 'edit') {
      ev.preventDefault();
      ev.target.click();
    }
  });

  // Al volver a la pestana (o al recuperar la red) traer lo que haya guardado
  // el otro dispositivo.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && mode === 'nube' && session && !saving) refresh();
  });
  window.addEventListener('online', function () {
    if (mode === 'nube' && session) refresh();
  });

  // ----------------------------------------------------------------- boot

  function boot() {
    var cfg = window.APP_CONFIG || {};
    var conNube = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

    if (conNube && window.supabase) {
      mode = 'nube';
      store = Store.makeSupabaseStore(cfg, window.supabase);
      store.onAuthChange(function (s) {
        var antes = session && session.user && session.user.id;
        session = s;
        if (s && s.user.id !== antes) refresh();
        else if (!s) { state = null; render(); }
      });
      store.session().then(function (s) {
        session = s;
        if (s) refresh(); else render();
      }).catch(function () { render(); });
    } else if (conNube) {
      // la libreria no cargo (sin conexion): mostrar la ultima copia, sin editar
      mode = 'nube';
      offline = true;
      state = Store.lastKnownState();
      render();
      if (!state) {
        root.innerHTML = '<div class="auth"><h1>Mi Semana</h1>' +
          '<p class="sub">No se pudo cargar la conexion con la base y no hay copia local en este ' +
          'dispositivo. Conectate a internet y recarga la pagina.</p></div>';
      }
    } else {
      mode = 'local';
      store = Store.makeLocalStore();
      refresh();
    }
  }

  // Service worker solo sirve por http(s); abriendo el archivo directo no aplica.
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sin cache offline */ });
  }

  boot();
})();
