const nodeTest = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Artificial fixtures only. The VM fetch below never accesses the network.
const possibleRepoRoot = path.resolve(__dirname, '..');
const isRepositoryTool = fs.existsSync(path.join(possibleRepoRoot, 'app.js')) &&
  fs.existsSync(path.join(possibleRepoRoot, 'config.js'));
const root = isRepositoryTool ? possibleRepoRoot : path.resolve(__dirname, '../..');
const scope = isRepositoryTool ? 'この事業所' : '全11事業所';
const test = (name, ...options) => nodeTest(name.replaceAll('全11事業所', scope), ...options);
const facilitySpecs = isRepositoryTool ? [{ repo: path.basename(root), dir: '.' }] : [
  { repo: 'katudouhoukoku', dir: 'katudouhoukoku_cloud_work', expectedKey: 'main' },
  ...Array.from({ length: 10 }, (_, i) => ({
    repo: `katudouhoukoku${i + 2}`,
    dir: `katudouhoukoku_copies/katudouhoukoku${i + 2}`,
    expectedKey: String(i + 2)
  }))
];
const facilities = facilitySpecs.map(facility => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, facility.dir, 'config.js'), 'utf8'), context, { timeout: 1000 });
  const key = String(context.window.PRODUCTION_REPORT_SYSTEM_KEY || '');
  assert.ok(key, facility.repo + ': active systemKey must be configured');
  if (facility.expectedKey !== undefined) assert.equal(key, facility.expectedKey, facility.repo);
  return { ...facility, key };
});
const plain = value => JSON.parse(JSON.stringify(value));
const fixturePassword = 'offline-fixture-only';
const backendBuildId = 'production-multitenant-20260730-v1';
const fixtureReport = (id, minutes) => ({
  id, date: '2026-11-12', name: '人工テスト利用者',
  activityIds: ['fixture_activity'], activityLabels: { fixture_activity: '人工テスト作業' },
  activityMinutes: { fixture_activity: minutes }, minutes, progress: '人工テスト本文',
  submittedAt: '2026-11-12T01:00:00.000Z', createdAt: '2026-11-12T01:00:00.000Z',
  updatedAt: '2026-11-12T01:00:00.000Z'
});
const snapshot = {
  backendBuildId, revision: 7,
  activities: [{ id: 'fixture_activity', label: 'サーバーの最新作業', hint: '人工データ', active: true, order: 0 }],
  reports: [fixtureReport('fixture_server_latest', 75)],
  history: [{ id: 'fixture_server_history', action: '編集', target: '報告', before: { minutes: 30 }, after: { minutes: 75 } }]
};

function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  const api = {
    values, failKey: '', failureName: 'QuotaExceededError', failureCode: undefined, removed: [],
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (key === api.failKey) {
        const error = new Error('offline fixture cache write unavailable');
        error.name = api.failureName;
        if (api.failureCode !== undefined) error.code = api.failureCode;
        throw error;
      }
      values.set(key, String(value));
    },
    removeItem(key) { api.removed.push(key); values.delete(key); },
    clear() { throw new Error('Clearing browser data is forbidden'); }
  };
  return api;
}

