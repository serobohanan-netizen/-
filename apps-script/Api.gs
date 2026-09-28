/**
 * Веб-приложение: открытие страницы и все запросы с сайта.
 * Каждый запрос проверяет сессию и права роли на сервере —
 * скрытые данные (деньги, себестоимость) вообще не уходят в браузер.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle("HOK'S LOVE — рабочая система")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Единая точка входа для запросов сайта */
function api(token, action, payload) {
  try {
    var user = requireUser_(token);
    if (user.mustChange && action !== 'me') throw new Error('Сначала смените временный пароль');
    var handlers = {
      me: function () { return user; },
      summary: function () { need_(user, 'summary'); return getSummary_(user, payload || {}); },
      tasks: function () { need_(user, 'tasks'); return getTasks_(user); },
      saveTask: function () { need_(user, 'tasks'); return saveTask_(user, payload || {}); },
      addComment: function () { need_(user, 'tasks'); return addComment_(user, payload || {}); },
      products: function () { need_(user, 'products'); return getProducts_(user); },
      templates: function () { need_(user, 'templates'); return getTemplates_(); },
      params: function () { need_(user, 'calc'); return getParams_(); }
    };
    if (!handlers[action]) throw new Error('Неизвестное действие');
    return { ok: true, data: handlers[action]() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function need_(user, section) {
  if (user.sections.indexOf(section) === -1) throw new Error('Нет доступа к этому разделу');
}

function readRows_(sheetName, width) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues()
    .filter(function (r) { return String(r[0]) !== ''; });
}

function num_(v) {
  if (typeof v === 'number') return v;
  var n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function dayKey_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/* ───────────── Сводка ───────────── */

function getSummary_(user, p) {
  var days = [7, 14, 30, 90].indexOf(Number(p.days)) >= 0 ? Number(p.days) : 7;
  var sources = { wb: SHEETS.WB, ozon: SHEETS.OZON };
  var byDay = {};  // ключ даты → { wb: [...], ozon: [...] }
  var lastDate = null;

  Object.keys(sources).forEach(function (mp) {
    readRows_(sources[mp], HEADERS.METRICS.length).forEach(function (r) {
      if (!(r[0] instanceof Date)) return;
      var key = dayKey_(r[0]);
      byDay[key] = byDay[key] || {};
      byDay[key][mp] = r.slice(1).map(num_);
      if (!lastDate || r[0] > lastDate) lastDate = r[0];
    });
  });
  if (!lastDate) return { empty: true, days: days };

  var DAY = 86400000;
  var end = new Date(dayKey_(lastDate) + 'T12:00:00');
  function period(offset) {
    var totals = { wb: zeros_(), ozon: zeros_() };
    var series = [];
    for (var i = days - 1; i >= 0; i--) {
      var key = dayKey_(new Date(end.getTime() - (i + offset) * DAY));
      var row = byDay[key] || {};
      ['wb', 'ozon'].forEach(function (mp) {
        if (row[mp]) row[mp].forEach(function (v, j) { totals[mp][j] += v; });
      });
      series.push({
        date: key,
        wb: row.wb ? row.wb[3] : 0,
        ozon: row.ozon ? row.ozon[3] : 0
      });
    }
    return { totals: totals, series: series };
  }

  var current = period(0);
  var previous = period(days);
  var result = {
    days: days,
    from: current.series[0].date,
    to: current.series[current.series.length - 1].date,
    money: user.money,
    series: current.series,
    wb: metrics_(current.totals.wb, previous.totals.wb, user.money),
    ozon: metrics_(current.totals.ozon, previous.totals.ozon, user.money),
    all: metrics_(sum_(current.totals.wb, current.totals.ozon),
                  sum_(previous.totals.wb, previous.totals.ozon), user.money)
  };
  return result;
}

function zeros_() { return [0, 0, 0, 0, 0, 0, 0, 0]; }
function sum_(a, b) { return a.map(function (v, i) { return v + b[i]; }); }
function ratio_(a, b) { return b ? a / b * 100 : null; }

/** Индексы: 0 показы, 1 переходы, 2 корзины, 3 заказы шт, 4 заказы ₽, 5 выкупы шт, 6 выкупы ₽, 7 реклама ₽ */
function metrics_(t, prev, money) {
  function pack(x) {
    var m = {
      impressions: x[0], clicks: x[1], carts: x[2], orders: x[3], buyouts: x[5],
      ctr: ratio_(x[1], x[0]),              // Кликабельность = Переходы ÷ Показы × 100
      cartRate: ratio_(x[2], x[1]),         // Конверсия в корзину = Корзины ÷ Переходы × 100
      orderRate: ratio_(x[3], x[2]),        // Конверсия в заказ = Заказы ÷ Корзины × 100
      buyoutRate: ratio_(x[5], x[3])        // Процент выкупа = Выкупы ÷ Заказы × 100
    };
    if (money) {
      m.ordersSum = x[4];
      m.buyoutsSum = x[6];
      m.ads = x[7];
      m.avgCheck = x[3] ? x[4] / x[3] : null;  // Средний чек = Заказы, ₽ ÷ Заказы, шт
      m.adShare = ratio_(x[7], x[4]);          // Доля рекламных расходов = Реклама ÷ Заказы, ₽ × 100
    }
    return m;
  }
  return { now: pack(t), prev: pack(prev) };
}

/* ───────────── Задачи ───────────── */

function getTasks_(user) {
  var users = readRows_(SHEETS.USERS, 4)
    .filter(function (r) { return r[3] === 'Да'; })
    .map(function (r) { return { login: normalizeLogin_(r[0]), name: String(r[1]) }; });
  var tz = Session.getScriptTimeZone();
  var tasks = readRows_(SHEETS.TASKS, HEADERS.TASKS.length).map(function (r) {
    return {
      id: Number(r[0]),
      created: r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'dd.MM.yyyy HH:mm') : String(r[1]),
      title: String(r[2]), description: String(r[3]), section: String(r[4]),
      assignee: normalizeLogin_(r[5]), author: normalizeLogin_(r[6]),
      due: r[7] instanceof Date ? dayKey_(r[7]) : '',
      priority: String(r[8]) || 'Обычный', status: String(r[9]) || 'Новая',
      comments: String(r[10]),
      updated: r[11] instanceof Date ? Utilities.formatDate(r[11], tz, 'dd.MM.yyyy HH:mm') : ''
    };
  });
  return {
    tasks: tasks, users: users,
    statuses: TASK_STATUSES, priorities: TASK_PRIORITIES, sections: TASK_SECTIONS
  };
}

function canEditTask_(user, row) {
  return user.allTasks || normalizeLogin_(row[5]) === user.login || normalizeLogin_(row[6]) === user.login;
}

function saveTask_(user, t) {
  var title = String(t.title || '').trim();
  if (!title) throw new Error('Укажите название задачи');
  if (TASK_STATUSES.indexOf(t.status) === -1) t.status = 'Новая';
  if (TASK_PRIORITIES.indexOf(t.priority) === -1) t.priority = 'Обычный';
  if (TASK_SECTIONS.indexOf(t.section) === -1) t.section = 'Другое';
  var due = /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') ? new Date(t.due + 'T12:00:00') : '';

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.TASKS);
    var rows = readRows_(SHEETS.TASKS, HEADERS.TASKS.length);
    var now = new Date();
    if (t.id) {
      for (var i = 0; i < rows.length; i++) {
        if (Number(rows[i][0]) === Number(t.id)) {
          if (!canEditTask_(user, rows[i])) throw new Error('Эту задачу может менять только автор, исполнитель или руководитель');
          sheet.getRange(i + 2, 3, 1, 8).setValues([[
            title, String(t.description || ''), t.section, normalizeLogin_(t.assignee),
            rows[i][6], due, t.priority, t.status]]);
          sheet.getRange(i + 2, 12).setValue(now);
          writeLog_(user.login, 'Изменена задача', t.id + ' ' + title + ' → ' + t.status);
          return { id: Number(t.id) };
        }
      }
      throw new Error('Задача не найдена');
    }
    var nextId = rows.reduce(function (m, r) { return Math.max(m, Number(r[0]) || 0); }, 0) + 1;
    sheet.appendRow([nextId, now, title, String(t.description || ''), t.section,
                     normalizeLogin_(t.assignee), user.login, due, t.priority, t.status, '', now]);
    writeLog_(user.login, 'Создана задача', nextId + ' ' + title);
    return { id: nextId };
  } finally {
    lock.releaseLock();
  }
}

