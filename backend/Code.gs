const SHEETS = {
  reports: { name: 'Reports', type: 'reports', headers: ['投稿日', '氏名', '生産活動内容', '活動別時間', '合計時間(分)', '合計時間', '進捗状況', '選択投稿日', '実送信日', '日付正誤', '送信日時', '更新日時', 'id', 'json'] },
  activities: { name: 'Activities', headers: ['id', 'json', 'updatedAt'] },
  history: { name: 'History', headers: ['id', 'json', 'at'] }
};
const SPREADSHEET_ID = '1QBpO3tfO56cLLKE1-QzV-iSUUQdAVY9q48WEIAIstDU';
const SPREADSHEET_IDS = Object.freeze({
  'main': '1QMvmHhMYTp1-eJ_DEZn6wlUyBtCTe5C4h4rn1N9wZHQ',
  '2': SPREADSHEET_ID,
  '3': '1sRc8MRQIk3-832Ux-uWA2Tz8jTysD6g8Tj6dnlHgdlU',
  '4': '1r1-J61Z2mcB3mR2_JSg6F_9cp5Y9RJgHQV9A5ArRVGA',
  '5': '1mhqW4hYro4msMhjR5vz2lQ0gqQPGbnOeZ4xuDaLhEeA',
  '6': '1XNwRXM9lApaxYL-2SNjX4-fVBUH8DtrCzv7cgpEnUMA',
  '7': '1ft7xlS5Lhy0hkwz3irEjlmnK7C4R54paZaVHDthfUf8',
  '8': '1IRgMRKBK8EprvmiIwgTo_48n4VJtWg_lnaqe66DxJjk',
  '9': '1j9K1cDVC_q7ZezfTJRwhQqZq_kqBKbj-MJzwNitGVPU',
  '10': '1bAmleQh5kfzSP32ggtSIiwpKV3kTOsgUO5U-_NyIR80',
  '11': '1DNYH2i_Fc4zpJnBot9Fi6wHQolELFlwGGW9tiABwH78'
});
let ACTIVE_SPREADSHEET_ID = SPREADSHEET_ID;
let ACTIVE_SYSTEM_KEY = '2';
const ADMIN_HASH_KEY = 'ADMIN_PASSWORD_SHA256';
const INITIAL_ADMIN_PASSWORD_HASHES = Object.freeze({
  '11': '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'
});
const ADMIN_ROTATION_KEY_PREFIX = 'ADMIN_PASSWORD_ROTATION_REQUIRED_';
const REVISION_KEY_PREFIX = 'DATA_REVISION_';
const ADMIN_PASSWORD_MIN_LENGTH = 4;
const HISTORY_LIMIT = 1000;
const BACKEND_BUILD_ID = 'production-multitenant-20260827-v2';
const DUPLICATE_REPORT_MESSAGE = '同じ日に同じ氏名で既に報告済みです。再入力はできません。修正が必要な場合は管理者に連絡してください。';
const REVISION_REQUIRED_ACTIONS = Object.freeze({
  updateReport: true,
  deleteReport: true,
  saveActivities: true,
  restoreHistoryEntry: true
});

function setupInitialAdminPassword(password) {
  if (!isValidAdminPassword_(password)) throw new Error('管理者パスワードは4文字以上で指定してください。');
  selectSpreadsheet_('main');
  PropertiesService.getScriptProperties().setProperty(adminHashKey_(), sha256(password));
  PropertiesService.getScriptProperties().deleteProperty(adminRotationKey_());
  ensureAllSheets_();
}

function setupTenantAdminPassword(systemKey, password) {
  if (!isValidAdminPassword_(password)) throw new Error('管理者パスワードは4文字以上で指定してください。');
  selectSpreadsheet_(systemKey);
  PropertiesService.getScriptProperties().setProperty(adminHashKey_(), sha256(password));
  PropertiesService.getScriptProperties().deleteProperty(adminRotationKey_());
  ensureAllSheets_();
}

