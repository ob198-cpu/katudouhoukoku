# Google Apps Script backend

このフォルダは、GitHub Pages の静的ページではできない以下を補うためのバックエンドです。

- 報告データを共有スプレッドシートに保存
- 管理者パスワードをサーバー側で照合
- 管理者操作だけ編集・削除・復元を許可
- 報告・項目・操作履歴を端末ではなくスプレッドシート側に保持

## 初期設定

このバックエンドは次のスプレッドシートに保存します。

```text
https://docs.google.com/spreadsheets/d/1QMvmHhMYTp1-eJ_DEZn6wlUyBtCTe5C4h4rn1N9wZHQ/edit
```

`backend/Code.gs` の `SPREADSHEET_ID` を変更すると保存先を変更できます。

## 初期設定

1. `clasp push -f` で `backend/Code.gs` と `backend/appsscript.json` をApps Scriptへ反映します。
2. ウェブアプリとしてデプロイし、`/exec` で終わるURLを `config.js` に設定します。
3. Apps Script エディタで権限承認を行います。
4. 管理者画面をクラウド運用する場合は、Apps Script エディタで次を一度だけ実行します。

```js
setupInitialAdminPassword('任意の4文字以上の管理者パスワード')
```

現在のWebアプリURL:

```text
https://script.google.com/macros/s/AKfycbwdsedtEdaD_5JQjSZoSZIkgN2jP3XjchuSm65D_2ZoV_OKxf-GWkN5-4s6jKeFyFS3pg/exec
```

## 注意

`config.js` が空のままだと、従来どおりブラウザ内のローカル保存で動作します。本番運用では必ずウェブアプリURLを設定してください。
WebアプリURLがHTMLのログイン画面やアクセス拒否画面を返す場合は、Apps Scriptの初回承認または公開設定が未完了です。
