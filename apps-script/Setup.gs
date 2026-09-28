/**
 * Меню в таблице и сборка структуры.
 * Ничего не удаляет: создаёт только недостающие листы и шапки.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("HOK'S LOVE")
    .addItem('1. Создать структуру таблицы', 'setupStructure')
    .addItem('2. Выдать временный пароль сотруднику', 'issueTemporaryPassword')
    .addItem('Разблокировать вход сотрудника', 'unlockUser')
    .addToUi();
}

function setupStructure() {
  var ss = SpreadsheetApp.getActive();
  buildSheet_(ss, SHEETS.WB, HEADERS.METRICS);
  buildSheet_(ss, SHEETS.OZON, HEADERS.METRICS);
  buildSheet_(ss, SHEETS.PRODUCTS, HEADERS.PRODUCTS);
  buildSheet_(ss, SHEETS.TASKS, HEADERS.TASKS);
  buildSheet_(ss, SHEETS.TEMPLATES, HEADERS.TEMPLATES);
  var users = buildSheet_(ss, SHEETS.USERS, HEADERS.USERS);
  var params = buildSheet_(ss, SHEETS.PARAMS, HEADERS.PARAMS);
  buildSheet_(ss, SHEETS.LOG, HEADERS.LOG);

  // Параметры по умолчанию — только если лист пустой
  if (params.getLastRow() < 2) {
    params.getRange(2, 1, DEFAULT_PARAMS.length, 4).setValues(DEFAULT_PARAMS);
  }

  // Выпадающий список ролей и «Да/Нет»
  var roleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.keys(ROLES), true).build();
  users.getRange('C2:C200').setDataValidation(roleRule);
  var yesNo = SpreadsheetApp.newDataValidation().requireValueInList(['Да', 'Нет'], true).build();
  users.getRange('D2:E200').setDataValidation(yesNo);
  users.hideColumns(6, 2); // соль и хеш пароля не нужны глазам

  // Защита служебных листов: править может только владелец таблицы
  [SHEETS.USERS, SHEETS.PARAMS, SHEETS.LOG].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
      var p = sheet.protect().setDescription('Служебный лист рабочей системы HOK\'S LOVE');
      p.removeEditors(p.getEditors());
      if (p.canDomainEdit()) p.setDomainEdit(false);
    }
  });

  SpreadsheetApp.getUi().alert(
    'Структура готова.\n\n' +
    'Дальше: на листе «' + SHEETS.USERS + '» впишите логин, имя, роль и «Да» в колонке «Активен», ' +
    'затем меню HOK\'S LOVE → «Выдать временный пароль сотруднику».');
}

function buildSheet_(ss, name, header) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var current = sheet.getRange(1, 1, 1, header.length).getValues()[0];
  if (current.join('') === '') {
    sheet.getRange(1, 1, 1, header.length).setValues([header])
      .setFontWeight('bold').setBackground('#2b2d31').setFontColor('#ecebe8');
    sheet.setFrozenRows(1);
    header.forEach(function (_, i) { sheet.setColumnWidth(i + 1, i === 0 ? 130 : 170); });
  }
  return sheet;
}

function issueTemporaryPassword() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Временный пароль', 'Логин сотрудника (как на листе «' + SHEETS.USERS + '»):',
                         ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var login = normalizeLogin_(answer.getResponseText());
  var found = findUser_(login);
  if (!found) { ui.alert('Логин «' + login + '» не найден.'); return; }

  var password = randomPassword_();
  var salt = Utilities.getUuid();
  var sheet = found.sheet;
  sheet.getRange(found.row, 5, 1, 5).setValues([['Да', salt, hashPassword_(password, salt), 0, '']]);
  writeLog_('владелец таблицы', 'Выдан временный пароль', login);
  ui.alert('Временный пароль для «' + login + '»:\n\n' + password +
           '\n\nПередайте его сотруднику лично. При первом входе система попросит сменить пароль. ' +
           'Этот пароль больше нигде не показывается.');
}

function unlockUser() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Разблокировать вход', 'Логин сотрудника:', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var found = findUser_(normalizeLogin_(answer.getResponseText()));
  if (!found) { ui.alert('Логин не найден.'); return; }
  found.sheet.getRange(found.row, 8, 1, 2).setValues([[0, '']]);
  ui.alert('Вход разблокирован.');
}

function randomPassword_() {
  var chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  var out = '';
  for (var i = 0; i < 12; i++) out += chars.charAt((bytes[i] + 256) % chars.length);
  return out;
}