function doGet(e) {
  const systemKey = selectSpreadsheet_(e && e.parameter && e.parameter.systemKey);
  migrateLegacyAdminHashes_();
  initializeConfiguredAdminPassword_();
  ensureAllSheets_();
  return json_({ ok: true, data: {
    status: 'ready',
    systemKey: systemKey,
    hasAdminPassword: hasAdminPassword_(),
    passwordRotationRequired: passwordRotationRequired_(),
    revision: currentRevision_(),
    backendBuildId: BACKEND_BUILD_ID
  } });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(30000);
    locked = true;
    const request = JSON.parse((e.postData && e.postData.contents) || '{}');
    selectSpreadsheet_((e && e.parameter && e.parameter.systemKey) || request.systemKey);
    migrateLegacyAdminHashes_();
    initializeConfiguredAdminPassword_();
    ensureAllSheets_();
    const action = request.action || '';
    const payload = request.payload || {};
    const password = request.password || '';
    const data = handleAction_(action, payload, password);
    data.backendBuildId = BACKEND_BUILD_ID;
    return json_({ ok: true, data });
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function handleAction_(action, payload, password) {
  if (action === 'publicConfig') return { activities: readActivities_(), revision: currentRevision_() };
  if (action === 'submitReport') {
    const submitted = submitReport_(payload.report || {});
    submitted.revision = bumpRevision_();
    return submitted;
  }

  assertAdmin_(password);
  if (action === 'adminSnapshot') return snapshot_();
  if (REVISION_REQUIRED_ACTIONS[action]) assertExpectedRevision_(payload.expectedRevision);
  let result;
  if (action === 'updateReport') result = updateReport_(payload.id, payload.report || {});
  else if (action === 'deleteReport') result = deleteReport_(payload.id);
  else if (action === 'saveActivities') result = saveActivities_(payload.activities || [], payload.actionLabel || '編集');
  else if (action === 'restoreHistoryEntry') result = restoreHistoryEntry_(payload.historyId);
  else if (action === 'changeAdminPassword') return changeAdminPassword_(payload.newPassword || '');
  else throw new Error('未対応の操作です: ' + action);
  result.revision = bumpRevision_();
  return result;
}

function submitReport_(report) {
  const now = new Date();
  const submittedAt = now.toISOString();
  const submittedDate = toDateKey_(now);
  const selectedDate = report.date || submittedDate;
  const normalized = normalizeReport_(Object.assign({}, report, {
    submittedAt: submittedAt,
    submittedDate: submittedDate,
    dateCheck: { selectedDate: selectedDate, submittedDate: submittedDate, correct: selectedDate === submittedDate },
    createdAt: submittedAt,
    updatedAt: submittedAt
  }));
  const reportsBeforeSave = readReports_();
  const duplicate = reportsBeforeSave.find(row =>
    row.id !== normalized.id &&
    row.date === normalized.date &&
    normalizedNameKey_(row.name) === normalizedNameKey_(normalized.name)
  );
  if (duplicate) throw new Error(DUPLICATE_REPORT_MESSAGE);
  upsertJson_(SHEETS.reports, normalized.id, normalized, normalized.updatedAt);
  const saved = readReports_().find(function(row) { return row.id === normalized.id; });
  assertReportSaved_(saved, normalized);
  if (!reportsBeforeSave.some(function(row) { return row.id === normalized.id; })) {
    addHistory_('登録', '報告', null, normalized, 'history_register_' + normalized.id);
  }
  return {
    report: saved,
    activities: readActivities_(),
    confirmed: true,
    systemKey: ACTIVE_SYSTEM_KEY
  };
}

function updateReport_(id, report) {
  const reports = readReports_();
  const before = reports.find(row => row.id === id);
  if (!before) throw new Error('編集対象の報告が見つかりません。');
  const updated = normalizeReport_(Object.assign({}, before, report, {
    id: before.id,
    submittedAt: before.submittedAt,
    submittedDate: before.submittedDate,
    dateCheck: before.dateCheck,
    createdAt: before.createdAt,
    updatedAt: new Date().toISOString()
  }));
  upsertJson_(SHEETS.reports, updated.id, updated, updated.updatedAt);
  const saved = readReports_().find(function(row) { return row.id === updated.id; });
  assertReportSaved_(saved, updated);
  addHistory_('編集', '報告', before, updated);
  return snapshot_();
}

function deleteReport_(id) {
  const before = readReports_().find(row => row.id === id);
  if (!before) throw new Error('削除対象の報告が見つかりません。');
  deleteJson_(SHEETS.reports, id);
  if (readReports_().some(function(row) { return row.id === id; })) {
    throw new Error('削除後の読戻し確認に失敗しました。');
  }
  addHistory_('削除', '報告', before, null);
  return snapshot_();
}

function saveActivities_(activities, actionLabel) {
  const before = readActivities_();
  const normalized = normalizeActivities_(activities);
  writeJsonRows_(SHEETS.activities, normalized);
  const saved = readActivities_();
  if (stableStringify_(comparableActivities_(saved)) !== stableStringify_(comparableActivities_(normalized))) {
    throw new Error('項目保存後の全項目読戻し確認に失敗しました。');
  }
  addHistory_(actionLabel === '初期化' ? '初期化' : '編集', '生産活動項目', { label: '変更前', activities: before }, { label: '変更後', activities: normalized });
  return snapshot_();
}

function restoreHistoryEntry_(historyId) {
  const entry = readHistory_().find(row => row.id === historyId);
  if (!entry) throw new Error('履歴が見つかりません。');
  if (entry.target === '報告' && entry.before && entry.before.id) {
    const current = readReports_().find(row => row.id === entry.before.id) || null;
    const restored = normalizeReport_(entry.before);
    upsertJson_(SHEETS.reports, restored.id, restored, restored.updatedAt);
    addHistory_('履歴復元', '報告', current, restored);
    return snapshot_();
  }
  if (entry.target === '報告' && entry.before && Array.isArray(entry.before.reports)) {
    const current = { label: '履歴復元前', reports: readReports_() };
    writeJsonRows_(SHEETS.reports, entry.before.reports.map(normalizeReport_));
    addHistory_('履歴復元', '報告', current, { label: (entry.label || '履歴') + 'から復元', reports: readReports_().length });
    return snapshot_();
  }
  throw new Error('この履歴から復元できるデータがありません。');
}

function changeAdminPassword_(newPassword) {
  if (!isValidAdminPassword_(newPassword)) throw new Error('新しい管理者パスワードは4文字以上にしてください。');
  PropertiesService.getScriptProperties().setProperty(adminHashKey_(), sha256(newPassword));
  PropertiesService.getScriptProperties().deleteProperty(adminRotationKey_());
  return snapshot_();
}

function snapshot_() {
  return {
    reports: readReports_(),
    activities: readActivities_(),
    history: readHistory_(),
    revision: currentRevision_(),
    passwordRotationRequired: passwordRotationRequired_()
  };
}

function ensureAllSheets_() {
  ensureSheet_(SHEETS.reports);
  ensureSheet_(SHEETS.activities);
  ensureSheet_(SHEETS.history);
  if (!readActivities_().length) writeJsonRows_(SHEETS.activities, defaultActivities_());
}

function ensureSheet_(def) {
  const ss = targetSpreadsheet_();
  let sheet = ss.getSheetByName(def.name);
  if (!sheet) sheet = ss.insertSheet(def.name);
  if (sheet.getLastRow() === 0) {
    writeJsonRowsToSheet_(sheet, def, []);
    return;
  }
  const currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
  const needsReadableHeader = def.headers.some(function(header, index) {
    return currentHeaders[index] !== header;
  });
  if (needsReadableHeader) {
    writeJsonRows_(def, readJsonRowsFromSheet_(sheet));
  } else {
    applySheetPresentation_(sheet, def);
  }
}

function readJsonRows_(def) {
  const sheet = targetSpreadsheet_().getSheetByName(def.name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return readJsonRowsFromSheet_(sheet);
}

function readJsonRowsFromSheet_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), Math.max(sheet.getLastColumn(), 3)).getValues();
  const headers = values[0].map(function(value) { return String(value || ''); });
  let jsonIndex = headers.indexOf('json');
  if (jsonIndex < 0) jsonIndex = 1;
  return values.slice(1).map(function(row) {
    try { return JSON.parse(row[jsonIndex] || '{}'); } catch (e) { return null; }
  }).filter(Boolean);
}

