const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'backend', 'Code.gs'), 'utf8');
const clasp = JSON.parse(fs.readFileSync(path.join(root, '.clasp.json'), 'utf8'));
const expectedScriptId = '1dCF59TRAHIOJ_843Mc6JDwhE5EIjwUleiyt8_7_ehvaf_iivZZoJVRwV';

const failures = [];
if (clasp.scriptId !== expectedScriptId) failures.push('正本GASのscriptIdが変更されています。');
if (!source.includes('const SPREADSHEET_IDS')) failures.push('保存先ルーターがありません。');
if (!source.includes('assertExpectedRevision_')) failures.push('競合検知がありません。');
if (!source.includes('replaceSheetSafely_')) failures.push('世代付き安全保存がありません。');
if (source.includes('deleteAllReports')) failures.push('全削除APIが残っています。');
if (/\.clearContents\s*\(|\.clear\s*\(/.test(source)) failures.push('稼働シートを全消去する処理が残っています。');
if (/String\(systemKey\s*\|\|\s*['"](?:2|main)['"]/.test(source)) failures.push('systemKey欠落時の既定保存先が残っています。');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('backend safety checks passed');
