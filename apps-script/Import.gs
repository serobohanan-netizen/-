/**
 * Загрузка данных из ваших существующих Google Таблиц (куда уже выгружаются Wildberries, Ozon и Селсап).
 * Ключи не нужны: скрипт работает от имени владельца и читает таблицы, к которым у владельца есть доступ.
 * Только чтение источников. Пишет только в листы этой рабочей таблицы.
 *
 * Что откуда брать — задаётся на листе 90_Источники, без правки кода:
 *   Раздел | Поле | Таблица (ссылка) | Лист | Первая строка данных | Колонка в источнике | Пояснение
 * «Колонка в источнике» — буква (AV) или точный заголовок колонки (строка над первой строкой данных).
 * Таблицу и лист достаточно указать в строке ключевого поля раздела — остальные поля берут их оттуда.
 * Несколько колонок через «+» складываются: «N+O+P».
 * Пустая колонка = поле не загружается, значение на листе сайта остаётся как есть (можно вести вручную).
 */

// Функция, а не переменная: порядок загрузки файлов проекта не гарантирован
function importGroups_() {
  return {
    'Товары': { target: SHEETS.PRODUCTS, key: 'Баркод', header: HEADERS.PRODUCTS },
    'Показатели Wildberries': { target: SHEETS.WB, key: 'Дата', header: HEADERS.METRICS },
    'Показатели Ozon': { target: SHEETS.OZON, key: 'Дата', header: HEADERS.METRICS }
  };
}

// Поля товара, которые складываются, если в источнике несколько строк на артикул (например, размеры)
var PRODUCT_SUM_FIELDS = ['Остаток на своём складе, шт', 'Остаток на складах Wildberries, шт',
                          'Остаток на складах Ozon, шт', 'Средние заказы в день, шт'];

/** Строки для листа 90_Источники при первой сборке */
function importMappingTemplate_() {
  var rows = [];
  Object.keys(importGroups_()).forEach(function (group) {
    var g = importGroups_()[group];
    g.header.forEach(function (field) {
      rows.push([group, field, '', '', field === g.key ? 2 : '', '',
                 field === g.key ? 'Ключевое поле: укажите здесь таблицу, лист и первую строку данных' : '']);
    });
  });
  return rows;
}

/* ───────────── Чтение настроек ───────────── */

function readMapping_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.SOURCES);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('Лист «' + SHEETS.SOURCES + '» пустой');
  var groups = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues().forEach(function (r) {
    var group = String(r[0]).trim(), field = String(r[1]).trim();
    if (!importGroups_()[group] || !field) return;
    var g = groups[group] = groups[group] || { fields: {} };
    if (field === importGroups_()[group].key) {
      g.table = String(r[2]).trim(); g.sheet = String(r[3]).trim(); g.firstRow = Number(r[4]) || 2;
    }
    if (String(r[5]).trim() !== '') g.fields[field] = String(r[5]).trim();
  });
  return groups;
}

function openSource_(table) {
  if (!table) return SpreadsheetApp.getActive();
  var m = table.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return SpreadsheetApp.openById(m ? m[1] : table);
}

function colIndex_(spec, headerRow, where) {
  if (/^[A-Z]{1,3}$/.test(spec)) {
    return spec.split('').reduce(function (n, ch) { return n * 26 + ch.charCodeAt(0) - 64; }, 0) - 1;
  }
  var want = spec.toLowerCase();
  for (var i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i]).trim().toLowerCase() === want) return i;
  }
  throw new Error(where + ': колонка «' + spec + '» не найдена в строке заголовков');
}

function parseDate_(v) {
  if (v instanceof Date) return v;
  var s = String(v).trim(), m;
  if ((m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/))) return new Date(m[3] + '-' + m[2] + '-' + m[1] + 'T12:00:00');
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T12:00:00');
  return null;
}

