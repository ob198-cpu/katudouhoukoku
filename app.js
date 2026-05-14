const STORAGE_KEY = "welfare_users_static_v2";
const LEGACY_STORAGE_KEYS = ["welfare_users_v1", "welfare_users_static_v1"];
const WARN_DAYS = 60;
const URGENT_DAYS = 30;

const MUNICIPALITY_OPTIONS = [
  { label: "札幌市（児）", ward: "児", code: "011008" },
  { label: "札幌市中央区", ward: "中央区", code: "011015" },
  { label: "札幌市北区", ward: "北区", code: "011023" },
  { label: "札幌市東区", ward: "東区", code: "011031" },
  { label: "札幌市白石区", ward: "白石区", code: "011049" },
  { label: "札幌市豊平区", ward: "豊平区", code: "011056" },
  { label: "札幌市南区", ward: "南区", code: "011064" },
  { label: "札幌市西区", ward: "西区", code: "011072" },
  { label: "札幌市厚別区", ward: "厚別区", code: "011080" },
  { label: "札幌市手稲区", ward: "手稲区", code: "011098" },
  { label: "札幌市清田区", ward: "清田区", code: "011106" }
];

const SERVICE_OPTIONS = {
  training1: ["就労移行支援", "就労継続支援B型", "就労継続支援A型", "自立訓練（生活訓練）"],
  training2: ["共同生活援助"],
  care1: ["居宅介護", "重度訪問介護", "同行援護", "行動援護", "療養介護", "生活介護", "短期入所・ショートステイ", "重度障害者等包括支援", "施設入所支援"],
  care2: ["居宅介護", "重度訪問介護", "同行援護", "行動援護", "療養介護", "生活介護", "短期入所・ショートステイ", "重度障害者等包括支援", "施設入所支援"]
};

const SERVICE_LABELS = {
  training1: "訓練等給付費情報1",
  training2: "訓練等給付費情報2（共同生活援助）",
  care1: "介護給付費情報1",
  care2: "介護給付費情報2"
};

const TASK_LABELS = {
  pdf: "受給者証の写し（PDF）の保管",
  apply: "受給者証の更新手続き（役所への申請）",
  updateInfo: "情報の更新（入力シートの有効期間等）"
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function loadAll() {
  const current = parseUserList(localStorage.getItem(STORAGE_KEY));
  if (current.length) {
    return normalizeAndPersist(current);
  }

  const recovered = recoverStoredUsers();
  if (recovered.length) {
    alert(`保存済みデータを${recovered.length}件復元しました。`);
    return normalizeAndPersist(recovered);
  }

  return [];
}

function saveAll(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function parseUserList(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isUserLikeData) : [];
  } catch {
    return [];
  }
}

function recoverStoredUsers() {
  const candidates = [...LEGACY_STORAGE_KEYS, ...Object.keys(localStorage)]
    .filter((key, index, all) => key !== STORAGE_KEY && all.indexOf(key) === index);

  let best = [];
  candidates.forEach(key => {
    const users = parseUserList(localStorage.getItem(key));
    if (users.length > best.length) best = users;
  });
  return best;
}

