# 生産活動報告システム

## 画面

- 利用者フォーム: `index.html`
- 管理者画面: `admin.html`

## 保存方式

本番運用では Google Apps Script + Google スプレッドシートを中央保存先として使います。

- `config.js` に Google Apps Script のウェブアプリURLを設定すると、報告・項目・履歴は共有スプレッドシートに保存されます。
- 管理者画面のログイン、編集、削除、復元、項目編集はサーバー側の管理者パスワードで認証します。
- `config.js` が空欄のままの場合だけ、テスト用としてブラウザの `localStorage` に保存されます。

## クラウド保存の設定

1. Googleスプレッドシートを作成します。
2. `backend/Code.gs` を Apps Script に貼り付けます。
3. Apps Scriptで `setupInitialAdminPassword('任意の8文字以上のパスワード')` を一度実行します。
4. ウェブアプリとしてデプロイし、`/exec` で終わるURLを取得します。
5. `config.js` の `window.PRODUCTION_REPORT_API_URL` にURLを設定します。

詳細は `backend/README.md` を確認してください。

## 主な機能

- 氏名、活動内容、所要時間、進捗状況の報告
- 共有スプレッドシートへの中央保存
- サーバー側管理者パスワード認証
- 生産活動項目の追加・編集・非表示
- 週単位、月単位の集計
- 全体グラフ、個人別グラフ、活動別統計、個人別統計
- 報告一覧、検索、編集、削除、履歴復元
- CSV出力、バックアップ保存、バックアップ復元