function writeJsonRows_(def, rows) {
  replaceSheetSafely_(def, rows || []);
}

function writeJsonRowsToSheet_(sheet, def, rows) {
  if (sheet.getLastRow() > 0) throw new Error('安全保存先が空ではありません: ' + sheet.getName());
  if (sheet.getMaxColumns() < def.headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), def.headers.length - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < rows.length + 1) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  }
  sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
  const values = rows.map(function(row) { return rowValuesForSheet_(def, row); });
  if (values.length) sheet.getRange(2, 1, values.length, def.headers.length).setValues(values);
  sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
  sheet.autoResizeColumns(1, def.headers.length);
  applySheetPresentation_(sheet, def);
}

function replaceSheetSafely_(def, rows) {
  const ss = targetSpreadsheet_();
  const active = ss.getSheetByName(def.name);
  const token = Date.now() + '_' + Utilities.getUuid().slice(0, 8);
  const stagingName = def.name + '__staging_' + token;
  const oldName = def.name + '__old_' + token;
  const staging = ss.insertSheet(stagingName);
  writeJsonRowsToSheet_(staging, def, rows);
  let oldRenamed = false;
  let newActivated = false;
  try {
    if (active) {
      active.setName(oldName);
      oldRenamed = true;
    }
    staging.setName(def.name);
    newActivated = true;
    if (active) ss.deleteSheet(active);
  } catch (error) {
    const current = ss.getSheetByName(def.name);
    if (oldRenamed && active) {
      if (newActivated && current && current.getSheetId() !== active.getSheetId()) ss.deleteSheet(current);
      active.setName(def.name);
    }
    const staged = ss.getSheetByName(stagingName);
    if (staged) ss.deleteSheet(staged);
    throw error;
  }
}

