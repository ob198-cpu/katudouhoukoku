const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appSource = fs.readFileSync(path.resolve(__dirname, "..", "app.js"), "utf8");

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createContext() {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const listeners = {};
  const context = {
    console,
    Date,
    Math,
    JSON,
    Map,
    Set,
    Promise,
    Error,
    String,
    Number,
    Array,
    Object,
    RegExp,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage,
    sessionStorage,
    navigator: { onLine: true },
    location: { pathname: "/katudouhoukoku4/" },
    window: {
      PRODUCTION_REPORT_SYSTEM_KEY: "4",
      PRODUCTION_REPORT_API_URL: "https://script.google.com/macros/s/test/exec?systemKey=4",
      addEventListener(type, listener) {
        listeners[type] = listener;
      }
    },
    document: {
      body: { dataset: {} },
      visibilityState: "visible",
      hidden: false,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener(type, listener) {
        listeners[type] = listener;
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(appSource, context, { filename: "app.js" });
  vm.runInContext(`
    globalThis.__saveTest = {
      addReport,
      flushPendingReports,
      loadPendingReports,
      loadReports,
      verifySubmittedReport
    };
  `, context);
  return context;
}

function response(data) {
  return {
    ok: true,
    async text() {
      return JSON.stringify({ ok: true, data });
    }
  };
}

(async () => {
  const context = createContext();
  const api = context.__saveTest;
  const report = {
    id: "report_retry_1",
    date: "2026-07-30",
    name: "保存確認テスト",
    activityIds: ["transcription"],
    activityLabels: { transcription: "文字起こし" },
    activityMinutes: { transcription: 30 },
    minutes: 30,
    progress: "確認"
  };

  context.fetch = async () => {
    throw new Error("network down");
  };
  await assert.rejects(() => api.addReport(report), /network down/);
  assert.strictEqual(api.loadPendingReports().length, 1, "通信失敗時も未送信キューに残ること");
  assert.strictEqual(api.loadReports().length, 1, "通信失敗時も端末内に報告が残ること");

  let sentId = "";
  context.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    sentId = request.payload.report.id;
    return response({
      confirmed: true,
      systemKey: "4",
      backendBuildId: "production-multitenant-20260730-v1",
      revision: 2,
      report: request.payload.report,
      activities: []
    });
  };
  const result = await api.flushPendingReports({ force: true, throwOnError: true });
  assert.strictEqual(sentId, "report_retry_1", "再送でも同じ受付IDを使うこと");
  assert.strictEqual(result.saved, 1);
  assert.strictEqual(result.pending, 0);
  assert.strictEqual(api.loadPendingReports().length, 0, "読戻し確認後だけキューを消すこと");
  assert.strictEqual(api.loadReports().length, 1, "再送で二重登録しないこと");

  const wrongTarget = {
    ...report,
    id: "report_wrong_target",
    name: "保存先確認テスト"
  };
  context.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    return response({
      confirmed: true,
      systemKey: "5",
      backendBuildId: "production-multitenant-20260730-v1",
      revision: 3,
      report: request.payload.report,
      activities: []
    });
  };
  await assert.rejects(() => api.addReport(wrongTarget), /保存先の確認に失敗/);
  assert.strictEqual(api.loadPendingReports().length, 1, "保存先不一致では未送信キューを消さないこと");

  const partialReadback = {
    ...report,
    id: "report_partial_readback",
    name: "全項目確認テスト",
    progress: "完了"
  };
  context.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    return response({
      confirmed: true,
      systemKey: "4",
      backendBuildId: "production-multitenant-20260730-v1",
      revision: 4,
      report: { ...request.payload.report, progress: "" },
      activities: []
    });
  };
  await assert.rejects(() => api.addReport(partialReadback), /全項目と一致しません/);
  assert(
    api.loadPendingReports().some(item => item.report.id === partialReadback.id),
    "読戻しで1項目でも欠落した報告は未送信キューに残ること"
  );

  const independentReport = {
    ...report,
    id: "report_independent",
    name: "個別送信テスト"
  };
  const sentIds = [];
  context.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    sentIds.push(request.payload.report.id);
    return response({
      confirmed: true,
      systemKey: "4",
      backendBuildId: "production-multitenant-20260730-v1",
      revision: 5,
      report: request.payload.report,
      activities: []
    });
  };
  await api.addReport(independentReport);
  assert.deepStrictEqual(
    sentIds,
    [independentReport.id],
    "新しい報告の送信時は、その受付IDだけを送信して過去の未送信に巻き込まれないこと"
  );
  assert(
    api.loadPendingReports().some(item => item.report.id === wrongTarget.id),
    "過去の要確認データは勝手に破棄しないこと"
  );
  assert(
    api.loadPendingReports().some(item => item.report.id === partialReadback.id),
    "過去の読戻し不一致データは勝手に破棄しないこと"
  );

  console.log("pending queue, isolated retry, full readback, and tenant checks passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