async function runtime(facility, {
  failure = '', cache = '', failureName = 'QuotaExceededError', failureCode, sessionCache = '',
  restoreSession = false, emptyActivities = false, cacheAtStart = false, localOnly = false
} = {}) {
  const prefix = `production_activity:${facility.key}:`;
  const pending = [{ report: fixtureReport('fixture_pending_canary', 15), queuedAt: '2026-11-12T00:00:00.000Z', status: 'blocked', attempts: 1 }];
  const pendingJson = JSON.stringify(pending);
  const local = storage({
    [prefix + 'items_v3']: JSON.stringify([{ id: 'old_activity', label: '古い控え', active: true }]),
    [prefix + 'reports_v3']: JSON.stringify([fixtureReport('fixture_old_cache', 5)]),
    [prefix + 'history_v2']: JSON.stringify([{ id: 'fixture_old_history' }]),
    [prefix + 'pending_reports_v1']: pendingJson
  });
  const session = storage(restoreSession ? {
    [prefix + 'admin_unlocked_v2']: '1',
    [prefix + 'admin_password_v2']: fixturePassword
  } : {});
  if (emptyActivities) local.values.delete(prefix + 'items_v3');
  if (cacheAtStart && cache) local.failKey = prefix + cache;
  local.failureName = failureName;
  local.failureCode = failureCode;
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) {
      const classes = new Set(selector === '#admin-console' ? ['hidden'] : []);
      elements.set(selector, {
        value: '', textContent: '', innerHTML: '', className: '', dataset: {}, disabled: false,
        listeners: new Map(),
        classList: {
          add(value) { classes.add(value); }, remove(value) { classes.delete(value); },
          contains(value) { return classes.has(value); },
          toggle(value, force) { if (force ?? !classes.has(value)) classes.add(value); else classes.delete(value); }
        },
        addEventListener(type, listener) { this.listeners.set(type, listener); },
        removeAttribute() {}, setAttribute() {}, reset() {},
        querySelector() { return null; }, querySelectorAll() { return []; }
      });
    }
    return elements.get(selector);
  };
  const calls = [];
  const context = vm.createContext({
    window: {
      PRODUCTION_REPORT_SYSTEM_KEY: facility.key,
      PRODUCTION_REPORT_API_URL: localOnly ? '' : 'https://script.google.com/macros/s/offline-fixture-only/exec',
      addEventListener() {}
    },
    location: { pathname: `/${facility.repo}/admin.html`, origin: 'https://ob198-cpu.github.io' },
    navigator: { onLine: false },
    document: {
      body: { dataset: { page: 'admin' } }, visibilityState: 'hidden',
      querySelector: element, querySelectorAll() { return []; }, addEventListener() {}
    },
    localStorage: local, sessionStorage: session,
    fetch: async (_url, options) => {
      const request = JSON.parse(options.body);
      calls.push({ action: request.action, systemKey: request.systemKey });
      assert.ok(['publicConfig', 'adminSnapshot'].includes(request.action), 'No mutation action is permitted in this test');
      if (request.action === 'adminSnapshot') {
        if (failure === 'network') throw new Error('offline fixture network unavailable');
        if (failure === 'non-json') return { ok: true, text: async () => '<html>offline fixture unavailable</html>' };
        if (failure === 'password') return { ok: true, text: async () => JSON.stringify({ ok: false, error: '管理者パスワードが違います。' }) };
      }
      const data = request.action === 'publicConfig'
        ? { backendBuildId, revision: snapshot.revision, activities: snapshot.activities }
        : { ...snapshot, systemKey: facility.key, backendBuildId: failure === 'build' ? 'offline-other-build' : backendBuildId };
      return { ok: true, text: async () => JSON.stringify({ ok: true, data }) };
    },
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    alert() {}, confirm() { return false; }, console,
    captureInitialActivities: restoreSession, fixtureRenders: []
  });
  const source = fs.readFileSync(path.join(root, facility.dir, 'app.js'), 'utf8');
  vm.runInContext(source, context, { filename: `${facility.repo}/app.js` });
  vm.runInContext(`
    renderAdminAll = () => {
      if (globalThis.captureInitialActivities) {
        globalThis.fixtureRenders.push(loadActivities().map(({ id, label }) => ({ id, label })));
      }
    };
    globalThis.fixtureApi = {
      initAdminPage, loadReports, loadHistory, loadActivities, loadPendingReports,
      addReport, applySnapshot, saveReports, saveHistory, saveActivities
    };
  `, context);
  context.fixtureApi.initAdminPage();
  await new Promise(setImmediate);
  if (cache) local.failKey = prefix + cache;
  local.failureName = failureName;
  local.failureCode = failureCode;
  if (sessionCache) session.failKey = prefix + sessionCache;
  if (!restoreSession) {
    element('#admin-pin').value = fixturePassword;
    await element('#admin-login-form').listeners.get('submit')({ preventDefault() {} });
    await new Promise(setImmediate);
  }
  return { local, session, element, calls, api: context.fixtureApi, prefix, pendingJson, renders: context.fixtureRenders };
}

test('config のコメント例を除いた有効な接続先は全11事業所で共通、systemKeyだけを振り分ける', () => {
  const endpoints = new Set();
  for (const facility of facilities) {
    const context = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(root, facility.dir, 'config.js'), 'utf8'), context, { timeout: 1000 });
    assert.equal(String(context.window.PRODUCTION_REPORT_SYSTEM_KEY), facility.key);
    const endpoint = new URL(context.window.PRODUCTION_REPORT_API_URL);
    assert.equal(endpoint.origin, 'https://script.google.com');
    assert.ok(endpoint.pathname.endsWith('/exec'));
    endpoint.search = '';
    endpoints.add(endpoint.href);
  }
  assert.equal(endpoints.size, 1);
});

for (const facility of facilities) {
  test(`${facility.repo}: 正常認証と最新の作業・報告・履歴、未送信控えを保持する`, async () => {
    const r = await runtime(facility);
    assert.equal(r.element('#admin-console').classList.contains('hidden'), false);
    assert.equal(r.element('#admin-lock').classList.contains('hidden'), true);
    assert.equal(r.session.getItem(r.prefix + 'admin_unlocked_v2'), '1');
    assert.equal(r.api.loadActivities()[0].label, 'サーバーの最新作業');
    assert.equal(r.api.loadReports().find(row => row.id === 'fixture_server_latest').minutes, 75);
    assert.ok(r.api.loadReports().some(row => row.id === 'fixture_pending_canary'));
    assert.equal(r.api.loadHistory()[0].id, 'fixture_server_history');
    assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
    assert.deepEqual(r.local.removed, []);
    assert.equal(r.calls[0].action, 'publicConfig');
    assert.ok(r.calls.every(call => call.systemKey === facility.key));
  });
}