function applySheetPresentation_(sheet, def) {
  sheet.setFrozenRows(1);
  if (def.type === 'reports') {
    sheet.showColumns(1, def.headers.length);
    sheet.hideColumns(13, 2);
  }
}

function rowValuesForSheet_(def, row) {
  if (def.type === 'reports') return reportRowValues_(row);
  return [row.id || Utilities.getUuid(), JSON.stringify(row), row.updatedAt || row.at || new Date().toISOString()];
}

function reportRowValues_(row) {
  const report = normalizeReport_(row);
  const check = report.dateCheck || {};
  const selectedDate = check.selectedDate || report.date || '';
  const submittedDate = check.submittedDate || report.submittedDate || dateKeyFromTimestamp_(report.submittedAt || report.createdAt) || '';
  const correct = selectedDate && submittedDate && selectedDate === submittedDate;
  return [
    formatDateForSheet_(report.date),
    report.name,
    reportActivityLabelsText_(report),
    reportActivityMinutesText_(report),
    report.minutes,
    minutesText_(report.minutes),
    report.progress,
    formatDateForSheet_(selectedDate),
    formatDateForSheet_(submittedDate),
    correct ? '正' : '誤',
    formatDateTimeForSheet_(report.submittedAt || report.createdAt),
    formatDateTimeForSheet_(report.updatedAt),
    report.id,
    JSON.stringify(report)
  ];
}

function upsertJson_(def, id, row, updatedAt) {
  const sheet = targetSpreadsheet_().getSheetByName(def.name);
  const idColumn = Math.max(1, def.headers.indexOf('id') + 1);
  const lastRow = sheet.getLastRow();
  let targetRow = 0;
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues();
    const index = ids.findIndex(function(value) { return String(value[0]) === String(id); });
    if (index >= 0) targetRow = index + 2;
  }
  const values = rowValuesForSheet_(def, row);
  if (!targetRow) targetRow = lastRow + 1;
  if (targetRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
  sheet.getRange(targetRow, 1, 1, def.headers.length).setValues([values]);
  applySheetPresentation_(sheet, def);
}