/** Читает источник раздела: массив объектов { поле: значение } */
function readSource_(group, g) {
  var where = group + ' → ' + (g.sheet || '?');
  if (!g.sheet) throw new Error(group + ': не указан лист источника');
  if (!g.fields[importGroups_()[group].key]) throw new Error(group + ': не указана колонка ключевого поля «' + importGroups_()[group].key + '»');
  var sheet = openSource_(g.table).getSheetByName(g.sheet);
  if (!sheet) throw new Error(where + ': лист не найден');
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < g.firstRow) return [];
  var headerRow = g.firstRow > 1 ? sheet.getRange(g.firstRow - 1, 1, 1, lastCol).getValues()[0] : [];
  var data = sheet.getRange(g.firstRow, 1, lastRow - g.firstRow + 1, lastCol).getValues();
  var cols = {};
  // «N+O+P» — сумма нескольких колонок (например, остатки на трёх складах Селсапа)
  Object.keys(g.fields).forEach(function (f) {
    cols[f] = g.fields[f].split('+').map(function (part) { return colIndex_(part.trim(), headerRow, where); });
  });
  return data.map(function (row) {
    var o = {};
    Object.keys(cols).forEach(function (f) {
      o[f] = cols[f].length === 1 ? row[cols[f][0]]
        : cols[f].reduce(function (sum, i) { return sum + num_(row[i]); }, 0);
    });
    return o;
  });
}

/* ───────────── Товары ───────────── */

function importProducts_(g) {
  var def = importGroups_()['Товары'], key = def.key, keyIdx = def.header.indexOf(key);
  var merged = {}, order = [];
  readSource_('Товары', g).forEach(function (o) {
    var k = String(o[key] == null ? '' : o[key]).trim();
    if (!k) return;
    if (!merged[k]) { merged[k] = {}; order.push(k); }
    var m = merged[k];
    Object.keys(o).forEach(function (f) {
      if (PRODUCT_SUM_FIELDS.indexOf(f) >= 0) m[f] = (m[f] || 0) + num_(o[f]);
      else if ((m[f] === undefined || m[f] === '') && o[f] !== '') m[f] = o[f];
    });
  });
  if (!order.length) throw new Error('Товары: в источнике 0 строк — лист сайта не перезаписан');

  // Незагружаемые поля берём с листа сайта (их ведут вручную)
  var sheet = SpreadsheetApp.getActive().getSheetByName(def.target);
  var width = def.header.length, existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues().forEach(function (r) {
      if (r[keyIdx] !== '') existing[String(r[keyIdx])] = r;
    });
  }
  var rows = order.map(function (k) {
    var old = existing[k] || [];
    return def.header.map(function (f, i) {
      if (i === keyIdx) return k;
      return g.fields[f] ? (merged[k][f] === undefined ? '' : merged[k][f]) : (old[i] === undefined ? '' : old[i]);
    });
  });
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, width).clearContent();
  sheet.getRange(2, 1, rows.length, width).setValues(rows);
  return rows.length;
}

/* ───────────── Показатели по дням ───────────── */

function importMetrics_(group, g) {
  var def = importGroups_()[group];
  var byDay = {};
  readSource_(group, g).forEach(function (o) {
    var d = parseDate_(o['Дата']);
    if (!d) return;
    var k = dayKey_(d);
    var t = byDay[k] = byDay[k] || {};
    Object.keys(o).forEach(function (f) { if (f !== 'Дата') t[f] = (t[f] || 0) + num_(o[f]); });  // сумма по дню
  });
  var keys = Object.keys(byDay);
  if (!keys.length) return 0;

  var sheet = SpreadsheetApp.getActive().getSheetByName(def.target);
  var width = def.header.length, lastRow = sheet.getLastRow();
  var current = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
  var index = {};
  current.forEach(function (r, i) { if (r[0] instanceof Date) index[dayKey_(r[0])] = i; });
  keys.forEach(function (k) {
    var row = index[k] !== undefined ? current[index[k]] : null;
    if (!row) { row = def.header.map(function () { return ''; }); row[0] = new Date(k + 'T12:00:00'); current.push(row); }
    def.header.forEach(function (f, i) { if (i > 0 && g.fields[f]) row[i] = byDay[k][f] || 0; });   // только загружаемые колонки
  });
  current.sort(function (a, b) { return a[0] - b[0]; });
  sheet.getRange(2, 1, current.length, width).setValues(current);
  return keys.length;
}

