# Google Apps Script backend

このフォルダは、GitHub Pages の静的ページではできない以下を補うためのバックエンドです。

- 報告データを共有スプレッドシートに保存
- 管理者パスワードをサーバー側で照合
- 管理者操作だけ編集・削除・復元を許可
- 履歴とバックアップを端末ではなくスプレッドシート側に保持

## 初期設定

1. Googleスプレッドシートを新規作成します。
2. `拡張機能 > Apps Script` を開きます。
3. `Code.gs` の内容を貼り付けます。
4. Apps Script エディタで次を一度だけ実行します。

```js
setupInitialAdminPassword('任意の8文字以上の管理者パスワード')
```

5. `デプロイ > 新しいデプロイ > ウェブアプリ` を選びます。
6. 実行ユーザーは「自分」、アクセスできるユーザーは運用方針に合わせて設定します。
7. 発行された `/exec` で終わるURLを `config.js` に設定します。

```js
window.PRODUCTION_REPORT_API_URL = 'https://script.google.com/macros/s/xxxx/exec';
```

## 注意

`config.js` が空のままだと、従来どおりブラウザ内のローカル保存で動作します。本番運用では必ずウェブアプリURLを設定してください。