function deleteJson_(def, id) {
  const sheet = targetSpreadsheet_().getSheetByName(def.name);
  const idColumn = Math.max(1, def.headers.indexOf('id') + 1);
  if (!sheet || sheet.getLastRow() < 2) return;
  const ids = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getDisplayValues();
  const index = ids.findIndex(function(value) { return String(value[0]) === String(id); });
  if (index >= 0) sheet.deleteRow(index + 2);
}

function targetSpreadsheet_() {
  return SpreadsheetApp.openById(ACTIVE_SPREADSHEET_ID);
}

function selectSpreadsheet_(systemKey) {
  const key = String(systemKey || '').trim();
  if (!key) throw new Error('保存先システム番号が指定されていません。');
  const spreadsheetId = SPREADSHEET_IDS[key];
  if (!spreadsheetId) throw new Error('保存先システム番号が不正です: ' + key);
  ACTIVE_SYSTEM_KEY = key;
  ACTIVE_SPREADSHEET_ID = spreadsheetId;
  return key;
}

function readReports_() { return readJsonRows_(SHEETS.reports).map(normalizeReport_).filter(row => row.date && row.name); }
function readActivities_() { return normalizeActivities_(readJsonRows_(SHEETS.activities)); }
function readHistory_() { return readJsonRows_(SHEETS.history).slice(0, HISTORY_LIMIT); }

function addHistory_(action, target, before, after, stableId) {
  if (stableId && readJsonRows_(SHEETS.history).some(function(item) { return item.id === stableId; })) return;
  const source = after || before || {};
  const entry = {
    id: stableId || 'history_' + Date.now() + '_' + Utilities.getUuid().slice(0, 8),
    at: new Date().toISOString(),
    action: action,
    target: target,
    recordId: source.id || '',
    label: target === '報告' ? reportLabel_(source) : String(source.label || target || ''),
    before: clone_(before),
    after: clone_(after)
  };
  const sheet = targetSpreadsheet_().getSheetByName(SHEETS.history.name);
  sheet.insertRowBefore(2);
  sheet.getRange(2, 1, 1, SHEETS.history.headers.length).setValues([rowValuesForSheet_(SHEETS.history, entry)]);
}

function normalizeReport_(report) {
  report = report || {};
  const activityIds = Array.isArray(report.activityIds) ? report.activityIds.map(String).filter(Boolean) : [];
  const sourceMinutes = report.activityMinutes && typeof report.activityMinutes === 'object' ? report.activityMinutes : {};
  const activityMinutes = {};
  activityIds.forEach(function(activityId) {
    const minutes = Math.max(0, Number(sourceMinutes[activityId] || 0));
    if (minutes) activityMinutes[activityId] = minutes;
  });
  const totalFromActivities = Object.keys(activityMinutes).reduce(function(sum, activityId) {
    return sum + Number(activityMinutes[activityId] || 0);
  }, 0);
  const nowIso = new Date().toISOString();
  const submittedAt = report.submittedAt || report.createdAt || nowIso;
  const submittedDate = report.submittedDate || dateKeyFromTimestamp_(submittedAt) || toDateKey_(new Date());
  const selectedDateForCheck = report.dateCheck && report.dateCheck.selectedDate ? report.dateCheck.selectedDate : (report.date || toDateKey_(new Date()));
  const submittedDateForCheck = report.dateCheck && report.dateCheck.submittedDate ? report.dateCheck.submittedDate : submittedDate;
  const dateCheck = { selectedDate: selectedDateForCheck, submittedDate: submittedDateForCheck, correct: selectedDateForCheck === submittedDateForCheck };
  return {
    id: report.id || 'report_' + Date.now() + '_' + Utilities.getUuid().slice(0, 8),
    date: report.date || toDateKey_(new Date()),
    name: String(report.name || '').trim(),
    activityIds: activityIds,
    activityLabels: report.activityLabels && typeof report.activityLabels === 'object' ? report.activityLabels : {},
    activityMinutes: activityMinutes,
    minutes: totalFromActivities || Math.max(0, Number(report.minutes || 0)),
    progress: String(report.progress || '').trim(),
    submittedAt: submittedAt,
    submittedDate: submittedDate,
    dateCheck: dateCheck,
    createdAt: report.createdAt || submittedAt,
    updatedAt: report.updatedAt || nowIso
  };
}

