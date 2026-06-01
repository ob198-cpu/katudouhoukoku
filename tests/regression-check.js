const fs = require("fs");
const vm = require("vm");

const source = fs
  .readFileSync("app.js", "utf8")
  .replace('document.addEventListener("DOMContentLoaded", init);', "");

function field(value = "") {
  return {
    value,
    checked: false,
    querySelector() {
      return null;
    }
  };
}

function createFormHarness() {
  const elements = new Map();
  [
    "user-id",
    "name",
    "kana",
    "birthday",
    "phone",
    "address",
    "recipient-no",
    "user-status",
    "ward",
    "custom-ward",
    "municipal-code",
    "disability-type",
    "recipient-start",
    "plan-start",
    "plan-end",
    "monitoring-cycle",
    "payment-cap",
    "note",
    "chk-document",
    "chk-send",
    "chk-confirm",
    "chk-pdf",
    "chk-update-info",
    "document-completed",
    "document-note",
    "send-completed",
    "send-note",
    "confirm-completed",
    "confirm-note",
    "pdf-completed",
    "pdf-note",
    "update-completed",
    "update-note"
  ].forEach(id => elements.set(`#${id}`, field("")));

  elements.get("#name").value = "回帰テスト";
  elements.get("#recipient-no").value = "REG-001";
  elements.get("#user-status").value = "active";
  elements.get("#ward").value = "011056";
  elements.get("#municipal-code").value = "011056";
  elements.get("#monitoring-cycle").value = "3か月";
  elements.get("#plan-end")._syncEraToInput = () => {
    elements.get("#plan-end").value = "2026-06-20";
  };

  const serviceControls = {
    ".svc-type": field("就労移行支援"),
    ".svc-start": Object.assign(field(""), {
      _syncEraToInput() {
        this.value = "2026-01-05";
      }
    }),
    ".svc-end": Object.assign(field(""), {
      _syncEraToInput() {
        this.value = "2026-06-20";
      }
    }),
    ".svc-office": field("就労支援トライズ大通"),
    ".svc-level": field("")
  };

  const serviceRow = {
    querySelector(selector) {
      return serviceControls[selector] || null;
    }
  };

  return {
    querySelector(selector) {
      return elements.get(selector) || null;
    },
    querySelectorAll(selector) {
      if (selector === "#training1-rows .service-row") return [serviceRow];
      if (selector.endsWith(" .service-row")) return [];
      if (selector === 'input[type="date"][data-era-ready]') return [elements.get("#plan-end")];
      return [];
    }
  };
}

