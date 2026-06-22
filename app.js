const REPORTS_KEY = "production_activity_reports_v2";
const ACTIVITIES_KEY = "production_activity_items_v2";
const ADMIN_PIN_KEY = "production_activity_admin_pin_v1";
const ADMIN_SESSION_KEY = "production_activity_admin_unlocked";
const DEFAULT_ADMIN_PIN = "";
const LEGACY_DEFAULT_ADMIN_PIN = "0000";

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

function minutesText(minutes) {
  const total = Math.round(Number(minutes) || 0);
  if (total < 60) return `${total}分`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}

function parseJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
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
  return {
    id: report?.id || uid("report"),
    date: report?.date || todayKey(),
    name: String(report?.name || "").trim(),
    activityIds,
    activityLabels,
    minutes: Math.max(0, Number(report?.minutes || 0)),
    progress: String(report?.progress || "").trim(),
    createdAt: report?.createdAt || new Date().toISOString(),
    updatedAt: report?.updatedAt || new Date().toISOString()
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

function addReport(report) {
  const reports = loadReports();
  reports.push(normalizeReport(report));
  saveReports(reports);
}

function deleteReport(id) {
  saveReports(loadReports().filter(report => report.id !== id));
}

function activityLabel(report, activityId) {
  const current = loadActivities().find(activity => activity.id === activityId);
  return current?.label || report.activityLabels?.[activityId] || "削除済み項目";
}

function reportActivityLabels(report) {
  return report.activityIds.map(activityId => activityLabel(report, activityId));
}

function setMessage(selector, text, type = "ok") {
  const target = $(selector);
  if (!target) return;
  target.textContent = text;
  target.className = `form-message ${type}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob(["\uFEFF" + text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function currentAdminPin() {
  const savedPin = localStorage.getItem(ADMIN_PIN_KEY);
  if (savedPin === null || savedPin === LEGACY_DEFAULT_ADMIN_PIN) return DEFAULT_ADMIN_PIN;
  return savedPin;
}

function initFormPage() {
  const dateInput = $("#report-date");
  const minutesSelect = $("#report-minutes");
  if (dateInput) dateInput.value = todayKey();
  if (minutesSelect) {
    minutesSelect.innerHTML = '<option value="">選択してください</option>' +
      TIME_OPTIONS.map(([label, minutes]) => `<option value="${minutes}">${escapeHtml(label)}</option>`).join("");
  }
  renderFormActivities();

  $("#clear-form")?.addEventListener("click", clearForm);
  $("#report-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const report = collectFormReport();
    const error = validateReport(report);
    if (error) {
      setMessage("#form-message", error, "error");
      return;
    }
    addReport(report);
    clearForm();
    setMessage("#form-message", "送信しました。今日もお疲れさまでした。", "ok");
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
  container.innerHTML = activities.map(activity => `
    <label class="activity-card">
      <input type="checkbox" name="activity" value="${escapeHtml(activity.id)}" ${selected.has(activity.id) ? "checked" : ""}>
      <span>${escapeHtml(activity.label)}</span>
      ${activity.hint ? `<small>${escapeHtml(activity.hint)}</small>` : ""}
    </label>
  `).join("");
  $$('[name="activity"]').forEach(input => input.addEventListener("change", updateProgressPlaceholder));
  updateProgressPlaceholder();
}

function updateProgressPlaceholder() {
  const textarea = $("#report-progress");
  if (!textarea) return;
  const selectedIds = new Set($$('[name="activity"]:checked').map(input => input.value));
  const selected = activeActivities().filter(activity => selectedIds.has(activity.id));
  const hints = selected.length ? selected : activeActivities();
  textarea.placeholder = hints.map((activity, index) => `${index + 1}. ${activity.label}: ${activity.hint || "納品数・進行度合い"}`).join("\n");
}

function collectFormReport() {
  const activityIds = $$('[name="activity"]:checked').map(input => input.value);
  const activityMap = new Map(loadActivities().map(activity => [activity.id, activity]));
  const activityLabels = {};
  activityIds.forEach(activityId => {
    activityLabels[activityId] = activityMap.get(activityId)?.label || "";
  });
  return normalizeReport({
    date: $("#report-date")?.value || "",
    name: $("#report-name")?.value.trim() || "",
    activityIds,
    activityLabels,
    minutes: Number($("#report-minutes")?.value || 0),
    progress: $("#report-progress")?.value.trim() || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function validateReport(report) {
  if (!report.date) return "日付を入力してください。";
  if (!report.name) return "氏名を入力してください。";
  if (!report.activityIds.length) return "生産活動内容を1つ以上選択してください。";
  if (!report.minutes) return "所要時間を選択してください。";
  if (!report.progress) return "進捗状況を入力してください。";
  return "";
}

function clearForm() {
  $("#report-form")?.reset();
  if ($("#report-date")) $("#report-date").value = todayKey();
  renderFormActivities([]);
}

function initAdminPage() {
  if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
    unlockAdmin();
  }

  $("#admin-login-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const pin = $("#admin-pin")?.value || "";
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
  $("#export-csv")?.addEventListener("click", exportReportsCsv);
  $("#delete-all-reports")?.addEventListener("click", deleteAllReports);
  $("#report-table")?.addEventListener("click", event => {
    const button = event.target.closest("[data-delete-report]");
    if (!button) return;
    if (!confirm("この報告を削除します。よろしいですか？")) return;
    deleteReport(button.dataset.deleteReport);
    renderAdminAll();
  });
  $("#add-activity")?.addEventListener("click", addActivityEditorRow);
  $("#save-activities")?.addEventListener("click", saveActivityEditor);
  $("#reset-activities")?.addEventListener("click", resetActivities);
  $("#activity-editor")?.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-activity]");
    if (button) button.closest(".activity-editor-row")?.remove();
  });
  $("#pin-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const pin = $("#new-pin")?.value.trim() || "";
    if (pin.length < 4) {
      setMessage("#pin-message", "パスワードは4文字以上で入力してください。", "error");
      return;
    }
    localStorage.setItem(ADMIN_PIN_KEY, pin);
    $("#new-pin").value = "";
    setMessage("#pin-message", "パスワードを変更しました。", "ok");
  });
}

function unlockAdmin() {
  $("#admin-lock")?.classList.add("hidden");
  $("#admin-console")?.classList.remove("hidden");
  renderAdminAll();
}

function showAdminView(name) {
  $$("[data-admin-view]").forEach(button => button.classList.toggle("active", button.dataset.adminView === name));
  $$("[data-admin-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.adminPanel === name));
  if (name === "summary") renderAdminSummary();
  if (name === "reports") renderReportTable();
  if (name === "settings") renderActivityEditor();
}

function renderAdminAll() {
  renderAdminSummary();
  renderReportTable();
  renderActivityEditor();
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
    const activityIds = report.activityIds.length ? report.activityIds : ["__none__"];
    const minutesShare = report.minutes / activityIds.length;
    if (!staffStats.has(name)) {
      staffStats.set(name, { name, count: 0, minutes: 0, activities: new Map() });
    }
    const staff = staffStats.get(name);
    staff.count += 1;
    staff.minutes += report.minutes;

    activityIds.forEach(activityId => {
      const label = activityId === "__none__" ? "未分類" : activityLabel(report, activityId);
      if (!activityStats.has(activityId)) {
        activityStats.set(activityId, { id: activityId, label, count: 0, minutes: 0 });
      }
      const activity = activityStats.get(activityId);
      activity.count += 1;
      activity.minutes += minutesShare;

      if (!staff.activities.has(activityId)) {
        staff.activities.set(activityId, { id: activityId, label, count: 0, minutes: 0 });
      }
      const staffActivity = staff.activities.get(activityId);
      staffActivity.count += 1;
      staffActivity.minutes += minutesShare;
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

function renderReportTable() {
  const container = $("#report-table");
  if (!container) return;
  const reports = loadReports().sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
  if (!reports.length) {
    container.innerHTML = '<div class="empty-state">報告はまだありません。</div>';
    return;
  }
  container.innerHTML = `
    <div class="table-wrap">
      <table class="report-table">
        <thead>
          <tr><th>日付</th><th>氏名</th><th>活動</th><th>時間</th><th>進捗</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${reports.map(report => `
            <tr>
              <td>${escapeHtml(formatDate(report.date))}</td>
              <td><strong>${escapeHtml(report.name)}</strong></td>
              <td>${escapeHtml(reportActivityLabels(report).join("、"))}</td>
              <td>${escapeHtml(minutesText(report.minutes))}</td>
              <td>${escapeHtml(report.progress)}</td>
              <td><button type="button" class="danger-button small" data-delete-report="${escapeHtml(report.id)}">削除</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function exportReportsCsv() {
  const headers = ["日付", "氏名", "生産活動内容", "所要時間(分)", "所要時間", "進捗状況"];
  const rows = loadReports()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(report => [
      report.date,
      report.name,
      reportActivityLabels(report).join(" / "),
      report.minutes,
      minutesText(report.minutes),
      report.progress
    ]);
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
  downloadText(`production_reports_${todayKey()}.csv`, csv, "text/csv;charset=utf-8");
}

function deleteAllReports() {
  if (!confirm("すべての報告を削除します。よろしいですか？")) return;
  saveReports([]);
  renderAdminAll();
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

function saveActivityEditor() {
  const activities = collectActivityEditor();
  if (!activities.length) {
    alert("項目を1つ以上入力してください。");
    return;
  }
  saveActivities(activities);
  renderActivityEditor();
  renderAdminSummary();
  alert("項目を保存しました。");
}

function resetActivities() {
  if (!confirm("生産活動項目を初期状態に戻します。よろしいですか？")) return;
  saveActivities(defaultActivities());
  renderActivityEditor();
  renderAdminSummary();
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "form") initFormPage();
  if (page === "admin") initAdminPage();
});
