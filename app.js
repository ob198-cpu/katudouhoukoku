const CLOUD_SYSTEM_KEY = String(window.PRODUCTION_REPORT_SYSTEM_KEY || "");
const SYSTEM_STORAGE_NAMESPACE = "production_activity:" +
  (CLOUD_SYSTEM_KEY || String(location.pathname || "").split("/").filter(Boolean)[0] || "local").replace(/[^a-zA-Z0-9_-]/g, "_");
const scopedStorageKey = suffix => `${SYSTEM_STORAGE_NAMESPACE}:${suffix}`;
const REPORTS_KEY = scopedStorageKey("reports_v3");
const ACTIVITIES_KEY = scopedStorageKey("items_v3");
const ADMIN_PIN_KEY = scopedStorageKey("admin_pin_v2");
const ADMIN_SESSION_KEY = scopedStorageKey("admin_unlocked_v2");
const ADMIN_PASSWORD_SESSION_KEY = scopedStorageKey("admin_password_v2");
const HISTORY_KEY = scopedStorageKey("history_v2");
const DEFAULT_ADMIN_PIN = "";
const LEGACY_DEFAULT_ADMIN_PIN = "0000";
const CLOUD_API_URL = window.PRODUCTION_REPORT_API_URL || "";
const DUPLICATE_REPORT_MESSAGE = "同じ日に同じ氏名で既に報告済みです。再入力はできません。修正が必要な場合は管理者に連絡してください。";

const DEFAULT_ACTIVITIES = [
  { id: "transcription", label: "文字起こし", hint: "納品したかどうか", active: true },
  { id: "bookmark", label: "栞作成", hint: "何個納品したか", active: true },
  { id: "crowdworks", label: "クラウドワークス", hint: "何件納品したか", active: true },
  { id: "booth_illustration", label: "BOOTH用イラスト", hint: "何点納品したか、進行度合いは何割程度か", active: true },
  { id: "youtube_video", label: "YouTube動画", hint: "何点納品したか、進行度合いは何割程度か", active: true },
  { id: "youtube_thumbnail", label: "YouTube動画用サムネ", hint: "何点納品したか、進行度合いは何割程度か", active: true },
  { id: "sns_post", label: "SNS運用案件(ポスト作成)", hint: "何点納品したか", active: true },
  { id: "sns_video", label: "SNS運用案件(動画作成)", hint: "何点納品したか、進行度合いは何割程度か", active: true },
  { id: "netbank", label: "ネットバンク", hint: "何件作業したか。1の位は切り捨てでOK", active: true },
  { id: "youtube_script", label: "YouTube動画台本", hint: "何件納品したか、進行度合いは何割程度か", active: true },
  { id: "light_work", label: "軽作業", hint: "何点納品したか、進行度合いは何割程度か", active: true }
];

