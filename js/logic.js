/*
 * logic.js - logica pura de Mi Semana.
 * Sin DOM, sin estado global, sin localStorage: lo consumen los tests con
 * require() y el navegador via window.Logic.
 * Regla del proyecto: las fechas SIEMPRE son strings 'YYYY-MM-DD' en hora
 * local. Nunca toISOString() para fechas de dia (en Chile corre el dia).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY_NAMES = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
  var DAY_SHORT = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
  var MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  var DAY_TOKENS = {
    lun: 0, lu: 0, lunes: 0,
    mar: 1, ma: 1, martes: 1,
    mie: 2, mi: 2, mier: 2, miercoles: 2,
    jue: 3, ju: 3, jueves: 3,
    vie: 4, vi: 4, viernes: 4,
    sab: 5, sa: 5, sabado: 5,
    dom: 6, do: 6, domingo: 6
  };

  /** Indice de dia, tolerando el plural de "los domingos" / "los sabados". */
  function dayTokenIndex(tok) {
    if (Object.prototype.hasOwnProperty.call(DAY_TOKENS, tok)) return DAY_TOKENS[tok];
    var singular = tok.replace(/s$/, '');
    if (Object.prototype.hasOwnProperty.call(DAY_TOKENS, singular)) return DAY_TOKENS[singular];
    return null;
  }

  var HOUR_UNITS = { h: 1, hr: 1, hrs: 1, hora: 1, horas: 1 };
  var MIN_UNITS = { m: 1, min: 1, mins: 1, minuto: 1, minutos: 1 };

  // ---------------------------------------------------------------- fechas

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function todayISO(d) {
    var x = d || new Date();
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  }

  function parseISO(iso) {
    var p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function isISO(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return false;
    var d = parseISO(iso);
    return todayISO(d) === iso;
  }

  function addDays(iso, n) {
    var d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return todayISO(d);
  }

  /** 0 = lunes ... 6 = domingo (getDay() usa 0 = domingo). */
  function weekdayIndex(iso) {
    return (parseISO(iso).getDay() + 6) % 7;
  }

  function startOfWeek(iso) {
    return addDays(iso, -weekdayIndex(iso));
  }

  function weekDates(mondayISO) {
    var out = [];
    for (var i = 0; i < 7; i++) out.push(addDays(mondayISO, i));
    return out;
  }

  function dayLabel(iso) {
    var d = parseISO(iso);
    return DAY_SHORT[weekdayIndex(iso)] + ' ' + d.getDate();
  }

  function longDate(iso) {
    var d = parseISO(iso);
    return d.getDate() + ' ' + MONTH_SHORT[d.getMonth()];
  }

  function weekLabel(mondayISO) {
    var end = addDays(mondayISO, 6);
    var a = parseISO(mondayISO), b = parseISO(end);
    var left = a.getDate() + (a.getMonth() === b.getMonth() ? '' : ' ' + MONTH_SHORT[a.getMonth()]);
    return left + ' - ' + b.getDate() + ' ' + MONTH_SHORT[b.getMonth()] +
      (a.getFullYear() === new Date().getFullYear() ? '' : ' ' + b.getFullYear());
  }

  function formatMinutes(min) {
    var m = Math.max(0, Math.round(Number(min) || 0));
    var h = Math.floor(m / 60);
    var r = m % 60;
    if (h && r) return h + ' h ' + r + ' min';
    if (h) return h + ' h';
    return r + ' min';
  }

  function endTime(time, minutes) {
    if (!time) return null;
    var p = time.split(':');
    var total = Number(p[0]) * 60 + Number(p[1]) + (Number(minutes) || 0);
    total = ((total % 1440) + 1440) % 1440;
    return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
  }

  // --------------------------------------------------------------- helpers

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim();
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 8);
  }

  /** Resuelve un token a un id de area: id exacto, luego prefijo unico (>=3). */
  function matchArea(areas, token) {
    var t = norm(token);
    if (!t) return null;
    var i, a;
    for (i = 0; i < areas.length; i++) {
      a = areas[i];
      if (norm(a.id) === t || norm(a.label) === t) return a.id;
    }
    if (t.length < 3) return null;
    var hit = null;
    for (i = 0; i < areas.length; i++) {
      a = areas[i];
      if (norm(a.id).indexOf(t) === 0 || norm(a.label).indexOf(t) === 0) {
        if (hit && hit !== a.id) return null; // ambiguo
        hit = a.id;
      }
    }
    return hit;
  }

  // -------------------------------------------------------------- quick add

  /**
   * Convierte una linea de texto en una actividad.
   *   "Cena con Ayleen #pareja mar 20:00 1.5h"
   *   "Gimnasio #personal cada lunes 45min"
   * Reglas: la hora SIEMPRE lleva ':' (20:00); '2h' / '90min' es duracion.
   * opts: { areas, today, weekStart, defaultAreaId, defaultMinutes }
   * Devuelve { title, areaId, date, time, minutes, repeat, weekday }.
   */
  function parseQuickAdd(text, opts) {
    opts = opts || {};
    var areas = opts.areas || [];
    var today = opts.today || todayISO();
    var weekStart = opts.weekStart || startOfWeek(today);
    var words = String(text || '').trim().split(/\s+/).filter(Boolean);

    var areaId = null, date = null, time = null, minutes = null;
    var repeat = false, weekday = null;
    var rest = [];

    function readUnit(value, unit) {
      var u = norm(unit);
      if (HOUR_UNITS[u]) return Math.round(parseFloat(String(value).replace(',', '.')) * 60);
      if (MIN_UNITS[u]) return Math.round(parseFloat(String(value).replace(',', '.')));
      return null;
    }

    for (var i = 0; i < words.length; i++) {
      var raw = words[i];
      var clean = raw.replace(/[.,;:!?]+$/, '');
      var n = norm(clean);
      if (!n) { rest.push(raw); continue; }

      // #area / @area
      if ((raw[0] === '#' || raw[0] === '@') && areaId === null) {
        var found = matchArea(areas, n.slice(1));
        if (found) { areaId = found; continue; }
      }

      // "cada martes" / "todos los martes"
      if ((n === 'cada' || n === 'todos' || n === 'todas') && !repeat) {
        var j = i + 1;
        if (j < words.length && /^(los|las|el|la)$/.test(norm(words[j]))) j++;
        var dayTok = norm(String(words[j] || '').replace(/[.,;:!?]+$/, ''));
        var dayIdx = dayTokenIndex(dayTok);
        if (dayIdx !== null) {
          repeat = true;
          weekday = dayIdx;
          i = j;
          continue;
        }
        if (dayTok === 'semana' || dayTok === 'dia' || dayTok === 'dias') {
          repeat = true;
          i = j;
          continue;
        }
      }

      // hora HH:MM
      if (time === null && /^([01]?\d|2[0-3]):[0-5]\d$/.test(n)) {
        var hp = n.split(':');
        time = pad(Number(hp[0])) + ':' + hp[1];
        continue;
      }

      // duracion pegada: 1.5h / 90min
      var dur = /^(\d+(?:[.,]\d+)?)\s*([a-z]+)$/.exec(n);
      if (minutes === null && dur) {
        var v = readUnit(dur[1], dur[2]);
        if (v !== null && v > 0) { minutes = v; continue; }
      }
      // duracion separada: "1.5 h"
      if (minutes === null && /^\d+(?:[.,]\d+)?$/.test(n) && i + 1 < words.length) {
        var v2 = readUnit(n, norm(words[i + 1]));
        if (v2 !== null && v2 > 0) { minutes = v2; i++; continue; }
      }

      // dia relativo
      if (date === null) {
        if (n === 'hoy') { date = today; continue; }
        if (n === 'manana') { date = addDays(today, 1); continue; }
        if (n === 'pasado') { date = addDays(today, 2); continue; }
        if (n === 'ayer') { date = addDays(today, -1); continue; }
        if (Object.prototype.hasOwnProperty.call(DAY_TOKENS, n) && n.length >= 3) {
          date = addDays(weekStart, DAY_TOKENS[n]);
          continue;
        }
        var dm = /^(\d{1,2})[\/-](\d{1,2})$/.exec(n);
        if (dm) {
          var year = parseISO(today).getFullYear();
          var cand = year + '-' + pad(Number(dm[2])) + '-' + pad(Number(dm[1]));
          if (isISO(cand)) { date = cand; continue; }
        }
      }

      rest.push(raw);
    }

    if (repeat && weekday === null) weekday = date ? weekdayIndex(date) : weekdayIndex(today);
    if (repeat && date === null) date = addDays(weekStart, weekday);
    if (!repeat && date === null) date = today;

    return {
      title: rest.join(' ').trim(),
      areaId: areaId || opts.defaultAreaId || (areas[0] && areas[0].id) || 'personal',
      date: date,
      time: time,
      minutes: minutes || opts.defaultMinutes || 60,
      repeat: repeat,
      weekday: repeat ? weekday : weekdayIndex(date)
    };
  }

  // ------------------------------------------------------------- rutinas

  function skipKey(routineId, date) { return routineId + '|' + date; }

  /**
   * Devuelve las actividades que faltan para materializar las rutinas activas
   * en la semana dada (no muta nada). Salta las instancias ya creadas y las
   * que el usuario borro a mano (skips).
   */
  function pendingRoutineActivities(routines, activities, dates, skips) {
    skips = skips || {};
    var existing = {};
    activities.forEach(function (a) {
      if (a.routineId) existing[skipKey(a.routineId, a.date)] = true;
    });
    var out = [];
    (routines || []).forEach(function (r) {
      if (r.active === false) return;
      var idx = Number(r.weekday);
      if (!(idx >= 0 && idx <= 6)) return;
      var date = dates[idx];
      var key = skipKey(r.id, date);
      if (existing[key] || skips[key]) return;
      out.push({
        id: uid('act'),
        title: r.title,
        areaId: r.areaId,
        date: date,
        time: r.time || null,
        minutes: Number(r.minutes) || 60,
        done: false,
        notes: r.notes || '',
        routineId: r.id,
        createdAt: new Date().toISOString()
      });
    });
    return out;
  }

  // -------------------------------------------------------------- balance

  function inWeek(activities, dates) {
    var set = {};
    dates.forEach(function (d) { set[d] = true; });
    return (activities || []).filter(function (a) { return set[a.date]; });
  }

  function sortActivities(list) {
    return list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var ta = a.time || '99:99', tb = b.time || '99:99';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return String(a.createdAt || '') < String(b.createdAt || '') ? -1 : 1;
    });
  }

  /** Resumen por area de una lista ya filtrada a la semana. */
  function summarizeWeek(activities, areas) {
    var byArea = {};
    (areas || []).forEach(function (a) {
      byArea[a.id] = {
        id: a.id, label: a.label, color: a.color,
        goalMinutes: Number(a.goalMinutes) || 0,
        planned: 0, done: 0, count: 0, doneCount: 0, pct: 0, plannedPct: 0
      };
    });
    (activities || []).forEach(function (act) {
      var b = byArea[act.areaId];
      if (!b) {
        b = byArea[act.areaId] = {
          id: act.areaId, label: act.areaId, color: '#8a8f98',
          goalMinutes: 0, planned: 0, done: 0, count: 0, doneCount: 0, pct: 0, plannedPct: 0
        };
      }
      var m = Math.max(0, Number(act.minutes) || 0);
      b.planned += m;
      b.count += 1;
      if (act.done) { b.done += m; b.doneCount += 1; }
    });

    var list = Object.keys(byArea).map(function (k) { return byArea[k]; });
    var totals = { planned: 0, done: 0, goal: 0, count: 0, doneCount: 0 };
    list.forEach(function (b) {
      b.pct = b.goalMinutes ? Math.min(100, Math.round(b.done / b.goalMinutes * 100)) : 0;
      b.plannedPct = b.goalMinutes ? Math.min(100, Math.round(b.planned / b.goalMinutes * 100)) : 0;
      totals.planned += b.planned;
      totals.done += b.done;
      totals.goal += b.goalMinutes;
      totals.count += b.count;
      totals.doneCount += b.doneCount;
    });
    // orden: el orden declarado de areas primero, extras al final
    var order = {};
    (areas || []).forEach(function (a, i) { order[a.id] = i; });
    list.sort(function (a, b) {
      var oa = order[a.id] === undefined ? 999 : order[a.id];
      var ob = order[b.id] === undefined ? 999 : order[b.id];
      return oa - ob;
    });
    return { areas: list, totals: totals };
  }

  function minutesByDay(activities, dates) {
    return dates.map(function (d) {
      var total = 0;
      (activities || []).forEach(function (a) {
        if (a.date === d) total += Math.max(0, Number(a.minutes) || 0);
      });
      return total;
    });
  }

  var OVERLOAD_MINUTES = 12 * 60;

  /**
   * Avisos de equilibrio: areas sin nada agendado, areas bajo su meta y dias
   * sobrecargados. Devuelve [{ level, text }].
   */
  function balanceWarnings(summary, activities, dates) {
    var out = [];
    summary.areas.forEach(function (b) {
      if (!b.goalMinutes) return;
      if (b.planned === 0) {
        out.push({ level: 'warn', text: 'No tienes nada agendado en ' + b.label + ' esta semana.' });
      } else if (b.planned < b.goalMinutes) {
        out.push({
          level: 'info',
          text: b.label + ': agendaste ' + formatMinutes(b.planned) + ' de ' +
            formatMinutes(b.goalMinutes) + ' (faltan ' + formatMinutes(b.goalMinutes - b.planned) + ').'
        });
      }
    });
    minutesByDay(activities, dates).forEach(function (m, i) {
      if (m > OVERLOAD_MINUTES) {
        out.push({
          level: 'warn',
          text: DAY_NAMES[i] + ' tiene ' + formatMinutes(m) + ' agendados: probablemente no cabe.'
        });
      }
    });
    return out;
  }

  /** Choques de horario dentro de un mismo dia (solo actividades con hora). */
  function overlaps(activities) {
    var withTime = (activities || []).filter(function (a) { return a.time; });
    var byDay = {};
    withTime.forEach(function (a) {
      (byDay[a.date] = byDay[a.date] || []).push(a);
    });
    var out = [];
    Object.keys(byDay).forEach(function (day) {
      var list = byDay[day].slice().sort(function (a, b) { return a.time < b.time ? -1 : 1; });
      for (var i = 0; i < list.length - 1; i++) {
        var a = list[i];
        var startA = Number(a.time.slice(0, 2)) * 60 + Number(a.time.slice(3));
        var endA = startA + (Number(a.minutes) || 0);
        for (var j = i + 1; j < list.length; j++) {
          var b = list[j];
          var startB = Number(b.time.slice(0, 2)) * 60 + Number(b.time.slice(3));
          if (startB >= endA) break;
          out.push({ date: day, a: a.id, b: b.id });
        }
      }
    });
    return out;
  }

  return {
    DAY_NAMES: DAY_NAMES,
    DAY_SHORT: DAY_SHORT,
    OVERLOAD_MINUTES: OVERLOAD_MINUTES,
    pad: pad,
    todayISO: todayISO,
    parseISO: parseISO,
    isISO: isISO,
    addDays: addDays,
    weekdayIndex: weekdayIndex,
    startOfWeek: startOfWeek,
    weekDates: weekDates,
    dayLabel: dayLabel,
    longDate: longDate,
    weekLabel: weekLabel,
    formatMinutes: formatMinutes,
    endTime: endTime,
    norm: norm,
    uid: uid,
    matchArea: matchArea,
    parseQuickAdd: parseQuickAdd,
    skipKey: skipKey,
    pendingRoutineActivities: pendingRoutineActivities,
    inWeek: inWeek,
    sortActivities: sortActivities,
    summarizeWeek: summarizeWeek,
    minutesByDay: minutesByDay,
    balanceWarnings: balanceWarnings,
    overlaps: overlaps
  };
});
