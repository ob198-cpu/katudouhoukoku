const SHEETS = {
  reports: { name: 'Reports', type: 'reports', headers: ['投稿日', '氏名', '生産活動内容', '活動別時間', '合計時間(分)', '合計時間', '進捗状況', '選択投稿日', '実送信日', '日付正誤', '送信日時', '更新日時', 'id', 'json'] },
  activities: { name: 'Activities', headers: ['id', 'json', 'updatedAt'] },
  history: { name: 'History', headers: ['id', 'json', 'at'] }
};
const SPREADSHEET_ID = '1QMvmHhMYTp1-eJ_DEZn6wlUyBtCTe5C4h4rn1N9wZHQ';
const ADMIN_HASH_KEY = 'ADMIN_PASSWORD_SHA256';
const ADMIN_PASSWORD_MIN_LENGTH = 4;
const HISTORY_LIMIT = 1000;
const DUPLICATE_REPORT_MESSAGE = '同じ日に同じ氏名で既に報告済みです。再入力はできません。修正が必要な場合は管理者に連絡してください。';

function setupInitialAdminPassword(password) {
  if (!isValidAdminPassword_(password)) throw new Error('管理者パスワードは4文字以上で指定してください。');
  PropertiesService.getScriptProperties().setProperty(ADMIN_HASH_KEY, sha256(password));
  ensureAllSheets_();
}

function doGet() {
  ensureAllSheets_();
  return json_({ ok: true, data: { status: 'ready', hasAdminPassword: hasAdminPassword_() } });
}

function doPost(e) {
  try {
    ensureAllSheets_();
    const request = JSON.parse((e.postData && e.postData.contents) || '{}');
    const action = request.action || '';
    const payload = request.payload || {};
    const password = request.password || '';
    const data = handleAction_(action, payload, password);
    return json_({ ok: true, data });
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function handleAction_(action, payload, password) {
  if (action === 'publicConfig') return { activities: readActivities_() };
  if (action === 'submitReport') return submitReport_(payload.report || {});

  assertAdmin_(password);
  if (action === 'adminSnapshot') return snapshot_();
  if (action === 'updateReport') return updateReport_(payload.id, payload.report || {});
  if (action === 'deleteReport') return deleteReport_(payload.id);
  if (action === 'deleteAllReports') return deleteAllReports_();
  if (action === 'saveActivities') return saveActivities_(payload.activities || [], payload.actionLabel || '編集');
  if (action === 'restoreHistoryEntry') return restoreHistoryEntry_(payload.historyId);
  if (action === 'changeAdminPassword') return changeAdminPassword_(payload.newPassword || '');
  throw new Error('未対応の操作です: ' + action);
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
  const duplicate = readReports_().find(row =>
    row.id !== normalized.id &&
    row.date === normalized.date &&
    normalizedNameKey_(row.name) === normalizedNameKey_(normalized.name)
  );
  if (duplicate) throw new Error(DUPLICATE_REPORT_MESSAGE);
  upsertJson_(SHEETS.reports, normalized.id, normalized, normalized.updatedAt);
  addHistory_('登録', '報告', null, normalized);
  return { report: normalized, activities: readActivities_() };
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
  addHistory_('編集', '報告', before, updated);
  return snapshot_();
}

function deleteReport_(id) {
  const before = readReports_().find(row => row.id === id);
  if (!before) throw new Error('削除対象の報告が見つかりません。');
  deleteJson_(SHEETS.reports, id);
  addHistory_('削除', '報告', before, null);
  return snapshot_();
}

function deleteAllReports_() {
  const before = readReports_();
  writeJsonRows_(SHEETS.reports, []);
  addHistory_('全削除', '報告', { label: before.length + '件', reports: before }, null);
  return snapshot_();
}

function saveActivities_(activities, actionLabel) {
  const before = readActivities_();
  const normalized = normalizeActivities_(activities);
  writeJsonRows_(SHEETS.activities, normalized);
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
  PropertiesService.getScriptProperties().setProperty(ADMIN_HASH_KEY, sha256(newPassword));
  return snapshot_();
}

function snapshot_() {
  return { reports: readReports_(), activities: readActivities_(), history: readHistory_() };
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
    writeJsonRowsToSheet_(sheet, def, readJsonRowsFromSheet_(sheet));
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
  const sheet = targetSpreadsheet_().getSheetByName(def.name);
  writeJsonRowsToSheet_(sheet, def, rows);
}

function writeJsonRowsToSheet_(sheet, def, rows) {
  if (sheet.getMaxColumns() < def.headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), def.headers.length - sheet.getMaxColumns());
  }
  sheet.clearContents();
  sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
  const values = rows.map(function(row) { return rowValuesForSheet_(def, row); });
  if (values.length) sheet.getRange(2, 1, values.length, def.headers.length).setValues(values);
  sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
  sheet.autoResizeColumns(1, def.headers.length);
  applySheetPresentation_(sheet, def);
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
  const rows = readJsonRows_(def).filter(item => item.id !== id);
  rows.push(row);
  writeJsonRows_(def, rows.sort((a, b) => String(a.id).localeCompare(String(b.id))));
}

function deleteJson_(def, id) {
  writeJsonRows_(def, readJsonRows_(def).filter(item => item.id !== id));
}

function targetSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
}

function readReports_() { return readJsonRows_(SHEETS.reports).map(normalizeReport_).filter(row => row.date && row.name); }
function readActivities_() { return normalizeActivities_(readJsonRows_(SHEETS.activities)); }
function readHistory_() { return readJsonRows_(SHEETS.history).slice(0, HISTORY_LIMIT); }

function addHistory_(action, target, before, after) {
  const source = after || before || {};
  const entry = {
    id: 'history_' + Date.now() + '_' + Utilities.getUuid().slice(0, 8),
    at: new Date().toISOString(),
    action: action,
    target: target,
    recordId: source.id || '',
    label: target === '報告' ? reportLabel_(source) : String(source.label || target || ''),
    before: clone_(before),
    after: clone_(after)
  };
  const rows = [entry].concat(readHistory_()).slice(0, HISTORY_LIMIT);
  writeJsonRows_(SHEETS.history, rows);
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
  const stored = PropertiesService.getScriptProperties().getProperty(ADMIN_HASH_KEY);
  if (!stored) throw new Error('管理者パスワードが未設定です。Apps Scriptで setupInitialAdminPassword を実行してください。');
  if (sha256(password || '') !== stored) throw new Error('管理者パスワードが違います。');
}

function isValidAdminPassword_(password) {
  return String(password || '').length >= ADMIN_PASSWORD_MIN_LENGTH;
}

function hasAdminPassword_() {
  return !!PropertiesService.getScriptProperties().getProperty(ADMIN_HASH_KEY);
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
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
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