function normalizeActivities_(activities) {
  const source = Array.isArray(activities) && activities.length ? activities : defaultActivities_();
  return source.map((activity, index) => ({
    id: activity.id || 'activity_' + Utilities.getUuid().slice(0, 8),
    label: String(activity.label || '').trim(),
    hint: String(activity.hint || '').trim(),
    active: activity.active !== false,
    order: Number.isFinite(Number(activity.order)) ? Number(activity.order) : index
  })).filter(activity => activity.label).sort((a, b) => a.order - b.order).map((activity, index) => Object.assign({}, activity, { order: index }));
}

function comparableReport_(report) {
  const normalized = normalizeReport_(report || {});
  const activityIds = Array.from(new Set(normalized.activityIds)).sort();
  const activityLabels = {};
  const activityMinutes = {};
  activityIds.forEach(function(activityId) {
    activityLabels[activityId] = String(normalized.activityLabels && normalized.activityLabels[activityId] || '');
    activityMinutes[activityId] = Math.max(0, Number(normalized.activityMinutes && normalized.activityMinutes[activityId] || 0));
  });
  return {
    id: normalized.id,
    date: normalized.date,
    name: normalized.name,
    activityIds: activityIds,
    activityLabels: activityLabels,
    activityMinutes: activityMinutes,
    minutes: Math.max(0, Number(normalized.minutes || 0)),
    progress: normalized.progress
  };
}

function comparableActivities_(activities) {
  return normalizeActivities_(activities).map(function(activity) {
    return {
      id: activity.id,
      label: activity.label,
      hint: activity.hint,
      active: activity.active,
      order: activity.order
    };
  });
}

function stableStringify_(value) {
  function sortValue_(item) {
    if (Array.isArray(item)) return item.map(sortValue_);
    if (item && typeof item === 'object') {
      return Object.keys(item).sort().reduce(function(result, key) {
        result[key] = sortValue_(item[key]);
        return result;
      }, {});
    }
    return item;
  }
  return JSON.stringify(sortValue_(value));
}

function assertReportSaved_(saved, expected) {
  if (!saved || stableStringify_(comparableReport_(saved)) !== stableStringify_(comparableReport_(expected))) {
    throw new Error('保存後の全項目読戻し確認に失敗しました。入力は端末側から再送できます。');
  }
}

function defaultActivities_() {
  return [
    ['transcription', '文字起こし', '納品したかどうか'],
    ['bookmark', '栞作成', '何個納品したか'],
    ['crowdworks', 'クラウドワークス', '何件納品したか'],
    ['booth_illustration', 'BOOTH用イラスト', '何点納品したか、進行度合いは何割程度か'],
    ['youtube_video', 'YouTube動画', '何点納品したか、進行度合いは何割程度か'],
    ['youtube_thumbnail', 'YouTube動画用サムネ', '何点納品したか、進行度合いは何割程度か'],
    ['sns_post', 'SNS運用案件(ポスト作成)', '何点納品したか'],
    ['sns_video', 'SNS運用案件(動画作成)', '何点納品したか、進行度合いは何割程度か'],
    ['netbank', 'ネットバンク', '何件作業したか。1の位は切り捨てでOK'],
    ['youtube_script', 'YouTube動画台本', '何件納品したか、進行度合いは何割程度か'],
    ['light_work', '軽作業', '何点納品したか、進行度合いは何割程度か']
  ].map((row, index) => ({ id: row[0], label: row[1], hint: row[2], active: true, order: index }));
}

function reportLabel_(report) {
  report = normalizeReport_(report || {});
  const activities = readActivities_();
  const labels = report.activityIds.map(id => {
    const current = activities.find(activity => activity.id === id);
    return current ? current.label : (report.activityLabels && report.activityLabels[id]) || '削除済み項目';
  });
  return [report.date, report.name, labels.join('、')].join(' ').trim();
}

function reportActivityLabelFromRecord_(report, activityId) {
  if (report.activityLabels && report.activityLabels[activityId]) return report.activityLabels[activityId];
  return activityId || '不明';
}

