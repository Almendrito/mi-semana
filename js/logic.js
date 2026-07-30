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

  // ------------------------------------------------------------- calendario

  function timeToMin(t) {
    return Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5));
  }

  var MIN_BLOCK = 15;   // alto minimo de un bloque para que se pueda tocar

  /**
   * Reparte en columnas las actividades con hora de UN dia, al estilo de un
   * calendario: las que se pisan quedan lado a lado. Devuelve
   * [{ id, start, end, col, cols, item }] con minutos desde medianoche.
   */
  function layoutDay(items) {
    var evs = (items || [])
      .filter(function (a) { return a.time; })
      .map(function (a) {
        var s = timeToMin(a.time);
        var e = s + Math.max(MIN_BLOCK, Math.round(Number(a.minutes) || 0));
        return { id: a.id, start: s, end: Math.min(e, 24 * 60), item: a };
      })
      .sort(function (a, b) {
        if (a.start !== b.start) return a.start - b.start;
        return a.end - b.end;
      });

    var out = [];
    var grupo = [];
    var finGrupo = -1;

    function cerrar() {
      if (!grupo.length) return;
      var cols = [];   // cada columna guarda donde termina su ultimo evento
      grupo.forEach(function (ev) {
        var c = 0;
        while (c < cols.length && cols[c] > ev.start) c++;
        cols[c] = ev.end;
        ev.col = c;
      });
      grupo.forEach(function (ev) {
        out.push({ id: ev.id, start: ev.start, end: ev.end, col: ev.col, cols: cols.length, item: ev.item });
      });
      grupo = [];
      finGrupo = -1;
    }

    evs.forEach(function (ev) {
      if (grupo.length && ev.start >= finGrupo) cerrar();
      grupo.push(ev);
      finGrupo = Math.max(finGrupo, ev.end);
    });
    cerrar();
    return out;
  }

  /** Rango de horas que tiene que mostrar el calendario para que quepa todo. */
  function calendarRange(items, minHour, maxHour) {
    var lo = minHour == null ? 7 : minHour;
    var hi = maxHour == null ? 22 : maxHour;
    (items || []).forEach(function (a) {
      if (!a.time) return;
      var s = timeToMin(a.time);
      var e = Math.min(24 * 60, s + Math.max(MIN_BLOCK, Math.round(Number(a.minutes) || 0)));
      lo = Math.min(lo, Math.floor(s / 60));
      hi = Math.max(hi, Math.ceil(e / 60));
    });
    lo = Math.max(0, lo);
    hi = Math.min(24, Math.max(hi, lo + 1));
    return { startHour: lo, endHour: hi };
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
    skipKey: skipKey,
    pendingRoutineActivities: pendingRoutineActivities,
    inWeek: inWeek,
    sortActivities: sortActivities,
    summarizeWeek: summarizeWeek,
    minutesByDay: minutesByDay,
    balanceWarnings: balanceWarnings,
    timeToMin: timeToMin,
    layoutDay: layoutDay,
    calendarRange: calendarRange,
    overlaps: overlaps
  };
});
