const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "app.js"), "utf8");
const alerts = [];
const storage = new Map();

const storageApi = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};

const context = vm.createContext({
  window: {
    PRODUCTION_REPORT_SYSTEM_KEY: "activity-save-test",
    PRODUCTION_REPORT_API_URL: ""
  },
  location: { pathname: "/activity-save-test/" },
  document: {
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  },
  localStorage: storageApi,
  sessionStorage: storageApi,
  confirm() { return true; },
  alert(message) { alerts.push(String(message)); },
  console,
  Date,
  Math,
  JSON,
  Map,
  Set,
  URLSearchParams,
  setTimeout,
  clearTimeout
});

vm.runInContext(source, context, { filename: "app.js" });
vm.runInContext(`
  collectActivityEditor = () => [{
    id: "new_activity",
    label: "保存確認テスト",
    hint: "保存後に誤エラーが出ないこと",
    active: true,
    order: 0
  }];
  cloudEnabled = () => false;
  loadActivities = () => [];
  saveActivities = activities => { globalThis.__savedActivities = activities; };
  addHistory = () => {};
  renderActivityEditor = () => { globalThis.__editorRendered = true; };
  renderAdminSummary = () => { globalThis.__summaryRendered = true; };
  renderHistory = () => { globalThis.__historyRendered = true; };
`, context);

(async () => {
  await vm.runInContext("saveActivityEditor()", context);

  assert.equal(context.__savedActivities.length, 1);
  assert.equal(context.__savedActivities[0].label, "保存確認テスト");
  assert.equal(context.__editorRendered, true);
  assert.equal(context.__summaryRendered, true);
  assert.equal(context.__historyRendered, true);
  assert.equal(alerts.length, 1, `unexpected alerts: ${alerts.join(" | ")}`);
  assert.ok(!alerts[0].includes("保存できませんでした"), alerts[0]);

  console.log("activity editor save success path passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