function reportActivityLabelsText_(report) {
  return report.activityIds.map(function(activityId) {
    return reportActivityLabelFromRecord_(report, activityId);
  }).join('、');
}

function reportActivityMinutesText_(report) {
  return report.activityIds.map(function(activityId) {
    const label = reportActivityLabelFromRecord_(report, activityId);
    const minutes = Number(report.activityMinutes && report.activityMinutes[activityId] || 0);
    return label + ': ' + minutesText_(minutes);
  }).join('、');
}

function minutesText_(minutes) {
  const total = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return rest + '分';
  if (!rest) return hours + '時間';
  return hours + '時間' + rest + '分';
}

function formatDateForSheet_(value) {
  if (!value) return '';
  return String(value).slice(0, 10).replace(/-/g, '/');
}

function formatDateTimeForSheet_(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
}

function assertAdmin_(password) {
  const stored = adminPasswordHash_();
  if (!stored) throw new Error('管理者パスワードが未設定です。Apps Scriptで setupInitialAdminPassword を実行してください。');
  if (sha256(password || '') !== stored) throw new Error('管理者パスワードが違います。');
}

function isValidAdminPassword_(password) {
  return String(password || '').length >= ADMIN_PASSWORD_MIN_LENGTH;
}

function hasAdminPassword_() {
  return !!adminPasswordHash_();
}

function adminHashKey_() {
  return ADMIN_HASH_KEY + '_' + ACTIVE_SYSTEM_KEY;
}

function adminPasswordHash_() {
  return PropertiesService.getScriptProperties().getProperty(adminHashKey_());
}

function migrateLegacyAdminHashes_() {
  const properties = PropertiesService.getScriptProperties();
  const legacyHash = properties.getProperty(ADMIN_HASH_KEY);
  if (!legacyHash) return;
  Object.keys(SPREADSHEET_IDS).forEach(function(systemKey) {
    const tenantKey = ADMIN_HASH_KEY + '_' + systemKey;
    if (!properties.getProperty(tenantKey)) {
      properties.setProperty(tenantKey, legacyHash);
      properties.setProperty(ADMIN_ROTATION_KEY_PREFIX + systemKey, 'true');
    }
  });
  properties.deleteProperty(ADMIN_HASH_KEY);
}

function initializeConfiguredAdminPassword_() {
  const properties = PropertiesService.getScriptProperties();
  const key = adminHashKey_();
  const initialHash = INITIAL_ADMIN_PASSWORD_HASHES[ACTIVE_SYSTEM_KEY];
  if (initialHash && !properties.getProperty(key)) {
    properties.setProperty(key, initialHash);
    properties.deleteProperty(adminRotationKey_());
  }
}

function adminRotationKey_() {
  return ADMIN_ROTATION_KEY_PREFIX + ACTIVE_SYSTEM_KEY;
}

function passwordRotationRequired_() {
  return PropertiesService.getScriptProperties().getProperty(adminRotationKey_()) === 'true';
}

function revisionKey_() {
  return REVISION_KEY_PREFIX + ACTIVE_SYSTEM_KEY;
}

function currentRevision_() {
  return Number(PropertiesService.getScriptProperties().getProperty(revisionKey_()) || 0);
}

function bumpRevision_() {
  const next = currentRevision_() + 1;
  PropertiesService.getScriptProperties().setProperty(revisionKey_(), String(next));
  return next;
}

function assertExpectedRevision_(expectedRevision) {
  if (expectedRevision === undefined || expectedRevision === null || expectedRevision === '') {
    throw new Error('CONFLICT: 画面が古いため保存できません。再読み込みしてから操作してください。');
  }
  const expected = Number(expectedRevision);
  const current = currentRevision_();
  if (!Number.isFinite(expected) || expected !== current) {
    throw new Error('CONFLICT: 他の端末で先に更新されています。再読み込みして内容を確認してください。');
  }
}

function sha256(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(byte => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0')).join('');
}

function clone_(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function normalizedNameKey_(name) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

function toDateKey_(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function dateKeyFromTimestamp_(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!isNaN(date.getTime())) return toDateKey_(date);
  return /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? String(value).slice(0, 10) : '';
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