function normalizeAndPersist(users) {
  const normalized = users.map(user => normalizeUser(user));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function isUserLikeData(value) {
  return !!value && typeof value === "object" && (
    "name" in value ||
    "recipientNo" in value ||
    "recipientEnd" in value ||
    "planEnd" in value ||
    "checks" in value
  );
}

function uid() {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getUser(id) {
  return loadAll().find(user => user.id === id);
}

function upsertUser(user) {
  const users = loadAll();
  const index = users.findIndex(item => item.id === user.id);
  if (index >= 0) users[index] = user;
  else users.push(user);
  saveAll(users);
}

function deleteUser(id) {
  saveAll(loadAll().filter(user => user.id !== id));
}

function normalizeUser(user) {
  user.checks = user.checks || {};
  ["pdf", "apply", "updateInfo"].forEach(key => {
    const task = user.checks[key];
    if (task?.done && !task.completedForDate) {
      task.completedForDate = taskDueDate(user, key) || "";
    }
  });
  user.deadlineCompletions = user.deadlineCompletions || {};
  return user;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  if (!value) return "-";
  return value.replaceAll("-", "/");
}

function daysUntil(value) {
  const date = parseDate(value);
  if (!date) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function showView(name) {
  $$(".view").forEach(view => view.classList.remove("active"));
  $$(".tab-btn").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  $(`#view-${name}`).classList.add("active");
  if (name === "dashboard") renderDashboard();
  if (name === "personal") renderPersonalSheets();
  if (name === "backup") renderBackup();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupWardSelect() {
  const ward = $("#ward");
  ward.innerHTML = '<option value="">選択してください</option>' +
    MUNICIPALITY_OPTIONS.map(item => `<option value="${item.code}">${item.label}（${item.code}）</option>`).join("") +
    '<option value="__custom__">その他（手入力）</option>';

  ward.addEventListener("change", () => {
    const selected = MUNICIPALITY_OPTIONS.find(item => item.code === ward.value);
    const isCustom = ward.value === "__custom__";
    $("#custom-ward-wrap").classList.toggle("hidden", !isCustom);
    if (selected) {
      $("#custom-ward").value = "";
      $("#municipal-code").value = selected.code;
    }
    if (!ward.value) {
      $("#custom-ward").value = "";
      $("#municipal-code").value = "";
    }
  });
}

function addServiceRow(target, data = {}) {
  const node = $("#tpl-service-row").content.firstElementChild.cloneNode(true);
  const select = node.querySelector(".svc-type");
  select.innerHTML = '<option value="">サービス種別</option>' +
    SERVICE_OPTIONS[target].map(option => `<option>${escapeHtml(option)}</option>`).join("");
  select.value = data.type || "";
  node.querySelector(".svc-start").value = data.start || "";
  node.querySelector(".svc-end").value = data.end || "";
  node.querySelector(".svc-office").value = data.office || "";
  const level = node.querySelector(".svc-level");
  if (target === "training2") {
    level.classList.remove("hidden");
    level.value = data.level || "";
  }
  node.querySelector(".btn-remove").addEventListener("click", () => node.remove());
  $(`#${target}-rows`).appendChild(node);
}

function collectServiceRows(target) {
  return $$(`#${target}-rows .service-row`).map(row => ({
    type: row.querySelector(".svc-type").value,
    start: row.querySelector(".svc-start").value,
    end: row.querySelector(".svc-end").value,
    office: row.querySelector(".svc-office").value.trim(),
    level: target === "training2" ? row.querySelector(".svc-level").value : ""
  })).filter(row => row.type || row.start || row.end || row.office || row.level);
}

function clearForm() {
  $("#user-form").reset();
  $("#user-id").value = "";
  $("#input-title").textContent = "入力シート";
  $("#btn-delete").style.display = "none";
  $("#custom-ward-wrap").classList.add("hidden");
  ["training1", "training2", "care1", "care2"].forEach(key => {
    $(`#${key}-rows`).innerHTML = "";
  });
}

function fillForm(user) {
  clearForm();
  $("#user-id").value = user.id;
  $("#input-title").textContent = `入力シート編集: ${user.name || "(無名)"}`;
  $("#btn-delete").style.display = "";
  setValue("name", user.name);
  setValue("kana", user.kana);
  setValue("birthday", user.birthday);
  setValue("phone", user.phone);
  setValue("address", user.address);
  setValue("recipient-no", user.recipientNo);
  setValue("municipal-code", user.municipalCode);
  setValue("disability-type", user.disabilityType);
  setValue("recipient-start", user.recipientStart);
  setValue("recipient-end", user.recipientEnd);
  setValue("application-deadline", user.applicationDeadline);
  setValue("plan-start", user.planStart);
  setValue("plan-end", user.planEnd);
  setValue("monitoring-cycle", user.monitoringCycle);
  setValue("payment-cap", user.paymentCap);
  setValue("note", user.note);

  const matched = MUNICIPALITY_OPTIONS.find(item => item.label === user.wardName || item.code === user.municipalCode);
  if (matched) {
    $("#ward").value = matched.code;
    $("#custom-ward-wrap").classList.add("hidden");
  } else if (user.wardName) {
    $("#ward").value = "__custom__";
    $("#custom-ward-wrap").classList.remove("hidden");
    $("#custom-ward").value = user.wardName;
  }

  ["training1", "training2", "care1", "care2"].forEach(key => {
    (user[key] || []).forEach(row => addServiceRow(key, row));
  });

  const checks = user.checks || {};
  $("#chk-pdf").checked = !!checks.pdf?.done;
  setValue("pdf-requested", checks.pdf?.requested);
  setValue("pdf-next-check", checks.pdf?.nextCheck);
  setValue("pdf-completed", checks.pdf?.completed);
  setValue("pdf-note", checks.pdf?.note);
  $("#chk-apply").checked = !!checks.apply?.done;
  setValue("apply-due", checks.apply?.due);
  setValue("apply-completed", checks.apply?.completed);
  setValue("apply-note", checks.apply?.note);
  $("#chk-update-info").checked = !!checks.updateInfo?.done;
  setValue("update-due", checks.updateInfo?.due);
  setValue("update-completed", checks.updateInfo?.completed);
  setValue("update-note", checks.updateInfo?.note);
}

function setValue(id, value) {
  $(`#${id}`).value = value || "";
}

function collectForm() {
  const selectedWard = MUNICIPALITY_OPTIONS.find(item => item.code === $("#ward").value);
  const customWard = $("#ward").value === "__custom__" ? $("#custom-ward").value.trim() : "";
  const id = $("#user-id").value || uid();
  const existing = getUser(id) || {};
  const user = {
    id,
    name: $("#name").value.trim(),
    kana: $("#kana").value.trim(),
    birthday: $("#birthday").value,
    phone: $("#phone").value.trim(),
    address: $("#address").value.trim(),
    recipientNo: $("#recipient-no").value.trim(),
    wardName: selectedWard ? selectedWard.label : customWard,
    municipalCode: $("#municipal-code").value.trim(),
    disabilityType: $("#disability-type").value,
    recipientStart: $("#recipient-start").value,
    recipientEnd: $("#recipient-end").value,
    applicationDeadline: $("#application-deadline").value,
    planStart: $("#plan-start").value,
    planEnd: $("#plan-end").value,
    monitoringCycle: $("#monitoring-cycle").value,
    paymentCap: $("#payment-cap").value.trim(),
    training1: collectServiceRows("training1"),
    training2: collectServiceRows("training2"),
    care1: collectServiceRows("care1"),
    care2: collectServiceRows("care2"),
    checks: {
      pdf: {
        done: $("#chk-pdf").checked || !!$("#pdf-completed").value,
        requested: $("#pdf-requested").value,
        nextCheck: $("#pdf-next-check").value,
        completed: $("#pdf-completed").value,
        note: $("#pdf-note").value.trim(),
        completedForDate: existing.checks?.pdf?.completedForDate || ""
      },
      apply: {
        done: $("#chk-apply").checked || !!$("#apply-completed").value,
        due: $("#apply-due").value,
        completed: $("#apply-completed").value,
        note: $("#apply-note").value.trim(),
        completedForDate: existing.checks?.apply?.completedForDate || ""
      },
      updateInfo: {
        done: $("#chk-update-info").checked || !!$("#update-completed").value,
        due: $("#update-due").value,
        completed: $("#update-completed").value,
        note: $("#update-note").value.trim(),
        completedForDate: existing.checks?.updateInfo?.completedForDate || ""
      }
    },
    deadlineCompletions: existing.deadlineCompletions || {},
    note: $("#note").value.trim(),
    updatedAt: new Date().toISOString()
  };
  return normalizeUser(user);
}

function buildAlerts(users) {
  const recipient = [];
  const monitoring = [];
  const tasks = [];

  users.forEach(user => {
    deadlineCandidates(user).forEach(item => {
      if (isDeadlineCompleted(user, item)) return;
      const alert = deadlineAlert(user, item);
      if (alert) {
        recipient.push(alert);
        tasks.push(deadlineTaskAlert(alert));
      }
    });

    const checks = user.checks || {};
    if (shouldShowRenewalTask(user, "pdf")) {
      tasks.push(taskAlert(user, "pdf", taskDueDate(user, "pdf")));
    }
    if (shouldShowRenewalTask(user, "apply")) {
      tasks.push(taskAlert(user, "apply", taskDueDate(user, "apply")));
    }
    if (shouldShowRenewalTask(user, "updateInfo")) {
      tasks.push(taskAlert(user, "updateInfo", taskDueDate(user, "updateInfo")));
    }

    if (isMonitoringMonth(user)) {
      monitoring.push({
        user,
        level: "warn",
        title: "当月モニタリング",
        message: `${user.monitoringCycle}の対象月です。`,
        nextAction: "モニタリング確認"
      });
    }
  });

  return {
    recipient: recipient.sort((a, b) => a.days - b.days),
    monitoring: monitoring.sort((a, b) => (a.user.name || "").localeCompare(b.user.name || "", "ja")),
    tasks: tasks.sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999))
  };
}

function deadlineCandidates(user) {
  return [
    { key: "recipient", title: "受給者証", date: user.recipientEnd, start: user.recipientStart },
    { key: "application", title: "更新申請期限", date: user.applicationDeadline, start: user.recipientStart },
    { key: "plan", title: "計画相談", date: user.planEnd, start: user.planStart },
    ...["training1", "training2", "care1", "care2"].flatMap(key =>
      (user[key] || []).map((row, index) => ({
        key: `service:${key}:${index}:${row.type || ""}:${row.start || ""}:${row.end || ""}`,
        title: `サービス期限: ${row.type || SERVICE_LABELS[key]}`,
        date: row.end,
        start: row.start,
        office: row.office
      }))
    )
  ].filter(item => item.date);
}

function isDeadlineCompleted(user, item) {
  const done = user.deadlineCompletions?.[item.key];
  return !!done && done.date === item.date;
}

function deadlineAlert(user, item) {
  const days = daysUntil(item.date);
  if (days === null || days > WARN_DAYS) return null;
  const period = `${formatDate(item.start)}から${formatDate(item.date)}まで`;
  return {
    user,
    level: days <= URGENT_DAYS ? "urgent" : "warn",
    title: item.title,
    days,
    message: days < 0
      ? `${period}。期限を${Math.abs(days)}日超過しています。`
      : `${period}。期限まで残り${days}日です。`,
    nextAction: item.title === "更新申請期限" ? "申請状況確認" : "期限更新確認"
  };
}

function deadlineTaskAlert(alert) {
  return {
    ...alert,
    title: `期限対応: ${alert.title}`,
    message: `${alert.message} 対応が完了するまで処理タスクに残します。`,
    nextAction: alert.nextAction
  };
}

function taskAlert(user, key, date) {
  const task = user.checks?.[key] || {};
  const days = daysUntil(date);
  const isRevived = !!task.done;
  return {
    user,
    level: days !== null && days <= URGENT_DAYS ? "urgent" : "info",
    title: TASK_LABELS[key],
    days,
    message: taskMessage(date, days, task, isRevived),
    nextAction: isRevived ? "再確認" : key === "pdf" ? "写しの受領確認" : "完了処理"
  };
}

function shouldShowRenewalTask(user, key) {
  const task = user.checks?.[key] || {};
  if (!task.done) return true;
  const dueDate = taskDueDate(user, key);
  if (task.completedForDate && task.completedForDate === dueDate) return false;
  const days = daysUntil(dueDate);
  return days !== null && days <= URGENT_DAYS;
}

function taskDueDate(user, key) {
  const task = user.checks?.[key] || {};
  if (key === "pdf") return task.nextCheck || task.due || user.recipientEnd || user.applicationDeadline;
  if (key === "apply") return task.due || user.applicationDeadline || user.recipientEnd;
  return task.due || user.recipientEnd || user.planEnd;
}

function taskMessage(date, days, task, isRevived) {
  if (!date) return "完了するまで残ります。完了後も期限30日前になったら再表示します。";
  if (isRevived) {
    return `前回対応日: ${formatDate(task.completed)}。${formatDate(date)} が近いため再表示しています。`;
  }
  const remain = days === null ? "" : days < 0 ? `期限を${Math.abs(days)}日超過しています。` : `期限まで残り${days}日です。`;
  return `${formatDate(date)} に確認。${remain} 完了後も期限30日前になったら再表示します。`;
}

function pendingTaskLabels(user) {
  const checks = user.checks || {};
  return [
    !checks.pdf?.done ? TASK_LABELS.pdf : "",
    !checks.apply?.done ? TASK_LABELS.apply : "",
    !checks.updateInfo?.done ? TASK_LABELS.updateInfo : ""
  ].filter(Boolean).join("、");
}

function isMonitoringMonth(user) {
  if (!user.monitoringCycle) return false;
  if (user.monitoringCycle === "毎月") return true;
  const start = parseDate(user.planStart);
  if (!start) return false;
  const now = new Date();
  const diff = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  if (diff < 0) return false;
  return user.monitoringCycle === "3か月" ? diff % 3 === 0 : diff % 6 === 0;
}

function renderDashboard() {
  const users = loadAll();
  const alerts = buildAlerts(users);
  renderAlertList("alert-recipient", alerts.recipient);
  renderAlertList("alert-monitoring", alerts.monitoring);
  renderAlertList("alert-task", alerts.tasks);
  $("#count-recipient").textContent = alerts.recipient.length;
  $("#count-monitoring").textContent = alerts.monitoring.length;
  $("#count-task").textContent = alerts.tasks.length;
  renderSummaryCard("summary-urgent", alerts.recipient.filter(item => item.level === "urgent"));
  renderSummaryCard("summary-warn", alerts.recipient);
}

function renderSummaryCard(prefix, alerts) {
  $(`#${prefix}-count`).textContent = alerts.length;
  const container = $(`#${prefix}-list`);
  container.innerHTML = "";

  if (!alerts.length) {
    container.innerHTML = '<span class="summary-empty">対象者なし</span>';
    return;
  }

  alerts.forEach(alert => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "summary-link";
    button.textContent = `${alert.user.name || "(無名)"}（${alert.title}）`;
    button.addEventListener("click", () => showDetail(alert.user.id));
    container.appendChild(button);
  });
}

function renderAlertList(containerId, alerts) {
  const container = $(`#${containerId}`);
  container.innerHTML = "";
  if (!alerts.length) {
    container.innerHTML = '<div class="empty-state">現在表示する対象はありません。</div>';
    return;
  }
  alerts.forEach(alert => {
    const item = document.createElement("div");
    item.className = `alert-item ${alert.level}`;
    item.innerHTML = `
      <div class="alert-name">${escapeHtml(alert.user.name || "(無名)")}</div>
      <div class="alert-body">
        <div class="alert-headline">
          <strong>${escapeHtml(alert.title)}</strong>
          <small>次に行うこと: ${escapeHtml(alert.nextAction)}</small>
        </div>
        <p>${escapeHtml(alert.message)}</p>
      </div>
      <button class="btn-primary btn-confirm" data-id="${alert.user.id}">確認</button>
    `;
    item.querySelector(".btn-confirm").addEventListener("click", () => showDetail(alert.user.id));
    container.appendChild(item);
  });
}

function renderPersonalSheets() {
  const users = loadAll().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"));
  const container = $("#personal-sheet-list");
  container.innerHTML = "";

  if (!users.length) {
    container.innerHTML = `
      <div class="empty-state">
        登録済みの利用者はいません。入力シートから新規登録してください。
      </div>
    `;
    return;
  }

  users.forEach(user => {
    const card = document.createElement("article");
    card.className = "personal-sheet-card";
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(user.name || "(無名)")}</h3>
        <p>${escapeHtml(user.kana || "")}</p>
      </div>
      <div class="personal-sheet-meta">
        <span>受給者証番号: ${escapeHtml(user.recipientNo || "-")}</span>
        <span>区: ${escapeHtml(user.wardName || "-")}</span>
        <span>受給者証期限: ${formatDate(user.recipientEnd)}</span>
        <span>モニタリング: ${escapeHtml(user.monitoringCycle || "-")}</span>
      </div>
      <div class="actions">
        <button class="btn-primary" data-confirm="${user.id}">個人シートを見る</button>
        <button class="btn-secondary" data-edit="${user.id}">編集</button>
      </div>
    `;
    card.querySelector("[data-confirm]").addEventListener("click", () => showDetail(user.id));
    card.querySelector("[data-edit]").addEventListener("click", () => {
      fillForm(user);
      showView("input");
    });
    container.appendChild(card);
  });
}

function showDetail(id) {
  const user = getUser(id);
  if (!user) return;
  $("#detail-title").textContent = `確認画面: ${user.name || "(無名)"}`;
  $("#btn-edit-from-detail").dataset.id = id;
  $("#detail-content").innerHTML = detailHtml(user);
  $$("#detail-content [data-task-checkbox]").forEach(checkbox => {
    checkbox.addEventListener("change", () => updateTaskFromCheckbox(id, checkbox.dataset.taskCheckbox, checkbox.checked));
  });
  $$("#detail-content [data-deadline-complete]").forEach(button => {
    button.addEventListener("click", () => toggleDeadline(id, button.dataset.deadlineComplete, button.dataset.deadlineDate));
  });
  showView("detail");
}

function detailHtml(user) {
  const services = ["training1", "training2", "care1", "care2"].flatMap(key =>
    (user[key] || []).map((row, index) => ({
      ...row,
      completeKey: `service:${key}:${index}:${row.type || ""}:${row.start || ""}:${row.end || ""}`,
      deadlineCompletions: user.deadlineCompletions || {},
      group: SERVICE_LABELS[key]
    }))
  );
  return `
    <div class="detail-top-grid wide-detail">
      <article class="detail-card task-priority-card">
        <div class="priority-heading">
          <div>
            <h3>更新時タスク</h3>
            <p>チェックを押すとすぐ保存され、ダッシュボードにも反映されます。</p>
          </div>
          <span>${taskDoneCount(user)} / 3 完了</span>
        </div>
        ${taskHtml("pdf", user.checks?.pdf)}
        ${taskHtml("apply", user.checks?.apply)}
        ${taskHtml("updateInfo", user.checks?.updateInfo)}
      </article>
      <article class="detail-card deadline-summary-card">
        <h3>期限情報・サービス期限まとめ</h3>
        <div class="deadline-main-grid">
          ${periodInfo(user, "recipient", "受給者証", user.recipientStart, user.recipientEnd)}
          ${periodInfo(user, "application", "更新申請期限", user.recipientStart, user.applicationDeadline)}
          ${periodInfo(user, "plan", "計画相談", user.planStart, user.planEnd)}
          ${info("モニタリング", user.monitoringCycle)}
        </div>
        <div class="deadline-service-list">
          ${services.length ? services.map(serviceHtml).join("") : '<div class="empty-state">サービス登録はありません。</div>'}
        </div>
      </article>
    </div>
    <article class="detail-card basic-info-card wide-detail">
      <h3>基本情報</h3>
      <div class="info-grid basic-info-grid">
        ${info("氏名", user.name)}
        ${info("フリガナ", user.kana)}
        ${info("生年月日", formatDate(user.birthday))}
        ${info("電話番号", user.phone)}
        ${info("住所", user.address)}
        ${info("受給者証番号", user.recipientNo)}
        ${info("管轄する区", user.wardName)}
        ${info("自治体コード", user.municipalCode)}
        ${info("障害者種別", user.disabilityType)}
        ${info("利用者負担上限額", user.paymentCap)}
      </div>
    </article>
    <article class="detail-card wide-detail">
      <h3>備考</h3>
      <p>${escapeHtml(user.note || "備考はありません。")}</p>
    </article>
  `;
}

function info(label, value) {
  return `<div class="info-box"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`;
}

function periodInfo(user, key, label, start, end) {
  const done = user.deadlineCompletions?.[key];
  const isDone = !!done && done.date === end;
  return `
    <div class="info-box period-info ${isDone ? "deadline-done" : ""}">
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${formatDate(start)}から <em>${formatDate(end)}</em> まで</strong>
        ${isDone ? `<small>完了日: ${formatDate(done.completed)}</small>` : ""}
      </div>
      <button type="button" class="btn-secondary deadline-complete-btn ${isDone ? "undo" : ""}" data-deadline-complete="${escapeHtml(key)}" data-deadline-date="${escapeHtml(end || "")}">
        ${isDone ? "もとに戻す" : "完了"}
      </button>
    </div>
  `;
}

function taskHtml(key, task = {}) {
  const done = !!task.done;
  const date = task.nextCheck || task.due || task.completed || task.requested;
  return `
    <div class="task-line ${done ? "done" : "pending"}">
      <label class="task-check-label">
        <input type="checkbox" data-task-checkbox="${key}" ${done ? "checked" : ""}>
        <span>${done ? "完了" : "未完了"}</span>
      </label>
      <div class="task-line-body">
        <strong>${escapeHtml(TASK_LABELS[key])}</strong>
        <p>状態: ${done ? "完了" : "未完了"} / 確認日: ${formatDate(date)} ${task.note ? ` / ${escapeHtml(task.note)}` : ""}</p>
        <small>完了後も、期限まであと30日になったら処理タスクに再表示します。</small>
      </div>
    </div>
  `;
}

function taskDoneCount(user) {
  const checks = user.checks || {};
  return ["pdf", "apply", "updateInfo"].filter(key => checks[key]?.done).length;
}

function serviceHtml(service) {
  const done = service.deadlineCompletions?.[service.completeKey];
  return `
    <div class="service-line ${done && done.date === service.end ? "deadline-done" : ""}">
      <div class="service-line-main">
        <strong>${escapeHtml(service.type || "-")}</strong>
        <p>${escapeHtml(service.group)} / ${formatDate(service.start)}から <em>${formatDate(service.end)}</em> まで</p>
        <p>使用事業所: ${escapeHtml(service.office || "-")}${service.level ? ` / 区分種別: ${escapeHtml(service.level)}` : ""}</p>
        ${done && done.date === service.end ? `<small>完了日: ${formatDate(done.completed)}</small>` : ""}
      </div>
      <button type="button" class="btn-secondary deadline-complete-btn ${done && done.date === service.end ? "undo" : ""}" data-deadline-complete="${escapeHtml(service.completeKey)}" data-deadline-date="${escapeHtml(service.end || "")}">
        ${done && done.date === service.end ? "もとに戻す" : "完了"}
      </button>
    </div>
  `;
}

function toggleDeadline(userId, key, date) {
  const user = getUser(userId);
  if (!user) return;
  user.deadlineCompletions = user.deadlineCompletions || {};
  if (user.deadlineCompletions[key]?.date === date) {
    delete user.deadlineCompletions[key];
  } else {
    user.deadlineCompletions[key] = {
      date,
      completed: new Date().toISOString().slice(0, 10)
    };
  }
  upsertUser(user);
  renderDashboard();
  showDetail(userId);
}

function updateTaskFromCheckbox(userId, key, done) {
  const user = getUser(userId);
  if (!user) return;
  user.checks = user.checks || {};
  user.checks[key] = user.checks[key] || {};
  const dueDate = taskDueDate(user, key);
  user.checks[key].done = done;
  user.checks[key].completed = done ? new Date().toISOString().slice(0, 10) : "";
  user.checks[key].completedForDate = done ? dueDate : "";
  upsertUser(user);
  renderDashboard();
  showDetail(userId);
}

function renderBackup() {
  $("#record-count").textContent = loadAll().length;
}

function exportCsv() {
  const headers = [
    "氏名",
    "フリガナ",
    "生年月日",
    "電話番号",
    "住所",
    "受給者証番号",
    "管轄区",
    "自治体コード",
    "障害者種別",
    "受給者証開始",
    "受給者証終了",
    "更新申請期限",
    "計画相談開始",
    "計画相談終了",
    "モニタリング",
    "利用者負担上限額",
    "バックアップデータ"
  ];
  const rows = loadAll().map(user => [
    user.name,
    user.kana,
    user.birthday,
    user.phone,
    user.address,
    user.recipientNo,
    user.wardName,
    user.municipalCode,
    user.disabilityType,
    user.recipientStart,
    user.recipientEnd,
    user.applicationDeadline,
    user.planStart,
    user.planEnd,
    user.monitoringCycle,
    user.paymentCap,
    JSON.stringify(user)
  ]);
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `welfare_users_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function importCsv(file) {
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const rows = parseCsv(event.target.result);
      if (rows.length < 2) throw new Error("CSVに利用者データがありません。");
      const headers = rows[0];
      const backupIndex = headers.indexOf("バックアップデータ");
      if (backupIndex < 0) throw new Error("バックアップデータ列がありません。");
      const data = rows.slice(1).filter(row => row.some(cell => cell.trim())).map(row => JSON.parse(row[backupIndex]));
      if (!confirm(`${data.length}件を取り込みます。現在のデータは置き換わります。よろしいですか？`)) return;
      saveAll(data);
      renderDashboard();
      renderBackup();
      alert("取り込みました。");
    } catch (error) {
      alert(`取り込みに失敗しました: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function init() {
  setupWardSelect();
  $$(".tab-btn").forEach(button => button.addEventListener("click", () => {
    if (button.dataset.view === "input") clearForm();
    showView(button.dataset.view);
  }));
  $$("[data-view-link]").forEach(button => button.addEventListener("click", () => showView(button.dataset.viewLink)));
  $("#btn-new-from-personal").addEventListener("click", () => {
    clearForm();
    showView("input");
  });
  $("#btn-save-top").addEventListener("click", () => $("#user-form").requestSubmit());
  $("#btn-cancel").addEventListener("click", () => showView("dashboard"));
  $("#btn-cancel-bottom").addEventListener("click", () => showView("dashboard"));
  $("#btn-edit-from-detail").addEventListener("click", event => {
    const user = getUser(event.currentTarget.dataset.id);
    if (!user) return;
    fillForm(user);
    showView("input");
  });
  $$(".btn-add").forEach(button => {
    button.addEventListener("click", () => addServiceRow(button.dataset.target));
  });
  $("#user-form").addEventListener("submit", event => {
    event.preventDefault();
    const user = collectForm();
    if (!user.name) {
      alert("氏名は必須です。");
      return;
    }
    upsertUser(user);
    showDetail(user.id);
  });
  $("#btn-delete").addEventListener("click", () => {
    const id = $("#user-id").value;
    if (!id) return;
    if (confirm("この利用者を削除します。よろしいですか？")) {
      deleteUser(id);
      showView("dashboard");
    }
  });
  $("#btn-export").addEventListener("click", exportCsv);
  $("#import-file").addEventListener("change", event => {
    const file = event.target.files && event.target.files[0];
    if (file) importCsv(file);
    event.target.value = "";
  });
  $("#btn-clear").addEventListener("click", () => {
    if (confirm("全データを削除します。元に戻せません。よろしいですか？")) {
      localStorage.removeItem(STORAGE_KEY);
      renderDashboard();
      renderBackup();
    }
  });
  renderDashboard();
}

document.addEventListener("DOMContentLoaded", init);
