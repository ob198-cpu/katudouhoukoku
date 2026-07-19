const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let nextSheetId = 1;
class FakeRange {
  constructor(sheet, row, column, rows, columns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }
  setValues(values) {
    for (let r = 0; r < this.rows; r += 1) {
      const target = this.row - 1 + r;
      if (!this.sheet.rows[target]) this.sheet.rows[target] = [];
      for (let c = 0; c < this.columns; c += 1) this.sheet.rows[target][this.column - 1 + c] = values[r][c];
    }
    return this;
  }
  getValues() {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) =>
      this.sheet.rows[this.row - 1 + r]?.[this.column - 1 + c] ?? ''
    ));
  }
  getDisplayValues() { return this.getValues().map(row => row.map(value => String(value ?? ''))); }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
}

class FakeSheet {
  constructor(book, name) {
    this.book = book;
    this.name = name;
    this.id = nextSheetId++;
    this.rows = [];
    this.maxRows = 1000;
    this.maxColumns = 26;
  }
  getName() { return this.name; }
  getSheetId() { return this.id; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i -= 1) if ((this.rows[i] || []).some(value => value !== '' && value != null)) return i + 1;
    return 0;
  }
  getLastColumn() { return Math.max(0, ...this.rows.map(row => (row || []).length)); }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxColumns; }
  insertRowsAfter(_after, count) { this.maxRows += count; return this; }
  insertColumnsAfter(_after, count) { this.maxColumns += count; return this; }
  insertRowBefore(row) { this.rows.splice(row - 1, 0, []); this.maxRows += 1; return this; }
  deleteRow(row) { this.rows.splice(row - 1, 1); return this; }
  deleteRows(row, count) { this.rows.splice(row - 1, count); return this; }
  getRange(row, column, rows = 1, columns = 1) { return new FakeRange(this, row, column, rows, columns); }
  setName(name) { this.book.renameSheet(this, name); return this; }
  setFrozenRows() { return this; }
  autoResizeColumns() { return this; }
  showColumns() { return this; }
  hideColumns() { return this; }
}

class FakeSpreadsheet {
  constructor() { this.sheets = new Map(); this.failRenameTarget = ''; }
  insertSheet(name) {
    const sheet = new FakeSheet(this, name);
    this.sheets.set(name, sheet);
    return sheet;
  }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  deleteSheet(sheet) { this.sheets.delete(sheet.name); }
  renameSheet(sheet, name) {
    if (this.failRenameTarget === name) {
      this.failRenameTarget = '';
      throw new Error('simulated rename failure: ' + name);
    }
    if (this.sheets.has(name) && this.sheets.get(name) !== sheet) throw new Error('duplicate sheet: ' + name);
    this.sheets.delete(sheet.name);
    sheet.name = name;
    this.sheets.set(name, sheet);
  }
}

class FakeProperties {
  constructor() { this.values = new Map(); }
  getProperty(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setProperty(key, value) { this.values.set(key, String(value)); return this; }
  deleteProperty(key) { this.values.delete(key); return this; }
}

const book = new FakeSpreadsheet();
const properties = new FakeProperties();
let uuid = 0;
const context = {
  console,
  SpreadsheetApp: { openById: () => book },
  PropertiesService: { getScriptProperties: () => properties },
  Utilities: {
    getUuid: () => 'uuid_' + (++uuid).toString().padStart(8, '0'),
    formatDate: (date, _zone, format) => {
      const iso = new Date(date).toISOString();
      return format === 'yyyy-MM-dd' ? iso.slice(0, 10) : iso.slice(0, 10).replace(/-/g, '/') + ' ' + iso.slice(11, 19);
    },
    computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(String(value)).digest()]
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8'), context);

context.selectSpreadsheet_('main');
context.ensureAllSheets_();

const r1 = context.normalizeReport_({ id: 'r1', date: '2026-07-01', name: 'A', minutes: 10 });
const r2 = context.normalizeReport_({ id: 'r2', date: '2026-07-01', name: 'B', minutes: 20 });
context.upsertJson_(context.SHEETS?.reports || { name: 'Reports', type: 'reports', headers: ['投稿日', '氏名', '生産活動内容', '活動別時間', '合計時間(分)', '合計時間', '進捗状況', '選択投稿日', '実送信日', '日付正誤', '送信日時', '更新日時', 'id', 'json'] }, 'r1', r1);
context.upsertJson_(context.SHEETS?.reports || { name: 'Reports', type: 'reports', headers: ['投稿日', '氏名', '生産活動内容', '活動別時間', '合計時間(分)', '合計時間', '進捗状況', '選択投稿日', '実送信日', '日付正誤', '送信日時', '更新日時', 'id', 'json'] }, 'r2', r2);
const reportDef = { name: 'Reports', type: 'reports', headers: ['投稿日', '氏名', '生産活動内容', '活動別時間', '合計時間(分)', '合計時間', '進捗状況', '選択投稿日', '実送信日', '日付正誤', '送信日時', '更新日時', 'id', 'json'] };
const originalSheetId = book.getSheetByName('Reports').getSheetId();
context.upsertJson_(reportDef, 'r1', context.normalizeReport_({ ...r1, minutes: 99 }));
assert.equal(book.getSheetByName('Reports').getSheetId(), originalSheetId);
assert.deepEqual(context.readReports_().map(item => item.id).sort(), ['r1', 'r2']);
assert.equal(context.readReports_().find(item => item.id === 'r1').minutes, 99);

const tenYears = Array.from({ length: 3650 }, (_, index) => context.normalizeReport_({
  id: 'report_' + index,
  date: '2030-01-01',
  name: '利用者' + index,
  minutes: index
}));
context.writeJsonRows_(reportDef, tenYears);
assert.equal(context.readReports_().length, 3650);

book.failRenameTarget = 'Reports';
assert.throws(() => context.writeJsonRows_(reportDef, [r1]), /simulated rename failure/);
assert.equal(context.readReports_().length, 3650);
assert.equal([...book.sheets.keys()].some(name => name.includes('__old_') || name.includes('__staging_')), false);

assert.equal(context.currentRevision_(), 0);
context.assertExpectedRevision_(0);
assert.equal(context.bumpRevision_(), 1);
assert.throws(() => context.assertExpectedRevision_(0), /CONFLICT/);
assert.throws(() => context.selectSpreadsheet_(''), /指定されていません/);

console.log('row update, rollback, conflict, tenant routing, and 10-year volume checks passed');