const TIME_OPTIONS = [
  ["15分", 15],
  ["20分", 20],
  ["30分", 30],
  ["40分", 40],
  ["50分", 50],
  ["1時間", 60],
  ["1時間30分", 90],
  ["2時間", 120],
  ["2時間30分", 150],
  ["3時間", 180],
  ["3時間30分", 210]
];

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayKey() {
  const date = new Date();
  return toDateKey(date);
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(value, days) {
  const date = parseDate(value) || new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function addMonths(value, months) {
  const date = parseDate(value) || new Date();
  date.setMonth(date.getMonth() + months);
  return toDateKey(date);
}

function weekStart(value) {
  const date = parseDate(value) || new Date();
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return toDateKey(date);
}

function monthStart(value) {
  const date = parseDate(value) || new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthEnd(value) {
  const start = parseDate(monthStart(value)) || new Date();
  return toDateKey(new Date(start.getFullYear(), start.getMonth() + 1, 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = parseDate(value);
  if (!date) return value;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function dateKeyFromTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return toDateKey(date);
  return /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? String(value).slice(0, 10) : "";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${formatDate(toDateKey(date))} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function minutesText(minutes) {
  const total = Math.round(Number(minutes) || 0);
  if (total < 60) return `${total}分`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}

function timeOptionsHtml(selectedValue = "") {
  return '<option value="">時間を選択</option>' +
    TIME_OPTIONS.map(([label, minutes]) => `<option value="${minutes}" ${Number(selectedValue) === minutes ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function normalizedNameKey(name) {
  return String(name || "").replace(/\s+/g, "").toLowerCase();
}

function hasSameDayNameReport(report, exceptId = "") {
  const nameKey = normalizedNameKey(report.name);
  if (!report.date || !nameKey) return false;
  return loadReports().some(item =>
    item.id !== exceptId &&
    item.date === report.date &&
    normalizedNameKey(item.name) === nameKey
  );
}

function parseJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function cloudEnabled() {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(String(CLOUD_API_URL || "").trim());
}

function adminPassword() {
  return sessionStorage.getItem(ADMIN_PASSWORD_SESSION_KEY) || "";
}

function setStorageStatus(text, type = "warn") {
  const target = $("#storage-status");
  if (!target) return;
  target.textContent = text;
  target.className = "storage-status " + type;
}

async function cloudRequest(action, payload = {}, password = "") {
  if (!cloudEnabled()) throw new Error("クラウド保存URLが未設定です。");
  const response = await fetch(String(CLOUD_API_URL).trim(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, password, payload, systemKey: CLOUD_SYSTEM_KEY })
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("クラウド保存先がJSONを返していません。Apps Scriptの初回承認・公開設定を確認してください。");
  }
  if (!response.ok || !result.ok) throw new Error(result.error || "クラウド保存に失敗しました。");
  return result.data || {};
}

function applySnapshot(snapshot = {}) {
  if (Array.isArray(snapshot.activities)) saveActivities(snapshot.activities);
  if (Array.isArray(snapshot.reports)) saveReports(snapshot.reports);
  if (Array.isArray(snapshot.history)) saveHistory(snapshot.history);
}

async function refreshCloudPublic() {
  if (!cloudEnabled()) {
    setStorageStatus("ローカル保存中: この端末のブラウザ内だけに保存されます。クラウド保存URLを設定してください。", "warn");
    return false;
  }
  try {
    const data = await cloudRequest("publicConfig");
    applySnapshot(data);
    setStorageStatus("クラウド接続済み: 保存完了はサーバー確認後に表示します。", "ok");
    return true;
  } catch (error) {
    setStorageStatus("クラウド接続エラー: " + error.message, "error");
    return false;
  }
}

async function refreshCloudAdmin(password = adminPassword()) {
  if (!cloudEnabled()) {
    setStorageStatus("ローカル保存中: 管理者データもこの端末のブラウザ内だけです。", "warn");
    return false;
  }
  const data = await cloudRequest("adminSnapshot", {}, password);
  applySnapshot(data);
  setStorageStatus("クラウド接続済み: 管理者操作はサーバー側パスワードで保護されています。", "ok");
  return true;
}

async function cloudAdminAction(action, payload = {}) {
  const data = await cloudRequest(action, payload, adminPassword());
  applySnapshot(data);
  setStorageStatus("クラウド保存済み（サーバー確認済み）", "ok");
  return data;
}

function normalizeActivity(activity, index = 0) {
  return {
    id: activity?.id || uid("activity"),
    label: String(activity?.label || "").trim(),
    hint: String(activity?.hint || "").trim(),
    active: activity?.active !== false,
    order: Number.isFinite(Number(activity?.order)) ? Number(activity.order) : index
  };
}

function defaultActivities() {
  return DEFAULT_ACTIVITIES.map((activity, index) => ({ ...activity, order: index }));
}

function loadActivities() {
  let activities = parseJson(ACTIVITIES_KEY, []);
  if (!Array.isArray(activities) || !activities.length) {
    activities = defaultActivities();
    saveActivities(activities);
  }
  return activities
    .map(normalizeActivity)
    .filter(activity => activity.label)
    .sort((a, b) => a.order - b.order);
}

function saveActivities(activities) {
  const normalized = activities
    .map(normalizeActivity)
    .filter(activity => activity.label)
    .map((activity, index) => ({ ...activity, order: index }));
  localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(normalized));
}

function activeActivities() {
  return loadActivities().filter(activity => activity.active);
}

function normalizeReport(report) {
  const activityIds = Array.isArray(report?.activityIds)
    ? report.activityIds.map(String).filter(Boolean)
    : [];
  const activityLabels = report?.activityLabels && typeof report.activityLabels === "object"
    ? report.activityLabels
    : {};
  const sourceMinutes = report?.activityMinutes && typeof report.activityMinutes === "object"
    ? report.activityMinutes
    : {};
  const activityMinutes = {};
  activityIds.forEach(activityId => {
    const minutes = Math.max(0, Number(sourceMinutes[activityId] || 0));
    if (minutes) activityMinutes[activityId] = minutes;
  });
  const totalFromActivities = Object.values(activityMinutes).reduce((sum, minutes) => sum + minutes, 0);
  const nowIso = new Date().toISOString();
  const submittedAt = report?.submittedAt || report?.createdAt || nowIso;
  const submittedDate = report?.submittedDate || dateKeyFromTimestamp(submittedAt) || todayKey();
  const selectedDateForCheck = report?.dateCheck?.selectedDate || report?.date || todayKey();
  const submittedDateForCheck = report?.dateCheck?.submittedDate || submittedDate;
  const dateCheck = {
    selectedDate: selectedDateForCheck,
    submittedDate: submittedDateForCheck,
    correct: selectedDateForCheck === submittedDateForCheck
  };
  return {
    id: report?.id || uid("report"),
    date: report?.date || todayKey(),
    name: String(report?.name || "").trim(),
    activityIds,
    activityLabels,
    activityMinutes,
    minutes: totalFromActivities || Math.max(0, Number(report?.minutes || 0)),
    progress: String(report?.progress || "").trim(),
    submittedAt,
    submittedDate,
    dateCheck,
    createdAt: report?.createdAt || submittedAt,
    updatedAt: report?.updatedAt || nowIso
  };
}

function loadReports() {
  const reports = parseJson(REPORTS_KEY, []);
  return Array.isArray(reports)
    ? reports.map(normalizeReport).filter(report => report.date && report.name)
    : [];
}

function saveReports(reports) {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports.map(normalizeReport)));
}

function loadHistory() {
  const history = parseJson(HISTORY_KEY, []);
  return Array.isArray(history) ? history : [];
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 1000)));
}

function cloneRecord(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function reportLabel(report = {}) {
  return `${report.date || ""} ${report.name || ""} ${reportActivityLabels(normalizeReport(report)).join("、")}`.trim();
}

function addHistory(action, target, before, after) {
  const source = after || before || {};
  const entry = {
    id: uid("history"),
    at: new Date().toISOString(),
    action,
    target,
    recordId: source.id || "",
    label: target === "報告" ? reportLabel(source) : String(source.label || target || ""),
    before: cloneRecord(before),
    after: cloneRecord(after)
  };
  saveHistory([entry, ...loadHistory()]);
}

async function addReport(report) {
  const submittedAt = new Date().toISOString();
  const submittedDate = todayKey();
  const selectedDate = report?.date || submittedDate;
  const normalized = normalizeReport({
    ...report,
    submittedAt,
    submittedDate,
    dateCheck: { selectedDate, submittedDate, correct: selectedDate === submittedDate },
    createdAt: submittedAt,
    updatedAt: submittedAt
  });
  if (hasSameDayNameReport(normalized)) throw new Error(DUPLICATE_REPORT_MESSAGE);
  if (cloudEnabled()) {
    const data = await cloudRequest("submitReport", { report: normalized });
    const saved = normalizeReport(data.report || normalized);
    const reports = loadReports().filter(item => item.id !== saved.id);
    reports.push(saved);
    saveReports(reports);
    if (Array.isArray(data.activities)) saveActivities(data.activities);
    setStorageStatus("クラウド保存済み（サーバー確認済み）", "ok");
    return saved;
  }
  const reports = loadReports();
  reports.push(normalized);
  saveReports(reports);
  addHistory("登録", "報告", null, normalized);
  return normalized;
}

async function updateReport(id, nextReport) {
  if (cloudEnabled()) {
    await cloudAdminAction("updateReport", { id, report: nextReport });
    return true;
  }
  const reports = loadReports();
  const index = reports.findIndex(report => report.id === id);
  if (index < 0) return false;
  const before = reports[index];
  const updated = normalizeReport({
    ...before,
    ...nextReport,
    id: before.id,
    submittedAt: before.submittedAt,
    submittedDate: before.submittedDate,
    dateCheck: before.dateCheck,
    createdAt: before.createdAt,
    updatedAt: new Date().toISOString()
  });
  reports[index] = updated;
  saveReports(reports);
  addHistory("編集", "報告", before, updated);
  return true;
}

async function deleteReport(id) {
  if (cloudEnabled()) {
    await cloudAdminAction("deleteReport", { id });
    return true;
  }
  const reports = loadReports();
  const target = reports.find(report => report.id === id);
  if (!target) return false;
  saveReports(reports.filter(report => report.id !== id));
  addHistory("削除", "報告", target, null);
  return true;
}

function activityLabel(report, activityId) {
  const current = loadActivities().find(activity => activity.id === activityId);
  return current?.label || report.activityLabels?.[activityId] || "削除済み項目";
}

function reportActivityLabels(report) {
  return report.activityIds.map(activityId => activityLabel(report, activityId));
}

function reportActivityMinuteEntries(report) {
  const activityIds = report.activityIds.length ? report.activityIds : ["__none__"];
  const hasActivityMinutes = report.activityIds.some(activityId => Number(report.activityMinutes?.[activityId] || 0) > 0);
  if (!hasActivityMinutes) {
    const minutesShare = report.minutes / activityIds.length;
    return activityIds.map(activityId => ({ activityId, minutes: minutesShare }));
  }
  return activityIds.map(activityId => ({
    activityId,
    minutes: Math.max(0, Number(report.activityMinutes?.[activityId] || 0))
  }));
}

function reportActivitySummaryText(report) {
  return reportActivityMinuteEntries(report)
    .filter(entry => entry.activityId !== "__none__")
    .map(entry => `${activityLabel(report, entry.activityId)}（${minutesText(entry.minutes)}）`)
    .join("、") || "-";
}

function setMessage(selector, text, type = "ok") {
  const target = $(selector);
  if (!target) return;
  target.textContent = text;
  target.className = `form-message ${type}`;
}

function currentAdminPin() {
  const savedPin = localStorage.getItem(ADMIN_PIN_KEY);
  if (savedPin === null || savedPin === LEGACY_DEFAULT_ADMIN_PIN) return DEFAULT_ADMIN_PIN;
  return savedPin;
}

function initFormPage() {
  initReportDateInput();
  updateTotalMinutes();
  renderFormActivities();
  refreshCloudPublic().then(() => renderFormActivities());

  $("#report-name")?.addEventListener("input", updateDuplicateWarning);
  $("#clear-form")?.addEventListener("click", clearForm);
  $("#report-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const report = collectFormReport();
    const error = validateReport(report, { requireActivityMinutes: true, preventDuplicate: true });
    if (error) {
      setMessage("#form-message", error, "error");
      return;
    }
    if (!confirmReportSubmission(report)) {
      setMessage("#form-message", "送信をキャンセルしました。", "error");
      return;
    }
    const submitButton = event.submitter || $("#report-form button[type='submit']");
    if (submitButton) submitButton.disabled = true;
    try {
      const savedReport = await addReport(report);
      clearForm();
      setMessage("#form-message", submissionSuccessMessage(savedReport), "ok");
    } catch (error) {
      setMessage("#form-message", "送信できませんでした: " + error.message, "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

function renderFormActivities(selectedIds = []) {
  const container = $("#activity-list");
  if (!container) return;
  const selected = new Set(selectedIds);
  const activities = activeActivities();
  if (!activities.length) {
    container.innerHTML = '<div class="empty-state">現在選択できる生産活動項目がありません。</div>';
    return;
  }
  container.innerHTML = activities.map((activity, index) => {
    const inputId = `activity-${index}-${activity.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `
      <div class="activity-card activity-card-with-time" data-activity-card="${escapeHtml(activity.id)}">
        <label class="activity-check-line" for="${escapeHtml(inputId)}">
          <input id="${escapeHtml(inputId)}" type="checkbox" name="activity" value="${escapeHtml(activity.id)}" ${selected.has(activity.id) ? "checked" : ""}>
          <span>${escapeHtml(activity.label)}</span>
        </label>
        ${activity.hint ? `<small>${escapeHtml(activity.hint)}</small>` : ""}
        <label class="activity-time-field">
          作業時間
          <select name="activity-minutes" data-activity-minutes="${escapeHtml(activity.id)}" disabled>${timeOptionsHtml()}</select>
        </label>
      </div>
    `;
  }).join("");
  $$('[name="activity"]').forEach(input => input.addEventListener("change", handleActivitySelectionChange));
  $$('[name="activity-minutes"]').forEach(select => select.addEventListener("change", updateTotalMinutes));
  handleActivitySelectionChange();
}

function updateProgressPlaceholder() {
  const textarea = $("#report-progress");
  if (!textarea) return;
  const selectedIds = new Set($$('[name="activity"]:checked').map(input => input.value));
  const selected = activeActivities().filter(activity => selectedIds.has(activity.id));
  const hints = selected.length ? selected : activeActivities();
  textarea.placeholder = hints.map((activity, index) => `${index + 1}. ${activity.label}: ${activity.hint || "納品数・進行度合い"}`).join("\n");
}

function findActivityMinutesSelect(activityId) {
  return $$('[name="activity-minutes"]').find(select => select.dataset.activityMinutes === activityId) || null;
}

function handleActivitySelectionChange() {
  $$('[name="activity"]').forEach(input => {
    const select = findActivityMinutesSelect(input.value);
    const card = input.closest(".activity-card-with-time");
    if (select) {
      select.disabled = !input.checked;
      if (!input.checked) select.value = "";
    }
    if (card) card.classList.toggle("selected", input.checked);
  });
  updateProgressPlaceholder();
  updateTotalMinutes();
}

function updateTotalMinutes() {
  const total = $$('[name="activity"]:checked').reduce((sum, input) => {
    const select = findActivityMinutesSelect(input.value);
    return sum + Number(select?.value || 0);
  }, 0);
  const hidden = $("#report-minutes");
  const display = $("#report-minutes-display");
  if (hidden) hidden.value = String(total);
  if (display) display.value = minutesText(total);
}

function collectActivityMinutes(activityIds) {
  const activityMinutes = {};
  activityIds.forEach(activityId => {
    const minutes = Number(findActivityMinutesSelect(activityId)?.value || 0);
    if (minutes) activityMinutes[activityId] = minutes;
  });
  return activityMinutes;
}

function confirmReportSubmission(report) {
  const activities = reportActivityMinuteEntries(report)
    .filter(entry => entry.activityId !== "__none__")
    .map(entry => `・${activityLabel(report, entry.activityId)}: ${minutesText(entry.minutes)}`)
    .join("\n");
  const today = todayKey();
  const dateMismatchLines = report.date && report.date !== today
    ? [
        "",
        "【日付の確認】",
        `選択した投稿日: ${formatDate(report.date)}`,
        `送信日: ${formatDate(today)}`,
        "投稿日と送信日が異なります。内容に問題なければ、このまま送信できます。",
        "管理画面では確認用として表示されます。"
      ]
    : [];
  return window.confirm([
    "この内容で送信します。よろしいですか？",
    `日付: ${formatDate(report.date)}`,
    `氏名: ${report.name}`,
    "作業内容:",
    activities || "・未選択",
    `トータル時間: ${minutesText(report.minutes)}`,
    "進捗状況:",
    report.progress,
    ...dateMismatchLines
  ].join("\n"));
}

function submissionSuccessMessage(savedReport) {
  const check = reportDateCheck(savedReport);
  const storageText = cloudEnabled() ? "サーバーで保存完了を確認しました。" : "この端末内に保存しました。";
  if (check.correct) return `送信しました。${storageText}`;
  return `送信しました。投稿日（${formatDate(check.selectedDate)}）と送信日（${formatDate(check.submittedDate)}）が異なるため、管理画面では確認用として表示されます。`;
}

function updateDuplicateWarning() {
  const report = collectFormReport();
  if (report.name && hasSameDayNameReport(report)) {
    setMessage("#form-message", DUPLICATE_REPORT_MESSAGE, "error");
  } else if ($("#form-message")?.textContent === DUPLICATE_REPORT_MESSAGE) {
    setMessage("#form-message", "", "ok");
  }
}

function initReportDateInput() {
  const dateInput = $("#report-date");
  if (!dateInput) return;
  if (!dateInput.value) dateInput.value = todayKey();
  dateInput.readOnly = false;
  dateInput.removeAttribute("min");
  dateInput.removeAttribute("max");
  if (dateInput.dataset.dateInitialized === "1") return;
  dateInput.dataset.dateInitialized = "1";
  dateInput.addEventListener("change", updateDuplicateWarning);
}

function collectFormReport() {
  const activityIds = $$('[name="activity"]:checked').map(input => input.value);
  const activityMap = new Map(loadActivities().map(activity => [activity.id, activity]));
  const activityLabels = {};
  activityIds.forEach(activityId => {
    activityLabels[activityId] = activityMap.get(activityId)?.label || "";
  });
  const activityMinutes = collectActivityMinutes(activityIds);
  return normalizeReport({
    date: $("#report-date")?.value || "",
    name: $("#report-name")?.value.trim() || "",
    activityIds,
    activityLabels,
    activityMinutes,
    minutes: Number($("#report-minutes")?.value || 0),
    progress: $("#report-progress")?.value.trim() || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function validateReport(report, options = {}) {
  if (!report.date) return "日付を入力してください。";
  if (!report.name) return "氏名を入力してください。";
  if (options.preventDuplicate && hasSameDayNameReport(report)) return DUPLICATE_REPORT_MESSAGE;
  if (!report.activityIds.length) return "生産活動内容を1つ以上選択してください。";
  if (options.requireActivityMinutes) {
    const missingTime = report.activityIds.some(activityId => !Number(report.activityMinutes?.[activityId] || 0));
    if (missingTime) return "選択した作業内容ごとに作業時間を選択してください。";
  }
  if (!report.minutes) return "所要時間を選択してください。";
  if (!report.progress) return "進捗状況を入力してください。";
  return "";
}

function clearForm() {
  $("#report-form")?.reset();
  initReportDateInput();
  renderFormActivities([]);
  updateTotalMinutes();
}

function initAdminPage() {
  if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1" && (!cloudEnabled() || adminPassword())) {
    unlockAdmin();
  } else {
    refreshCloudPublic();
  }

  $("#admin-login-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const pin = $("#admin-pin")?.value || "";
    if (cloudEnabled()) {
      try {
        await refreshCloudAdmin(pin);
        sessionStorage.setItem(ADMIN_PASSWORD_SESSION_KEY, pin);
        sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
        unlockAdmin();
      } catch (error) {
        setMessage("#admin-login-message", "ログインできません: " + error.message, "error");
      }
      return;
    }
    const savedPin = currentAdminPin();
    if (pin !== savedPin) {
      setMessage("#admin-login-message", "パスワードが違います。", "error");
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    unlockAdmin();
  });

  $$("[data-admin-view]").forEach(button => {
    button.addEventListener("click", () => showAdminView(button.dataset.adminView));
  });

  $("#period-date").value = todayKey();
  $("#period-prev")?.addEventListener("click", () => shiftPeriod(-1));
  $("#period-next")?.addEventListener("click", () => shiftPeriod(1));
  $("#period-mode")?.addEventListener("change", renderAdminSummary);
  $("#period-date")?.addEventListener("change", renderAdminSummary);
  $("#staff-select")?.addEventListener("change", renderSelectedStaffChart);
  $("#report-search")?.addEventListener("input", renderReportTable);
  $("#report-filter-start")?.addEventListener("change", renderReportTable);
  $("#report-filter-end")?.addEventListener("change", renderReportTable);
  $("#clear-report-filters")?.addEventListener("click", clearReportFilters);
  $("#cancel-report-edit")?.addEventListener("click", cancelReportEdit);
  $("#report-edit-form")?.addEventListener("submit", saveReportEdit);
  $("#delete-all-reports")?.addEventListener("click", deleteAllReports);
  $("#report-table")?.addEventListener("click", async event => {
    const editButton = event.target.closest("[data-edit-report]");
    if (editButton) {
      startReportEdit(editButton.dataset.editReport);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-report]");
    if (!deleteButton) return;
    if (!confirm("この報告を削除します。履歴には削除前データが残ります。よろしいですか？")) return;
    deleteButton.disabled = true;
    try {
      await deleteReport(deleteButton.dataset.deleteReport);
      cancelReportEdit();
      renderAdminAll();
    } catch (error) {
      alert("削除できませんでした: " + error.message);
    } finally {
      deleteButton.disabled = false;
    }
  });
  $("#history-list")?.addEventListener("click", event => {
    const detailButton = event.target.closest("[data-history-detail]");
    if (detailButton) {
      showHistoryDetail(detailButton.dataset.historyDetail);
      return;
    }
    const restoreButton = event.target.closest("[data-restore-history]");
    if (restoreButton) restoreHistoryEntry(restoreButton.dataset.restoreHistory);
  });
  $("#add-activity")?.addEventListener("click", addActivityEditorRow);
  $("#save-activities")?.addEventListener("click", saveActivityEditor);
  $("#reset-activities")?.addEventListener("click", resetActivities);
  $("#activity-editor")?.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-activity]");
    if (button) removeActivityEditorRow(button);
  });
  $("#pin-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const pin = $("#new-pin")?.value.trim() || "";
    if (pin.length < 4) {
      setMessage("#pin-message", "パスワードは4文字以上で入力してください。", "error");
      return;
    }
    try {
      if (cloudEnabled()) {
        await cloudAdminAction("changeAdminPassword", { newPassword: pin });
        sessionStorage.setItem(ADMIN_PASSWORD_SESSION_KEY, pin);
      } else {
        localStorage.setItem(ADMIN_PIN_KEY, pin);
      }
      $("#new-pin").value = "";
      setMessage("#pin-message", "パスワードを変更しました。", "ok");
    } catch (error) {
      setMessage("#pin-message", "変更できませんでした: " + error.message, "error");
    }
  });
}

function unlockAdmin() {
  $("#admin-lock")?.classList.add("hidden");
  $("#admin-console")?.classList.remove("hidden");
  renderAdminAll();
  if (cloudEnabled()) {
    refreshCloudAdmin().then(renderAdminAll).catch(error => {
      setStorageStatus("クラウド同期エラー: " + error.message, "error");
    });
  }
}

function showAdminView(name) {
  $$("[data-admin-view]").forEach(button => button.classList.toggle("active", button.dataset.adminView === name));
  $$("[data-admin-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.adminPanel === name));
  if (name === "summary") renderAdminSummary();
  if (name === "reports") renderReportTable();
  if (name === "date-check") renderDateCheckView();
  if (name === "settings") renderActivityEditor();
}

function renderAdminAll() {
  renderAdminSummary();
  renderReportTable();
  renderDateCheckView();
  renderActivityEditor();
  renderHistory();
}

function periodRange() {
  const mode = $("#period-mode")?.value || "week";
  const base = $("#period-date")?.value || todayKey();
  if (mode === "month") {
    return { mode, start: monthStart(base), end: monthEnd(base) };
  }
  const start = weekStart(base);
  return { mode, start, end: addDays(start, 6) };
}

function periodReports() {
  const range = periodRange();
  return loadReports().filter(report => report.date >= range.start && report.date <= range.end);
}

function shiftPeriod(direction) {
  const mode = $("#period-mode")?.value || "week";
  const current = $("#period-date")?.value || todayKey();
  $("#period-date").value = mode === "month" ? addMonths(current, direction) : addDays(current, direction * 7);
  renderAdminSummary();
}

function buildSummary(reports) {
  const activityStats = new Map();
  const staffStats = new Map();

  reports.forEach(report => {
    const name = report.name || "(無名)";
    const activityEntries = reportActivityMinuteEntries(report);
    if (!staffStats.has(name)) {
      staffStats.set(name, { name, count: 0, minutes: 0, activities: new Map() });
    }
    const staff = staffStats.get(name);
    staff.count += 1;
    staff.minutes += report.minutes;

    activityEntries.forEach(({ activityId, minutes }) => {
      const label = activityId === "__none__" ? "未分類" : activityLabel(report, activityId);
      if (!activityStats.has(activityId)) {
        activityStats.set(activityId, { id: activityId, label, count: 0, minutes: 0 });
      }
      const activity = activityStats.get(activityId);
      activity.count += 1;
      activity.minutes += minutes;

      if (!staff.activities.has(activityId)) {
        staff.activities.set(activityId, { id: activityId, label, count: 0, minutes: 0 });
      }
      const staffActivity = staff.activities.get(activityId);
      staffActivity.count += 1;
      staffActivity.minutes += minutes;
    });
  });

  return {
    activities: Array.from(activityStats.values()).sort((a, b) => b.minutes - a.minutes),
    staff: Array.from(staffStats.values())
      .map(item => ({
        ...item,
        activities: Array.from(item.activities.values()).sort((a, b) => b.minutes - a.minutes)
      }))
      .sort((a, b) => b.minutes - a.minutes)
  };
}

function renderAdminSummary() {
  if (!$("#total-count")) return;
  const range = periodRange();
  const reports = periodReports();
  const summary = buildSummary(reports);
  const totalMinutes = reports.reduce((sum, report) => sum + report.minutes, 0);
  $("#period-label").textContent = `${formatDate(range.start)} - ${formatDate(range.end)}`;
  $("#total-count").textContent = `${reports.length}件`;
  $("#total-time").textContent = minutesText(totalMinutes);
  $("#staff-count").textContent = `${new Set(reports.map(report => report.name)).size}名`;
  $("#top-activity").textContent = summary.activities[0]?.label || "-";
  $("#overall-chart").innerHTML = barChartHtml(summary.activities);
  $("#activity-summary").innerHTML = activitySummaryTable(summary.activities);
  $("#staff-summary").innerHTML = staffSummaryTable(summary.staff);
  renderStaffSelect(summary.staff);
}

function renderStaffSelect(staffItems) {
  const select = $("#staff-select");
  if (!select) return;
  const previous = select.value;
  select.innerHTML = staffItems.length
    ? staffItems.map(item => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join("")
    : '<option value="">対象なし</option>';
  select.value = staffItems.some(item => item.name === previous) ? previous : staffItems[0]?.name || "";
  renderSelectedStaffChart();
}

function renderSelectedStaffChart() {
  const reports = periodReports();
  const summary = buildSummary(reports);
  const selected = $("#staff-select")?.value || "";
  const staff = summary.staff.find(item => item.name === selected);
  $("#staff-chart").innerHTML = staff ? barChartHtml(staff.activities) : '<div class="empty-state">対象データがありません。</div>';
}

function barChartHtml(items) {
  if (!items.length) return '<div class="empty-state">対象データがありません。</div>';
  const max = Math.max(...items.map(item => item.minutes), 1);
  return items.map(item => {
    const width = Math.max(7, Math.round((item.minutes / max) * 100));
    return `
      <div class="bar-row">
        <div class="bar-meta">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(minutesText(item.minutes))} / ${item.count}件</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
      </div>
    `;
  }).join("");
}

function activitySummaryTable(items) {
  if (!items.length) return '<div class="empty-state">対象データがありません。</div>';
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>活動</th><th>件数</th><th>按分時間</th></tr></thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td><strong>${escapeHtml(item.label)}</strong></td>
              <td>${item.count}件</td>
              <td>${escapeHtml(minutesText(item.minutes))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function staffSummaryTable(items) {
  if (!items.length) return '<div class="empty-state">対象データがありません。</div>';
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>氏名</th><th>件数</th><th>合計時間</th><th>主な活動</th></tr></thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td><strong>${escapeHtml(item.name)}</strong></td>
              <td>${item.count}件</td>
              <td>${escapeHtml(minutesText(item.minutes))}</td>
              <td>${escapeHtml(item.activities.slice(0, 3).map(activity => activity.label).join("、") || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function reportDateCheck(report) {
  const selectedDate = report.dateCheck?.selectedDate || report.date || "";
  const submittedDate = report.dateCheck?.submittedDate || report.submittedDate || dateKeyFromTimestamp(report.submittedAt || report.createdAt) || "";
  return {
    selectedDate,
    submittedDate,
    correct: !!selectedDate && !!submittedDate && selectedDate === submittedDate
  };
}

function percentText(numerator, denominator) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function buildDateCheckStats(reports) {
  const userStats = new Map();
  let mistakes = 0;
  reports.forEach(report => {
    const check = reportDateCheck(report);
    const name = report.name || "(無名)";
    if (!userStats.has(name)) userStats.set(name, { name, total: 0, correct: 0, mistakes: 0 });
    const user = userStats.get(name);
    user.total += 1;
    if (check.correct) {
      user.correct += 1;
    } else {
      user.mistakes += 1;
      mistakes += 1;
    }
  });
  return {
    total: reports.length,
    correct: reports.length - mistakes,
    mistakes,
    users: Array.from(userStats.values()).sort((a, b) => (b.mistakes / Math.max(b.total, 1)) - (a.mistakes / Math.max(a.total, 1)) || b.mistakes - a.mistakes || a.name.localeCompare(b.name, "ja"))
  };
}

function renderDateCheckView() {
  if (!$("#date-check-total")) return;
  const reports = loadReports().sort((a, b) => `${b.submittedDate || ""}${b.submittedAt || b.createdAt}`.localeCompare(`${a.submittedDate || ""}${a.submittedAt || a.createdAt}`));
  const stats = buildDateCheckStats(reports);
  $("#date-check-total").textContent = `${stats.total}件`;
  $("#date-check-correct").textContent = `${stats.correct}件`;
  $("#date-check-mistakes").textContent = `${stats.mistakes}件`;
  $("#date-check-rate").textContent = percentText(stats.mistakes, stats.total);
  renderUserDateErrorTable(stats.users);
  renderDateCheckTable(reports);
}

function renderUserDateErrorTable(items) {
  const container = $("#user-date-error-table");
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">対象データがありません。</div>';
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>利用者</th><th>報告件数</th><th>一致</th><th>要確認</th><th>要確認率</th></tr></thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td><strong>${escapeHtml(item.name)}</strong></td>
              <td>${item.total}件</td>
              <td>${item.correct}件</td>
              <td>${item.mistakes}件</td>
              <td>${percentText(item.mistakes, item.total)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function dateStatusPill(correct) {
  return correct
    ? '<span class="status-pill ok">一致</span>'
    : '<span class="status-pill error">要確認</span>';
}

function renderDateCheckTable(reports) {
  const container = $("#date-check-table");
  if (!container) return;
  if (!reports.length) {
    container.innerHTML = '<div class="empty-state">対象データがありません。</div>';
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table class="date-check-table">
        <thead><tr><th>送信日時</th><th>氏名</th><th>投稿日</th><th>送信日</th><th>確認結果</th><th>活動</th></tr></thead>
        <tbody>
          ${reports.map(report => {
            const check = reportDateCheck(report);
            return `
              <tr>
                <td>${escapeHtml(formatDateTime(report.submittedAt || report.createdAt))}</td>
                <td><strong>${escapeHtml(report.name)}</strong></td>
                <td>${escapeHtml(formatDate(check.selectedDate))}</td>
                <td>${escapeHtml(formatDate(check.submittedDate))}</td>
                <td>${dateStatusPill(check.correct)}</td>
                <td>${escapeHtml(reportActivitySummaryText(report))}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}
function reportSearchText(report) {
  return [
    report.date,
    formatDate(report.date),
    report.name,
    reportActivityLabels(report).join(" "),
    reportActivitySummaryText(report),
    report.minutes,
    minutesText(report.minutes),
    report.progress,
    report.createdAt,
    report.updatedAt
  ].join(" ").toLowerCase();
}

function filteredReportRows() {
  const query = ($("#report-search")?.value || "").trim().toLowerCase();
  const start = $("#report-filter-start")?.value || "";
  const end = $("#report-filter-end")?.value || "";
  return loadReports()
    .filter(report => !start || report.date >= start)
    .filter(report => !end || report.date <= end)
    .filter(report => !query || reportSearchText(report).includes(query))
    .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
}

function clearReportFilters() {
  if ($("#report-search")) $("#report-search").value = "";
  if ($("#report-filter-start")) $("#report-filter-start").value = "";
  if ($("#report-filter-end")) $("#report-filter-end").value = "";
  renderReportTable();
}

function renderReportTable() {
  const container = $("#report-table");
  if (!container) return;
  const reports = filteredReportRows();
  if (!reports.length) {
    container.innerHTML = '<div class="empty-state">報告はまだありません。</div>';
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table class="report-table">
        <thead>
          <tr><th>投稿日</th><th>送信日</th><th>氏名</th><th>活動</th><th>時間</th><th>進捗</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${reports.map(report => `
            <tr>
              <td>${escapeHtml(formatDate(report.date))}</td>
              <td>${escapeHtml(formatDate(report.submittedDate))}</td>
              <td><strong>${escapeHtml(report.name)}</strong></td>
              <td>${escapeHtml(reportActivitySummaryText(report))}</td>
              <td>${escapeHtml(minutesText(report.minutes))}</td>
              <td>${escapeHtml(report.progress)}</td>
              <td>
                <div class="inline-actions">
                  <button type="button" class="secondary-button small" data-edit-report="${escapeHtml(report.id)}">編集</button>
                  <button type="button" class="danger-button small" data-delete-report="${escapeHtml(report.id)}">削除</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function editActivityMinuteMap(report) {
  if (!report || Array.isArray(report)) return {};
  const result = {};
  reportActivityMinuteEntries(report).forEach(entry => {
    if (entry.activityId !== "__none__" && entry.minutes) result[entry.activityId] = entry.minutes;
  });
  return result;
}

function renderEditActivities(reportOrSelected = []) {
  const container = $("#edit-activity-list");
  if (!container) return;
  const selectedIds = Array.isArray(reportOrSelected) ? reportOrSelected : reportOrSelected.activityIds || [];
  const selected = new Set(selectedIds);
  const minuteMap = editActivityMinuteMap(reportOrSelected);
  const activities = loadActivities();
  container.innerHTML = activities.map((activity, index) => {
    const inputId = `edit-activity-${index}-${activity.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `
      <div class="activity-card activity-card-with-time" data-edit-activity-card="${escapeHtml(activity.id)}">
        <label class="activity-check-line" for="${escapeHtml(inputId)}">
          <input id="${escapeHtml(inputId)}" type="checkbox" name="edit-activity" value="${escapeHtml(activity.id)}" ${selected.has(activity.id) ? "checked" : ""}>
          <span>${escapeHtml(activity.label)}</span>
        </label>
        ${activity.hint ? `<small>${escapeHtml(activity.hint)}</small>` : ""}
        <label class="activity-time-field">
          作業時間
          <select name="edit-activity-minutes" data-edit-activity-minutes="${escapeHtml(activity.id)}" ${selected.has(activity.id) ? "" : "disabled"}>${timeOptionsHtml(minuteMap[activity.id] || "")}</select>
        </label>
      </div>
    `;
  }).join("") || '<div class="empty-state">生産活動項目がありません。</div>';
  $$('[name="edit-activity"]').forEach(input => input.addEventListener("change", handleEditActivitySelectionChange));
  $$('[name="edit-activity-minutes"]').forEach(select => select.addEventListener("change", updateEditTotalMinutes));
  handleEditActivitySelectionChange();
}

function findEditActivityMinutesSelect(activityId) {
  return $$('[name="edit-activity-minutes"]').find(select => select.dataset.editActivityMinutes === activityId) || null;
}

function handleEditActivitySelectionChange() {
  $$('[name="edit-activity"]').forEach(input => {
    const select = findEditActivityMinutesSelect(input.value);
    const card = input.closest(".activity-card-with-time");
    if (select) {
      select.disabled = !input.checked;
      if (!input.checked) select.value = "";
    }
    if (card) card.classList.toggle("selected", input.checked);
  });
  updateEditTotalMinutes();
}

function updateEditTotalMinutes() {
  const total = $$('[name="edit-activity"]:checked').reduce((sum, input) => {
    const select = findEditActivityMinutesSelect(input.value);
    return sum + Number(select?.value || 0);
  }, 0);
  const hidden = $("#edit-report-minutes");
  const display = $("#edit-report-minutes-display");
  if (hidden) hidden.value = String(total);
  if (display) display.value = minutesText(total);
}

function collectEditActivityMinutes(activityIds) {
  const activityMinutes = {};
  activityIds.forEach(activityId => {
    const minutes = Number(findEditActivityMinutesSelect(activityId)?.value || 0);
    if (minutes) activityMinutes[activityId] = minutes;
  });
  return activityMinutes;
}

function startReportEdit(id) {
  const report = loadReports().find(item => item.id === id);
  if (!report) return;
  $("#report-edit-panel")?.classList.remove("hidden");
  $("#edit-report-id").value = report.id;
  $("#edit-report-date").value = report.date;
  $("#edit-report-name").value = report.name;
  $("#edit-report-minutes").value = String(report.minutes || 0);
  if ($("#edit-report-minutes-display")) $("#edit-report-minutes-display").value = minutesText(report.minutes);
  $("#edit-report-progress").value = report.progress;
  renderEditActivities(report);
  setMessage("#edit-report-message", "", "ok");
  $("#report-edit-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelReportEdit() {
  $("#report-edit-form")?.reset();
  if ($("#edit-report-id")) $("#edit-report-id").value = "";
  $("#report-edit-panel")?.classList.add("hidden");
  renderEditActivities([]);
  updateEditTotalMinutes();
  setMessage("#edit-report-message", "", "ok");
}

function collectEditReport() {
  const activityIds = $$('[name="edit-activity"]:checked').map(input => input.value);
  const activityMap = new Map(loadActivities().map(activity => [activity.id, activity]));
  const activityLabels = {};
  activityIds.forEach(activityId => {
    activityLabels[activityId] = activityMap.get(activityId)?.label || "";
  });
  const activityMinutes = collectEditActivityMinutes(activityIds);
  return normalizeReport({
    id: $("#edit-report-id")?.value || "",
    date: $("#edit-report-date")?.value || "",
    name: $("#edit-report-name")?.value.trim() || "",
    activityIds,
    activityLabels,
    activityMinutes,
    minutes: Number($("#edit-report-minutes")?.value || 0),
    progress: $("#edit-report-progress")?.value.trim() || ""
  });
}

async function saveReportEdit(event) {
  event.preventDefault();
  const id = $("#edit-report-id")?.value || "";
  const report = collectEditReport();
  const error = validateReport(report, { requireActivityMinutes: true });
  if (error) {
    setMessage("#edit-report-message", error, "error");
    return;
  }
  try {
    if (!await updateReport(id, report)) {
      setMessage("#edit-report-message", "編集対象の報告が見つかりません。", "error");
      return;
    }
    cancelReportEdit();
    renderAdminAll();
  } catch (error) {
    setMessage("#edit-report-message", "保存できませんでした: " + error.message, "error");
  }
}

function renderHistory() {
  const container = $("#history-list");
  if (!container) return;
  const history = loadHistory().slice(0, 100);
  container.innerHTML = history.map(item => `
    <div class="history-item">
      <strong>${escapeHtml(item.action)} / ${escapeHtml(item.target)}</strong>
      <span>${escapeHtml(item.label || "-")}</span>
      <span class="history-meta">${escapeHtml(item.at ? `${formatDate(item.at.slice(0, 10))} ${item.at.slice(11, 16)}` : "-")}</span>
      ${historyActionButtons(item)}
    </div>
  `).join("") || '<div class="empty-state">操作履歴はまだありません。</div>';
}

function historyActionButtons(item) {
  const detailButton = `<button type="button" class="secondary-button small" data-history-detail="${escapeHtml(item.id)}">詳細</button>`;
  return `<div class="history-actions">${detailButton}${historyRestoreButton(item)}</div>`;
}

function historyRestoreButton(item) {
  const canRestoreSingleReport = item.target === "報告" && item.before?.id;
  const canRestoreReportSet = item.target === "報告" && Array.isArray(item.before?.reports);
  if (!canRestoreSingleReport && !canRestoreReportSet) return "";
  const label = canRestoreReportSet
      ? "この履歴から報告を復元"
      : item.action === "削除"
        ? "削除前に復元"
        : "編集前に戻す";
  return `<button type="button" class="secondary-button small" data-restore-history="${escapeHtml(item.id)}">${escapeHtml(label)}</button>`;
}

function showHistoryDetail(historyId) {
  const item = loadHistory().find(entry => entry.id === historyId);
  if (!item) {
    alert("履歴データが見つかりません。");
    return;
  }
  alert(historyDetailText(item));
}

function historyDetailText(item) {
  const lines = [
    `操作: ${item.action || "-" } / ${item.target || "-"}`,
    `対象: ${item.label || "-"}`,
    `日時: ${item.at ? formatDateTime(item.at) : "-"}`,
    "",
    "変更内容:"
  ];
  const changes = historyChangeLines(item);
  lines.push(...(changes.length ? changes : ["詳細な差分はありません。"]));
  if (item.target === "報告" && item.before?.id) {
    lines.push("", "「編集前に戻す」を押すと、変更前の内容へ復元します。");
  }
  return lines.join("\n");
}

function historyChangeLines(item) {
  if (item.target === "報告") return historyReportChangeLines(item);
  if (item.target === "生産活動項目") return historyActivityChangeLines(item);
  return historyFallbackChangeLines(item);
}

function historyReportChangeLines(item) {
  if (Array.isArray(item.before?.reports)) {
    const beforeCount = item.before.reports.length;
    const afterCount = Array.isArray(item.after?.reports) ? item.after.reports.length : Number(item.after?.reports || 0);
    return [`報告件数: ${beforeCount}件 → ${Number.isFinite(afterCount) ? afterCount : 0}件`];
  }
  if (item.before?.id && item.after?.id) {
    const before = normalizeReport(item.before);
    const after = normalizeReport(item.after);
    return [
      historyFieldChangeLine("投稿日", formatDate(before.date), formatDate(after.date)),
      historyFieldChangeLine("送信日", formatDate(before.submittedDate), formatDate(after.submittedDate)),
      historyFieldChangeLine("氏名", before.name, after.name),
      historyFieldChangeLine("生産活動内容", historyReportActivitiesText(before), historyReportActivitiesText(after)),
      historyFieldChangeLine("所要時間合計", minutesText(before.minutes), minutesText(after.minutes)),
      historyFieldChangeLine("進捗状況", before.progress || "-", after.progress || "-"),
      historyFieldChangeLine("日付確認", historyDateCheckText(before), historyDateCheckText(after))
    ].filter(Boolean);
  }
  if (item.after?.id) {
    return ["登録された内容:", ...historyReportSnapshotLines(normalizeReport(item.after))];
  }
  if (item.before?.id) {
    return ["削除された内容:", ...historyReportSnapshotLines(normalizeReport(item.before))];
  }
  return historyFallbackChangeLines(item);
}

function historyReportSnapshotLines(report) {
  return [
    `投稿日: ${formatDate(report.date)}`,
    `送信日: ${formatDate(report.submittedDate)}`,
    `氏名: ${report.name || "-"}`,
    `生産活動内容: ${historyReportActivitiesText(report)}`,
    `所要時間合計: ${minutesText(report.minutes)}`,
    `進捗状況: ${report.progress || "-"}`,
    `日付確認: ${historyDateCheckText(report)}`
  ];
}

function historyReportActivitiesText(report) {
  return reportActivityMinuteEntries(report)
    .filter(entry => entry.activityId !== "__none__")
    .map(entry => `${historyReportActivityLabel(report, entry.activityId)}（${minutesText(entry.minutes)}）`)
    .join("、") || "-";
}

function historyReportActivityLabel(report, activityId) {
  return report.activityLabels?.[activityId] || activityLabel(report, activityId);
}

function historyDateCheckText(report) {
  const check = report.dateCheck || {};
  if (!check.selectedDate && !check.submittedDate) return "-";
  const result = check.correct ? "一致" : "要確認";
  return `${result}（投稿日 ${formatDate(check.selectedDate)} / 送信日 ${formatDate(check.submittedDate)}）`;
}

function historyActivityChangeLines(item) {
  const before = historyActivitiesFromPayload(item.before);
  const after = historyActivitiesFromPayload(item.after);
  if (!before && !after) return historyFallbackChangeLines(item);
  if (!before) return after.map(activity => `追加: ${activity.label}`);
  if (!after) return before.map(activity => `削除: ${activity.label}`);

  const beforeMap = new Map(before.map(activity => [activity.id, activity]));
  const afterMap = new Map(after.map(activity => [activity.id, activity]));
  const lines = [];
  after.forEach(activity => {
    const previous = beforeMap.get(activity.id);
    if (!previous) {
      lines.push(`追加: ${activity.label}`);
      return;
    }
    const changes = [
      historyFieldChangeLine("項目名", previous.label, activity.label),
      historyFieldChangeLine("進捗の目安", previous.hint || "-", activity.hint || "-"),
      historyFieldChangeLine("表示", previous.active ? "表示" : "非表示", activity.active ? "表示" : "非表示")
    ].filter(Boolean);
    if (changes.length) lines.push(`変更: ${previous.label}`, ...changes.map(line => `  ${line}`));
  });
  before.forEach(activity => {
    if (!afterMap.has(activity.id)) lines.push(`削除: ${activity.label}`);
  });
  if (!lines.length && before.map(activity => activity.id).join(",") !== after.map(activity => activity.id).join(",")) {
    lines.push("並び順が変更されました。");
  }
  return lines;
}

function historyActivitiesFromPayload(value) {
  const activities = Array.isArray(value?.activities) ? value.activities : Array.isArray(value) ? value : null;
  return activities ? activities.map(normalizeActivity).filter(activity => activity.label) : null;
}

function historyFieldChangeLine(label, before, after) {
  const beforeText = String(before ?? "-");
  const afterText = String(after ?? "-");
  return beforeText === afterText ? "" : `${label}: ${beforeText} → ${afterText}`;
}

function historyFallbackChangeLines(item) {
  return [
    `変更前: ${historySimpleSummary(item.before)}`,
    `変更後: ${historySimpleSummary(item.after)}`
  ];
}

function historySimpleSummary(value) {
  if (!value) return "なし";
  if (value.label) return String(value.label);
  if (value.name || value.date) return reportLabel(value);
  if (Array.isArray(value.reports)) return `${value.reports.length}件`;
  if (Array.isArray(value.activities)) return `${value.activities.length}項目`;
  return "保存データあり";
}

async function restoreHistoryEntry(historyId) {
  if (cloudEnabled()) {
    try {
      await cloudAdminAction("restoreHistoryEntry", { historyId });
      cancelReportEdit();
      renderAdminAll();
    } catch (error) {
      alert("復元できませんでした: " + error.message);
    }
    return;
  }
  const entry = loadHistory().find(item => item.id === historyId);
  if (!entry) return;

  if (entry.target === "報告" && entry.before?.id) {
    if (!confirm("この履歴の内容で報告データを復元します。よろしいですか？")) return;
    const reports = loadReports();
    const index = reports.findIndex(report => report.id === entry.before.id);
    const current = index >= 0 ? reports[index] : null;
    const restored = normalizeReport(entry.before);
    if (index >= 0) {
      reports[index] = restored;
    } else {
      reports.push(restored);
    }
    saveReports(reports);
    addHistory("履歴復元", "報告", current, restored);
    cancelReportEdit();
    renderAdminAll();
    return;
  }

  if (entry.target === "報告" && Array.isArray(entry.before?.reports)) {
    if (!confirm("この履歴に残っている報告データ一式を復元します。現在の報告データは置き換わります。よろしいですか？")) return;
    const current = { label: "履歴復元前", reports: loadReports() };
    saveReports(entry.before.reports.map(normalizeReport));
    addHistory("履歴復元", "報告", current, {
      label: `${entry.label || "履歴"}から復元`,
      reports: loadReports().length
    });
    cancelReportEdit();
    renderAdminAll();
    return;
  }

  alert("この履歴から復元できるデータがありません。");
}

async function deleteAllReports() {
  if (!confirm("すべての報告を削除します。よろしいですか？")) return;
  try {
    if (cloudEnabled()) {
      await cloudAdminAction("deleteAllReports");
    } else {
      const before = loadReports();
      saveReports([]);
      addHistory("全削除", "報告", { label: before.length + "件", reports: before }, null);
    }
    cancelReportEdit();
    renderAdminAll();
  } catch (error) {
    alert("全削除できませんでした: " + error.message);
  }
}

function activityEditorRow(activity = {}) {
  const id = activity.id || uid("activity");
  return `
    <div class="activity-editor-row" data-activity-id="${escapeHtml(id)}">
      <label>項目名<input type="text" class="activity-label" value="${escapeHtml(activity.label || "")}"></label>
      <label>進捗の目安<input type="text" class="activity-hint" value="${escapeHtml(activity.hint || "")}"></label>
      <label class="check-line"><input type="checkbox" class="activity-active" ${activity.active !== false ? "checked" : ""}> 表示</label>
      <button type="button" class="danger-button small" data-remove-activity>削除</button>
    </div>
  `;
}

function renderActivityEditor() {
  const container = $("#activity-editor");
  if (!container) return;
  container.innerHTML = loadActivities().map(activityEditorRow).join("");
}

function addActivityEditorRow() {
  $("#activity-editor")?.insertAdjacentHTML("beforeend", activityEditorRow({ active: true }));
}

function removeActivityEditorRow(button) {
  const row = button.closest(".activity-editor-row");
  if (!row) return;
  const label = row.querySelector(".activity-label")?.value.trim() || "この作業項目";
  if (!confirm(`「${label}」を削除候補にします。\n\nこの時点ではまだ削除は確定しません。\n削除を確定するには、この後「項目を保存」を押してください。\n\n続けますか？`)) return;
  row.remove();
}

function collectActivityEditor() {
  return $$("#activity-editor .activity-editor-row")
    .map((row, index) => ({
      id: row.dataset.activityId || uid("activity"),
      label: row.querySelector(".activity-label")?.value.trim() || "",
      hint: row.querySelector(".activity-hint")?.value.trim() || "",
      active: !!row.querySelector(".activity-active")?.checked,
      order: index
    }))
    .filter(activity => activity.label);
}

async function saveActivityEditor() {
  const activities = collectActivityEditor();
  if (!activities.length) {
    alert("項目を1つ以上入力してください。");
    return;
  }
  if (!confirm(activitySaveConfirmMessage(activities))) return;
  try {
    if (cloudEnabled()) {
      await cloudAdminAction("saveActivities", { activities });
    } else {
      const before = loadActivities();
      saveActivities(activities);
      addHistory("編集", "生産活動項目", { label: "変更前", activities: before }, { label: "変更後", activities: loadActivities() });
    }
    hideActivitySaveConfirm();
    renderActivityEditor();
    renderAdminSummary();
    renderHistory();
    alert("項目を保存しました。");
  } catch (error) {
    alert("項目を保存できませんでした: " + error.message);
  }
}

function activitySaveConfirmMessage(nextActivities) {
  const nextIds = new Set(nextActivities.map(activity => activity.id));
  const deletedActivities = loadActivities().filter(activity => !nextIds.has(activity.id));
  if (!deletedActivities.length) return "作業項目を保存します。よろしいですか？";
  const deletedList = deletedActivities.map(activity => `・${activity.label}`).join("\n");
  return `次の作業項目を削除して保存します。\n\n${deletedList}\n\n「OK」を押すと削除が確定します。よろしいですか？`;
}

async function resetActivities() {
  if (!confirm("生産活動項目を初期状態に戻します。よろしいですか？")) return;
  try {
    if (cloudEnabled()) {
      await cloudAdminAction("saveActivities", { activities: defaultActivities(), actionLabel: "初期化" });
    } else {
      const before = loadActivities();
      saveActivities(defaultActivities());
      addHistory("初期化", "生産活動項目", { label: "初期化前", activities: before }, { label: "初期項目", activities: loadActivities() });
    }
    renderActivityEditor();
    renderAdminSummary();
    renderHistory();
  } catch (error) {
    alert("初期化できませんでした: " + error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "form") initFormPage();
  if (page === "admin") initAdminPage();
});
