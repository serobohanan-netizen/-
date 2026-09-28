/**
 * Вход по логину и паролю, сессии, журнал.
 * Пароли хранятся только в виде хеша с солью, сам пароль нигде не записывается.
 */

function normalizeLogin_(login) {
  return String(login || '').trim().toLowerCase();
}

function hashPassword_(password, salt) {
  var value = salt + '|' + password;
  for (var i = 0; i < SECURITY.HASH_ROUNDS; i++) {
    value = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value + salt, Utilities.Charset.UTF_8));
  }
  return 'h$' + value; // префикс, чтобы таблица не приняла строку за формулу
}

/** Строка сотрудника: { sheet, row, data } или null */
function findUser_(login) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.USERS);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.USERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (normalizeLogin_(rows[i][0]) === login && login !== '') {
      return {
        sheet: sheet, row: i + 2,
        data: {
          login: login, name: String(rows[i][1]), role: String(rows[i][2]),
          active: rows[i][3] === 'Да', mustChange: rows[i][4] === 'Да',
          salt: String(rows[i][5]), hash: String(rows[i][6]),
          failed: Number(rows[i][7]) || 0, lockedUntil: rows[i][8]
        }
      };
    }
  }
  return null;
}

function publicUser_(u) {
  var role = ROLES[u.role];
  return {
    login: u.login, name: u.name, role: u.role, mustChange: u.mustChange,
    sections: role.sections, money: role.money, cost: role.cost, allTasks: role.allTasks
  };
}

function login(login, password) {
  login = normalizeLogin_(login);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var found = findUser_(login);
    var fail = { ok: false, error: 'Неверный логин или пароль' };
    if (!found || !found.data.hash) return fail;
    var u = found.data;
    if (u.lockedUntil instanceof Date && u.lockedUntil.getTime() > Date.now()) {
      return { ok: false, error: 'Вход заблокирован после неверных попыток. Попробуйте через ' +
               SECURITY.LOCK_MINUTES + ' минут или попросите владельца разблокировать.' };
    }
    if (!u.active || !ROLES[u.role]) return { ok: false, error: 'Доступ отключён. Обратитесь к владельцу.' };

    if (hashPassword_(String(password), u.salt) !== u.hash) {
      var failed = u.failed + 1;
      var until = failed >= SECURITY.MAX_FAILED_LOGINS
        ? new Date(Date.now() + SECURITY.LOCK_MINUTES * 60000) : '';
      found.sheet.getRange(found.row, 8, 1, 2).setValues([[failed >= SECURITY.MAX_FAILED_LOGINS ? 0 : failed, until]]);
      writeLog_(login, 'Неудачный вход', 'попытка ' + failed);
      return fail;
    }

    found.sheet.getRange(found.row, 8, 1, 2).setValues([[0, '']]);
    var token = Utilities.getUuid() + Utilities.getUuid();
    CacheService.getScriptCache().put('s_' + token, login, SECURITY.SESSION_SECONDS);
    writeLog_(login, 'Вход', '');
    return { ok: true, token: token, user: publicUser_(u) };
  } finally {
    lock.releaseLock();
  }
}

function logout(token) {
  CacheService.getScriptCache().remove('s_' + token);
  return { ok: true };
}

/** Проверка сессии при каждом запросе. Отключённый сотрудник теряет доступ сразу. */
function requireUser_(token) {
  var login = token ? CacheService.getScriptCache().get('s_' + token) : null;
  if (!login) throw new Error('SESSION_EXPIRED');
  var found = findUser_(login);
  if (!found || !found.data.active || !ROLES[found.data.role]) {
    CacheService.getScriptCache().remove('s_' + token);
    throw new Error('SESSION_EXPIRED');
  }
  return publicUser_(found.data);
}

function changePassword(token, oldPassword, newPassword) {
  var user = requireUser_(token);
  newPassword = String(newPassword || '');
  if (newPassword.length < SECURITY.MIN_PASSWORD_LENGTH) {
    return { ok: false, error: 'Пароль должен быть не короче ' + SECURITY.MIN_PASSWORD_LENGTH + ' символов' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var found = findUser_(user.login);
    if (hashPassword_(String(oldPassword), found.data.salt) !== found.data.hash) {
      return { ok: false, error: 'Текущий пароль указан неверно' };
    }
    var salt = Utilities.getUuid();
    found.sheet.getRange(found.row, 5, 1, 3).setValues([['Нет', salt, hashPassword_(newPassword, salt)]]);
    writeLog_(user.login, 'Смена пароля', '');
    user.mustChange = false;
    return { ok: true, user: user };
  } finally {
    lock.releaseLock();
  }
}

function writeLog_(login, action, details) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.LOG);
  if (sheet) sheet.appendRow([new Date(), login, action, String(details).slice(0, 500)]);
}