function addComment_(user, p) {
  var text = String(p.text || '').trim();
  if (!text) throw new Error('Пустой комментарий');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.TASKS);
    var rows = readRows_(SHEETS.TASKS, HEADERS.TASKS.length);
    for (var i = 0; i < rows.length; i++) {
      if (Number(rows[i][0]) === Number(p.id)) {
        if (!canEditTask_(user, rows[i])) throw new Error('Нет доступа к задаче');
        var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
        var line = stamp + ' — ' + user.name + ': ' + text.slice(0, 1000);
        var all = rows[i][10] ? rows[i][10] + '\n' + line : line;
        sheet.getRange(i + 2, 11, 1, 2).setValues([[all, new Date()]]);
        return { comments: all };
      }
    }
    throw new Error('Задача не найдена');
  } finally {
    lock.releaseLock();
  }
}

/* ───────────── Товары и склад ───────────── */

function getProducts_(user) {
  var params = getParams_();
  var deficit = num_(params.zapas_deficit) || 0;
  var surplus = num_(params.zapas_izbytok) || 0;
  var items = readRows_(SHEETS.PRODUCTS, HEADERS.PRODUCTS.length).map(function (r) {
    var own = num_(r[9]), wb = num_(r[10]), ozon = num_(r[11]), perDay = num_(r[12]);
    var total = own + wb + ozon;                        // Остаток всего = свой склад + Wildberries + Ozon
    var daysLeft = perDay > 0 ? total / perDay : null;  // Дней запаса = Остаток всего ÷ Средние заказы в день
    var status;
    if (total === 0) status = 'Нет в наличии';
    else if (perDay === 0) status = 'Нет продаж';
    else if (deficit && daysLeft < deficit) status = 'Дефицит';
    else if (surplus && daysLeft > surplus) status = 'Избыток';
    else status = 'Норма';
    var item = {
      sku: String(r[0]), wbSku: String(r[1]), ozonSku: String(r[2]), title: String(r[3]),
      category: String(r[4]), material: String(r[5]),
      own: own, wb: wb, ozon: ozon, total: total, perDay: perDay,
      daysLeft: daysLeft, status: status
    };
    if (user.money) {
      item.price = num_(r[6]);
      item.discount = num_(r[7]);
      item.salePrice = item.price * (1 - item.discount / 100); // Цена со скидкой продавца
    }
    if (user.cost) item.cost = num_(r[8]);
    return item;
  });
  return { items: items, deficit: deficit, surplus: surplus, money: user.money, cost: user.cost };
}

/* ───────────── Шаблоны и параметры ───────────── */

function getTemplates_() {
  return readRows_(SHEETS.TEMPLATES, HEADERS.TEMPLATES.length).map(function (r) {
    return { id: String(r[0]), marketplace: String(r[1]), type: String(r[2]),
             rating: String(r[3]), situation: String(r[4]), text: String(r[5]) };
  });
}

function getParams_() {
  var out = {};
  readRows_(SHEETS.PARAMS, 3).forEach(function (r) {
    out[String(r[0])] = r[2] === '' ? '' : num_(r[2]);
  });
  return out;
}