for (const [failure, message] of [
  ['password', /管理者パスワードが違います/],
  ['network', /offline fixture network unavailable/],
  ['non-json', /JSONを返していません/],
  ['build', /保存先(?:を更新しています|プログラムの版が一致しません)/]
]) {
  test(`真正の失敗（${failure}）を認証成功にしない：全11事業所`, async () => {
    for (const facility of facilities) {
      const r = await runtime(facility, { failure });
      assert.equal(r.element('#admin-console').classList.contains('hidden'), true, facility.repo);
      assert.equal(r.session.getItem(r.prefix + 'admin_unlocked_v2'), null, facility.repo);
      assert.match(r.element('#admin-login-message').textContent, message, facility.repo);
      assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
      assert.deepEqual(plain(r.api.loadReports()).map(row => row.id), ['fixture_old_cache', 'fixture_pending_canary']);
      assert.equal(r.api.loadHistory()[0].id, 'fixture_old_history');
    }
  });
}

for (const cache of ['items_v3', 'reports_v3', 'history_v2']) {
  test(`認証済みの${cache}キャッシュが容量上限でもログインと最新表示を失わない：全11事業所`, async () => {
    const failures = [];
    for (const facility of facilities) {
      const r = await runtime(facility, { cache });
      try {
        assert.equal(r.element('#admin-console').classList.contains('hidden'), false,
          `${facility.repo}: authenticated server snapshot must not become a failed login`);
        assert.equal(r.session.getItem(r.prefix + 'admin_unlocked_v2'), '1', facility.repo);
        assert.equal(r.api.loadActivities()[0].label, 'サーバーの最新作業', facility.repo);
        const reports = plain(r.api.loadReports());
        assert.equal(reports.find(row => row.id === 'fixture_server_latest')?.minutes, 75, facility.repo);
        assert.ok(!reports.some(row => row.id === 'fixture_old_cache'), facility.repo);
        assert.ok(reports.some(row => row.id === 'fixture_pending_canary'), facility.repo);
        assert.equal(r.api.loadHistory()[0].id, 'fixture_server_history', facility.repo);
        assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
        assert.deepEqual(r.local.removed, []);
      } catch (error) {
        failures.push(facility.repo + ': ' + error.message.split('\n')[0]);
      }
    }
    assert.deepEqual(failures, []);
  });
}

test('未送信キューの永続保存失敗は成功扱いせず送信を始めない：全11事業所', async () => {
  for (const facility of facilities) {
    for (const failureName of ['QuotaExceededError', 'SecurityError']) {
      const r = await runtime(facility);
      r.local.failKey = r.prefix + 'pending_reports_v1';
      r.local.failureName = failureName;
      const callsBefore = r.calls.length;
      const report = { ...fixtureReport('fixture_unpersisted_report', 25), name: '人工未送信保存検証' };
      await assert.rejects(() => r.api.addReport(report), error => error.name === failureName, facility.repo);
      assert.equal(r.calls.length, callsBefore, facility.repo + ': unpersisted input must not start a request');
      assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
      assert.deepEqual(plain(r.api.loadPendingReports()).map(row => row.report.id), ['fixture_pending_canary']);
      assert.deepEqual(r.local.removed, []);
    }
  }
});

test('通常の報告・作業・履歴保存の容量エラーは従来どおりthrowする：全11事業所', async () => {
  for (const facility of facilities) {
    const r = await runtime(facility);
    for (const [cache, save, value] of [
      ['reports_v3', r.api.saveReports, [fixtureReport('fixture_direct_report', 20)]],
      ['items_v3', r.api.saveActivities, [{ id: 'fixture_direct_activity', label: '直接保存の作業', active: true }]],
      ['history_v2', r.api.saveHistory, [{ id: 'fixture_direct_history' }]]
    ]) {
      r.local.failKey = r.prefix + cache;
      const before = r.local.getItem(r.local.failKey);
      assert.throws(() => save(value), error => error.name === 'QuotaExceededError', facility.repo + '/' + cache);
      assert.equal(r.local.getItem(r.local.failKey), before);
      assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
    }
  }
});