/* ───────────── Запуск ───────────── */

function importAll() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { writeLog_('Загрузка', 'Пропуск', 'предыдущая загрузка ещё идёт'); return ''; }
  try {
    var groups = readMapping_(), report = [];
    Object.keys(importGroups_()).forEach(function (group) {
      var g = groups[group];
      if (!g || !g.sheet || !Object.keys(g.fields).length) { report.push(group + ': не настроено'); return; }
      try {
        var n = group === 'Товары' ? importProducts_(g) : importMetrics_(group, g);
        report.push(group + ': ' + n + (group === 'Товары' ? ' строк' : ' дней'));
      } catch (e) {
        report.push(group + ': ОШИБКА — ' + e.message);
      }
    });
    writeLog_('Загрузка', 'Готово', report.join('; '));
    return report.join('\n');
  } finally {
    lock.releaseLock();
  }
}

function importNow() {
  SpreadsheetApp.getUi().alert('Загрузка из источников:\n\n' + importAll());
}

function importEnableSchedule() {
  importDisableSchedule_();
  ScriptApp.newTrigger('importAll').timeBased().everyHours(1).create();
  SpreadsheetApp.getUi().alert('Автозагрузка включена: каждый час. Результат каждой загрузки — на листе «' + SHEETS.LOG + '».');
}

function importDisableSchedule_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'importAll') ScriptApp.deleteTrigger(t);
  });
}

function importDisableSchedule() {
  importDisableSchedule_();
  SpreadsheetApp.getUi().alert('Автозагрузка выключена.');
}

/* ───────────── Готовая настройка под таблицу HOK'S LOVE, лист «WB Расчёт (тех)» ───────────── */

var HOKS_PRESET = {
  sheet: 'WB Расчёт (тех)', firstRow: 2,
  fields: {
    'Баркод': 'A',                                   // Баркод — ключ: одна строка на размер
    'Артикул Wildberries': 'B',                      // Артикул WB
    'Размер': 'C',                                   // Размер
    'Артикул продавца': 'D',                         // Артикул поставщика
    'Фото (ссылка)': 'E',                            // Фото (ссылка)
    'Средние заказы в день, шт': 'K',                // Скорость всего, шт/день
    'Остаток на складах Wildberries, шт': 'L',       // Остатки FBO WB
    'Остаток на своём складе, шт': 'N+O+P',          // FBS + Склад + Упаковка (Селсап)
    'Дозаказ, шт': 'T',                              // Дозаказ, шт
    'Цена до скидки, ₽': 'X',                        // Цена до скидки, ₽
    'Скидка продавца, %': 'Y',                       // Скидка продавца, %
    'Статус запаса': 'AR',                           // Статус запаса
    'Дней хватит': 'S',                              // Дней хватит (с учётом закупа в пути)
    'Себестоимость, ₽': 'BE',                        // Фин: закупочная (Селсап) — колонка U «Себестоимость» пока пустая
    'Остаток на складах Ozon, шт': 'BI'              // Ozon: остаток, шт
  }
};

function applyHoksPreset() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Настройка источника',
    'Вставьте ссылку на таблицу HOK\'S LOVE, где есть лист «' + HOKS_PRESET.sheet + '».\n' +
    'Если рабочая система установлена в этой же таблице — оставьте поле пустым.', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var table = answer.getResponseText().trim();
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.SOURCES);
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  rows.forEach(function (r) {
    if (r[0] !== 'Товары') return;
    var isKey = r[1] === 'Баркод';
    r[2] = isKey ? table : ''; r[3] = isKey ? HOKS_PRESET.sheet : ''; r[4] = isKey ? HOKS_PRESET.firstRow : '';
    r[5] = HOKS_PRESET.fields[r[1]] || '';
  });
  sheet.getRange(2, 1, rows.length, 6).setValues(rows);
  ui.alert('Раздел «Товары» настроен на лист «' + HOKS_PRESET.sheet + '».\nТеперь: HOK\'S LOVE → «Загрузить данные из источников сейчас».');
}
