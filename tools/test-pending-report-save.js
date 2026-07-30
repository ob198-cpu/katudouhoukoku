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
      loadReports
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
      revision: 2,
      report: request.payload.report,
      activities: []
    });
  };
  const result = await api.flushPendingReports({ throwOnError: true });
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
      revision: 3,
      report: request.payload.report,
      activities: []
    });
  };
  await assert.rejects(() => api.addReport(wrongTarget), /保存先の確認に失敗/);
  assert.strictEqual(api.loadPendingReports().length, 1, "保存先不一致では未送信キューを消さないこと");

  console.log("pending queue, idempotent retry, readback, and tenant checks passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
