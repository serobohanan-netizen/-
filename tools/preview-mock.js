/*
 * Демонстрационная подмена сервера для просмотра дизайна в браузере без Google.
 * ВСЕ ЦИФРЫ ЗДЕСЬ ВЫМЫШЛЕННЫЕ — только чтобы показать, как выглядят экраны.
 * Логины для просмотра: vladelec, menedzher, sklad (пароль любой).
 */
(function () {
  var ROLES = {
    vladelec: { name: 'Владелец', role: 'Владелец', sections: ['summary', 'tasks', 'products', 'templates', 'calc'], money: true, cost: true, allTasks: true },
    menedzher: { name: 'Анна', role: 'Главный менеджер', sections: ['summary', 'tasks', 'products', 'templates', 'calc'], money: true, cost: true, allTasks: true },
    sklad: { name: 'Игорь', role: 'Склад', sections: ['tasks', 'products'], money: false, cost: false, allTasks: false }
  };
  var current = null;

  function seed(i) { var x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); }
  function day(offset) {
    var d = new Date(2026, 8, 27); d.setDate(d.getDate() - offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function summary(p) {
    var days = p.days || 7, series = [];
    function tot(offset, mp) {
      var t = [0, 0, 0, 0, 0, 0, 0, 0];
      for (var i = offset; i < offset + days; i++) {
        var base = mp === 'wb' ? 1000 + seed(i) * 250 : 40 + seed(i + 7) * 30 + (90 - i) * 0.6;
        var orders = Math.round(base);
        var r = [orders * 480, orders * 27, orders * 3.1, orders, orders * 550, Math.round(orders * 0.86), orders * 0.86 * 550, orders * 21];
        r.forEach(function (v, j) { t[j] += Math.round(v); });
        if (offset === 0) {
          var idx = days - 1 - (i - offset);
          series[idx] = series[idx] || { date: day(i), wb: 0, ozon: 0 };
          series[idx][mp] = orders;
        }
      }
      return t;
    }
    function pack(x, money) {
      var m = { impressions: x[0], clicks: x[1], carts: x[2], orders: x[3], buyouts: x[5],
        ctr: x[1] / x[0] * 100, cartRate: x[2] / x[1] * 100, orderRate: x[3] / x[2] * 100, buyoutRate: x[5] / x[3] * 100 };
      if (money) { m.ordersSum = x[4]; m.buyoutsSum = x[6]; m.ads = x[7]; m.avgCheck = x[4] / x[3]; m.adShare = x[7] / x[4] * 100; }
      return m;
    }
    var wb = tot(0, 'wb'), oz = tot(0, 'ozon'), wbP = tot(days, 'wb'), ozP = tot(days, 'ozon');
    var sum = function (a, b) { return a.map(function (v, i) { return v + b[i]; }); };
    var money = current.money;
    return {
      days: days, from: series[0].date, to: series[series.length - 1].date, money: money, series: series,
      wb: { now: pack(wb, money), prev: pack(wbP, money) },
      ozon: { now: pack(oz, money), prev: pack(ozP, money) },
      all: { now: pack(sum(wb, oz), money), prev: pack(sum(wbP, ozP), money) }
    };
  }

  var tasks = [
    { id: 1, title: 'Отгрузить поставку на склад Коледино', description: 'Лабреты 6 и 8 мм, наборы 9 шт.', section: 'Склад', assignee: 'sklad', author: 'vladelec', due: '2026-09-29', priority: 'Срочно', status: 'В работе', comments: '27.09.2026 10:12 — Игорь: коробки собраны, ждём маркировку', created: '26.09.2026 09:00', updated: '' },
    { id: 2, title: 'Переписать описание карточки лабрета из титана', description: '', section: 'Карточки', assignee: 'menedzher', author: 'vladelec', due: '2026-10-02', priority: 'Высокий', status: 'Новая', comments: '', created: '26.09.2026 11:00', updated: '' },
    { id: 3, title: 'Ответить на отзывы с оценкой 1–3', description: '', section: 'Отзывы', assignee: 'menedzher', author: 'menedzher', due: '2026-09-28', priority: 'Обычный', status: 'На проверке', comments: '', created: '25.09.2026 12:00', updated: '' },
    { id: 4, title: 'Пересчитать остатки колец-кликеров', description: '', section: 'Склад', assignee: 'sklad', author: 'menedzher', due: '2026-09-25', priority: 'Обычный', status: 'Новая', comments: '', created: '24.09.2026 12:00', updated: '' },
    { id: 5, title: 'Загрузить первые карточки на Ozon', description: '', section: 'Ozon', assignee: 'menedzher', author: 'vladelec', due: '2026-10-10', priority: 'Высокий', status: 'В работе', comments: '', created: '20.09.2026 12:00', updated: '' },
    { id: 6, title: 'Проверить ставки в поиске', description: '', section: 'Реклама', assignee: 'vladelec', author: 'vladelec', due: '', priority: 'Низкий', status: 'Готово', comments: '', created: '19.09.2026 12:00', updated: '' }
  ];
  var users = [{ login: 'vladelec', name: 'Владелец' }, { login: 'menedzher', name: 'Анна' }, { login: 'sklad', name: 'Игорь' }, { login: 'sklad2', name: 'Дмитрий' }, { login: 'sklad3', name: 'Ольга' }];

  function products() {
    var names = [
      ['Пирсинг лабрет в ухо губу нос хеликс трагус гвоздик', 'Пирсинг', 'Сталь 316L', 985, 48, 18, 3200, 9800, 0, 120],
      ['Пирсинг лабрет из титана серьга в ухо хрящ хеликс', 'Пирсинг', 'Титан ASTM F-136', 2001, 30, 64, 400, 1100, 0, 95],
      ['Набор для пирсинга из 9 шт. циркуляры в ухо нос', 'Пирсинг', 'Сталь 316L', 2001, 70, 55, 5200, 21000, 300, 60],
      ['Пирсинг кольцо кликер в нос септум и ухо', 'Пирсинг', 'Сталь 316L', 970, 45, 21, 0, 0, 0, 40],
      ['Пирсинг циркуляр клыки вампира в смайл', 'Пирсинг', 'Сталь 316L', 985, 52, 17, 8000, 14000, 0, 25],
      ['Моносерьга для пирсинга цветочек в хеликс хрящ в ухо', 'Серьги', 'Сталь 316L', 970, 40, 16, 900, 2400, 0, 0],
      ['Пирсинг в пупок банан с фианитом сердце', 'Пирсинг', 'Сталь 316L', 985, 38, 24, 600, 3000, 150, 48],
      ['Браслет со шармами', 'Браслеты', 'Сталь 316L', 970, 55, 30, 300, 700, 0, 2]
    ];
    var items = names.map(function (n, i) {
      var total = n[6] + n[7] + n[8], perDay = n[9], daysLeft = perDay ? total / perDay : null, status;
      if (!total) status = 'Нет в наличии'; else if (!perDay) status = 'Нет продаж';
      else if (daysLeft < 14) status = 'Дефицит'; else if (daysLeft > 90) status = 'Избыток'; else status = 'Норма';
      var it = { sku: 'HL-' + (101 + i), wbSku: String(173726288 + i * 1117), ozonSku: i % 3 ? '' : String(1800000 + i), title: n[0], category: n[1], material: n[2],
        own: n[6], wb: n[7], ozon: n[8], total: total, perDay: perDay, daysLeft: daysLeft, status: status };
      if (current.money) { it.price = n[3]; it.discount = n[4]; it.salePrice = n[3] * (1 - n[4] / 100); }
      if (current.cost) it.cost = n[5];
      return it;
    });
    return { items: items, deficit: 14, surplus: 90, money: current.money, cost: current.cost };
  }
  var templates = [
    { id: '1', marketplace: 'Wildberries', type: 'Отзыв', rating: '5', situation: 'Благодарность за покупку', text: 'Здравствуйте! Благодарим Вас за выбор бренда HOK\'S LOVE и тёплый отзыв. Мы рады, что украшение подчеркнуло Вашу индивидуальность. Украшай себя с любовью!' },
    { id: '2', marketplace: 'Wildberries', type: 'Отзыв', rating: '2', situation: 'Не подошла длина штанги', text: 'Здравствуйте! Нам очень жаль, что украшение не подошло. Длина штанги подбирается индивидуально под прокол — размерная сетка есть на слайдах карточки. Рекомендуем проконсультироваться с мастером пирсинга. Благодарим за доверие к бренду HOK\'S LOVE.' },
    { id: '3', marketplace: 'Wildberries', type: 'Вопрос', rating: '', situation: 'Подходит ли для первичного прокола', text: 'Здравствуйте! Да, изделие из медицинской стали 316L подходит для первичного прокола при правильном подборе длины. Перед использованием рекомендуем обработать украшение антисептиком.' },
    { id: '4', marketplace: 'Ozon', type: 'Вопрос', rating: '', situation: 'Из какого материала', text: 'Здравствуйте! Украшение изготовлено из медицинской стали 316L — гипоаллергенного сплава, который не темнеет и не окисляется.' }
  ];
  var params = { wb_komissiya: 25.8, wb_ekvairing: 2.63, wb_logistika: 59.06, wb_hranenie: 6.91, wb_priemka: 1.34, wb_uderzhaniya: 23.47, wb_reklama: 20.95,
    ozon_komissiya: '', ozon_ekvairing: '', ozon_logistika: '', ozon_hranenie: '', ozon_priemka: '', ozon_uderzhaniya: '', ozon_reklama: '', nalog: 11, zapas_deficit: 14, zapas_izbytok: 90 };

  var server = {
    login: function (login) {
      var u = ROLES[String(login).trim().toLowerCase()];
      if (!u) return { ok: false, error: 'Неверный логин или пароль' };
      current = Object.assign({ login: login, mustChange: false }, u);
      return { ok: true, token: 'demo', user: current };
    },
    logout: function () { return { ok: true }; },
    changePassword: function () { return { ok: true, user: current }; },
    api: function (token, action, payload) {
      if (!current) return { ok: false, error: 'SESSION_EXPIRED' };
      var h = {
        me: function () { return current; },
        summary: function () { return summary(payload || {}); },
        tasks: function () { return { tasks: JSON.parse(JSON.stringify(tasks)), users: users, statuses: ['Новая', 'В работе', 'На проверке', 'Готово', 'Отменена'], priorities: ['Срочно', 'Высокий', 'Обычный', 'Низкий'], sections: ['Wildberries', 'Ozon', 'Склад', 'Карточки', 'Реклама', 'Отзывы', 'Финансы', 'Другое'] }; },
        saveTask: function () {
          var t = payload;
          if (t.id) { tasks = tasks.map(function (x) { return x.id === t.id ? Object.assign({}, x, t) : x; }); return { id: t.id }; }
          var id = tasks.length + 1; tasks.push(Object.assign({ id: id, author: current.login, comments: '', created: 'сейчас' }, t)); return { id: id };
        },
        addComment: function () {
          var t = tasks.filter(function (x) { return x.id === payload.id; })[0];
          t.comments = (t.comments ? t.comments + '\n' : '') + 'сейчас — ' + current.name + ': ' + payload.text; return { comments: t.comments };
        },
        products: products,
        templates: function () {
          return window.__STARTER ? window.__STARTER.map(function (r) { return { id: r[0], marketplace: r[1], type: r[2], rating: r[3], situation: r[4], text: r[5] }; }) : templates;
        },
        params: function () { return params; }
      };
      return { ok: true, data: h[action]() };
    }
  };

  function runner(ok, bad) {
    var r = {};
    r.withSuccessHandler = function (f) { return runner(f, bad); };
    r.withFailureHandler = function (f) { return runner(ok, f); };
    Object.keys(server).forEach(function (k) {
      r[k] = function () { var args = arguments; setTimeout(function () { ok && ok(server[k].apply(null, args)); }, 150); };
    });
    return r;
  }
  window.google = { script: { get run() { return runner(null, null); } } };
})();