test('SecurityErrorは容量上限扱いせずログイン失敗を維持する：全11事業所', async () => {
  for (const facility of facilities) {
    for (const cache of ['items_v3', 'reports_v3', 'history_v2']) {
      const r = await runtime(facility, { cache, failureName: 'SecurityError' });
      assert.equal(r.element('#admin-console').classList.contains('hidden'), true, facility.repo + '/' + cache);
      assert.equal(r.session.getItem(r.prefix + 'admin_unlocked_v2'), null);
      assert.match(r.element('#admin-login-message').textContent, /offline fixture cache write unavailable/);
      assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
    }
  }
});

test('sessionStorageの容量失敗時に認証状態を偽装して開かない：全11事業所', async () => {
  for (const facility of facilities) {
    for (const sessionCache of ['admin_password_v2', 'admin_unlocked_v2']) {
      const r = await runtime(facility, { sessionCache });
      assert.equal(r.element('#admin-console').classList.contains('hidden'), true, facility.repo + '/' + sessionCache);
      assert.equal(r.session.getItem(r.prefix + 'admin_unlocked_v2'), null);
      assert.match(r.element('#admin-login-message').textContent, /offline fixture cache write unavailable/);
      assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
    }
  }
});

test('容量fallback後の正常な永続保存で新値を返しメモリーの旧値に戻らない：全11事業所', async () => {
  for (const facility of facilities) {
    for (const [cache, method, read, value, id] of [
      ['reports_v3', 'saveReports', 'loadReports', [fixtureReport('fixture_after_recovery', 90)], 'fixture_after_recovery'],
      ['items_v3', 'saveActivities', 'loadActivities', [{ id: 'fixture_after_recovery', label: '容量回復後の作業', active: true }], 'fixture_after_recovery'],
      ['history_v2', 'saveHistory', 'loadHistory', [{ id: 'fixture_after_recovery' }], 'fixture_after_recovery']
    ]) {
      const r = await runtime(facility, { cache });
      r.local.failKey = '';
      r.api[method](value);
      assert.equal(r.api[read]().length, 1, facility.repo + '/' + cache);
      assert.equal(r.api[read]()[0].id, id, facility.repo + '/' + cache);
      assert.equal(JSON.parse(r.local.getItem(r.prefix + cache))[0].id, id);
      assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
    }
  }
});

test('容量上限で取得した空の報告・履歴から古いキャッシュを復活させない：全11事業所', async () => {
  for (const facility of facilities) {
    for (const cache of ['reports_v3', 'history_v2']) {
      const r = await runtime(facility, { cache });
      assert.doesNotThrow(() => r.api.applySnapshot({ revision: 8, reports: [], history: [] }), facility.repo + '/' + cache);
      assert.deepEqual(plain(r.api.loadReports()).map(row => row.id), ['fixture_pending_canary']);
      assert.deepEqual(plain(r.api.loadHistory()), []);
      assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
      assert.deepEqual(r.local.removed, []);
    }
  }
});

test('旧ブラウザーのQuota code 22も既取得キャッシュだけ容量fallbackできる：全11事業所', async () => {
  const failures = [];
  for (const facility of facilities) {
    const r = await runtime(facility, { cache: 'reports_v3', failureName: 'Error', failureCode: 22 });
    if (r.element('#admin-console').classList.contains('hidden') ||
        !r.api.loadReports().some(row => row.id === 'fixture_server_latest')) failures.push(facility.repo);
    assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
  }
  assert.deepEqual(failures, []);
});

test('既存session復元の初回描画はクラウド既定作業だけ容量fallbackしlocal-onlyはthrowを維持する：全11事業所', async () => {
  for (const facility of facilities) {
    const options = { restoreSession: true, emptyActivities: true, cacheAtStart: true, cache: 'items_v3' };
    const r = await runtime(facility, options);
    assert.equal(r.element('#admin-console').classList.contains('hidden'), false, facility.repo);
    assert.ok(r.renders.length >= 2, facility.repo + ': initial render and refreshed render must both run');
    assert.ok(r.renders[0].some(activity => activity.id === 'transcription'), facility.repo + ': initial render must have default activities');
    assert.equal(r.renders.at(-1)[0].label, 'サーバーの最新作業', facility.repo);
    assert.equal(r.api.loadActivities()[0].label, 'サーバーの最新作業', facility.repo);
    assert.equal(r.api.loadReports().find(row => row.id === 'fixture_server_latest')?.minutes, 75, facility.repo);
    assert.equal(r.api.loadHistory()[0].id, 'fixture_server_history', facility.repo);
    assert.equal(r.local.getItem(r.prefix + 'pending_reports_v1'), r.pendingJson);
    assert.deepEqual(r.local.removed, []);
    assert.ok(r.calls.every(call => call.action === 'adminSnapshot'));
    await assert.rejects(() => runtime(facility, { ...options, localOnly: true }),
      error => error.name === 'QuotaExceededError', facility.repo + ': local defaults still require durable storage');
  }
});