function loadApp(documentMock = createFormHarness()) {
  const store = {};
  const box = {
    console,
    document: documentMock,
    window: { scrollTo() {} },
    alert() {},
    localStorage: {
      getItem(key) {
        return store[key] || null;
      },
      setItem(key, value) {
        store[key] = value;
      },
      removeItem(key) {
        delete store[key];
      }
    }
  };
  vm.createContext(box);
  vm.runInContext(
    `${source}; globalThis.__test = {
      collectForm,
      csvCell,
      deadlineAlert,
      deadlineOverviewHtml,
      deadlineOverviewItems,
      deadlineOverviewStatus,
      deadlineStatusText,
      isDeadlineCompleted,
      isDashboardVisible,
      isMonitoringMonth,
      isRenewalComplete,
      isRenewalMonthActive,
      isRenewalStepDone,
      normalizeUser,
      addHistory,
      parseCsv,
      readDateInput,
      renewalAlertLabel,
      serviceHtml,
      toIsoDateFromEra,
      toJapaneseEraDate
    };`,
    box
  );
  return box.__test;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function localIso(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

const app = loadApp();

assert(app.toIsoDateFromEra("reiwa", "8", "6", "20") === "2026-06-20", "令和8年6月20日の変換に失敗");
assert(app.toIsoDateFromEra("reiwa", "108", "6", "1") === "2126-06-01", "令和108年の日付変換に失敗");
assert(app.toJapaneseEraDate("2126-06-01") === "令和108年6月1日", "100年後の日付が和暦表示に戻らない");
assert(app.toIsoDateFromEra("reiwa", "", "", "") === "", "空の日付が空文字になっていない");
assert(app.toIsoDateFromEra("reiwa", "8", "2", "30") === "", "存在しない日付が保存可能になっている");

const user = app.collectForm();
assert(user.planEnd === "2026-06-20", "計画相談終了日が保存値に同期されていない");
assert(user.training1[0].start === "2026-01-05", "サービス開始日が保存値に同期されていない");
assert(user.training1[0].end === "2026-06-20", "サービス終了日が保存値に同期されていない");
assert(app.toJapaneseEraDate(user.planEnd) === "令和8年6月20日", "保存値が和暦表示に戻らない");

const soon = new Date();
soon.setDate(soon.getDate() + 10);
const soonIso = localIso(soon);
const exactlyThirty = new Date();
exactlyThirty.setDate(exactlyThirty.getDate() + 30);
const exactlyThirtyIso = localIso(exactlyThirty);
const thirtyOne = new Date();
thirtyOne.setDate(thirtyOne.getDate() + 31);
const thirtyOneIso = localIso(thirtyOne);
const todayIso = localIso(new Date());
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayIso = localIso(yesterday);
const alertUser = {
  status: "active",
  planEnd: soonIso,
  checks: {
    document: { done: false },
    send: { done: false },
    confirm: { done: false },
    pdf: { done: false },
    updateInfo: { done: false }
  },
  deadlineCompletions: {}
};
assert(app.isRenewalMonthActive(alertUser), "30日以内の未完了者がアラート対象になっていない");
assert(app.renewalAlertLabel(alertUser).includes("期限まであと"), "アラート文言が自然表示になっていない");
alertUser.planEnd = exactlyThirtyIso;
assert(app.isRenewalMonthActive(alertUser), "30日前ちょうどがアラート対象になっていない");
alertUser.planEnd = thirtyOneIso;
assert(!app.isRenewalMonthActive(alertUser), "31日前がアラート対象になっている");
alertUser.planEnd = todayIso;
assert(app.renewalAlertLabel(alertUser) === "本日期限", "当日期限の表示が本日期限にならない");
alertUser.planEnd = yesterdayIso;
assert(app.renewalAlertLabel(alertUser) === "期限超過 1日", "期限超過の表示が正しくない");
assert(app.deadlineStatusText(yesterdayIso) === "期限超過 1日", "期限表示ヘルパーの超過表示が正しくない");
alertUser.planEnd = soonIso;
Object.values(alertUser.checks).forEach(task => {
  task.done = true;
  task.completedForDate = soonIso;
});
assert(!app.isRenewalMonthActive(alertUser), "5項目完了後もアラート対象のまま");
assert(app.isRenewalComplete(alertUser), "5項目完了後に更新完了扱いにならない");
assert(app.renewalAlertLabel(alertUser) === "更新完了", "5項目完了後の表示が更新完了にならない");
alertUser.planEnd = "2026-12-31";
assert(!app.isRenewalStepDone(alertUser, "document"), "前回期限の完了が次回期限に持ち越されている");
alertUser.planEnd = soonIso;
alertUser.status = "paused";
assert(!app.isRenewalMonthActive(alertUser), "停止ステータスでアラートが抑制されていない");
alertUser.status = "hidden";
assert(!app.isDashboardVisible(alertUser), "非表示ステータスがダッシュボードから除外されない");

const deadlineUser = {
  status: "active",
  planStart: "2026-01-01",
  planEnd: soonIso,
  deadlineCompletions: {}
};
const deadlineItem = { key: "plan", title: "計画相談", start: deadlineUser.planStart, date: deadlineUser.planEnd };
assert(app.deadlineAlert(deadlineUser, deadlineItem)?.level === "urgent", "30日以内の期限情報が緊急扱いにならない");
deadlineUser.deadlineCompletions.plan = { date: soonIso, completed: soonIso };
assert(app.isDeadlineCompleted(deadlineUser, deadlineItem), "期限確認済が完了扱いにならない");

const pastServiceHtml = app.serviceHtml({
  type: "就労移行支援",
  group: "訓練等給付費情報1",
  start: "2026-01-05",
  end: yesterdayIso,
  office: "就労支援トライズ大通",
  completeKey: "service:test",
  deadlineCompletions: {},
  alertEligible: true,
  renewalComplete: false
});
assert(pastServiceHtml.includes("期限超過 1日"), "サービス期限の超過表示が正しくない");
assert(!pastServiceHtml.includes("期限まであと-"), "サービス期限に負の日数表示が残っている");

const overviewUser = {
  status: "active",
  recipientStart: "2026-01-19",
  recipientEnd: "",
  planStart: "2026-02-01",
  planEnd: soonIso,
  training1: [{ type: "就労移行支援", start: "2026-01-05", end: yesterdayIso, office: "就労支援トライズ大通" }],
  training2: [],
  care1: [],
  care2: [],
  deadlineCompletions: {}
};
const overviewItems = app.deadlineOverviewItems(overviewUser);
assert(overviewItems.some(item => item.label === "受給者証" && item.note === "終了日未入力"), "受給者証の終了日未入力が期限一覧に出ない");
assert(overviewItems.some(item => item.label === "計画相談" && item.end === soonIso), "計画相談期限が期限一覧に出ない");
assert(app.deadlineOverviewStatus(soonIso, false).badge === "30日以内", "30日以内の期限分類が正しくない");
assert(app.deadlineOverviewHtml(overviewUser).includes("期限一覧"), "個人シート用の期限一覧HTMLが出力されない");
assert(app.deadlineOverviewHtml(overviewUser).includes("就労移行支援"), "サービス期限が期限一覧HTMLに出力されない");

const monitoringBase = new Date();
monitoringBase.setMonth(monitoringBase.getMonth() - 3);
const monitoringUser = { status: "active", planStart: localIso(monitoringBase), monitoringCycle: "3か月" };
assert(app.isMonitoringMonth(monitoringUser), "3か月ごとのモニタリング月判定が現在月で成立していない");
monitoringUser.status = "ended";
assert(!app.isMonitoringMonth(monitoringUser), "終了ステータスでモニタリングが抑制されていない");

const longHistoryUser = app.normalizeUser({ history: Array.from({ length: 150 }, (_, index) => ({ action: `履歴${index}` })) });
assert(longHistoryUser.history.length === 150, "100件を超える履歴が正規化で消えている");
for (let index = 0; index < 150; index += 1) {
  app.addHistory(longHistoryUser, `追加${index}`);
}
assert(longHistoryUser.history.length === 300, "100件を超える履歴が追加時に消えている");

const csv = `"氏名","メモ"\r\n${app.csvCell("回帰テスト")},${app.csvCell('カンマ,と"引用符"')}`;
const parsed = app.parseCsv(csv);
assert(parsed[1][1] === 'カンマ,と"引用符"', "CSVの引用符・カンマ復元に失敗");

console.log("regression-check: ok");
