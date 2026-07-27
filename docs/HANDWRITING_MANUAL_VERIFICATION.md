# 手書き商品取り込み 手動検証Runbook

このRunbookは、通常のデスクトップChrome、Android Chrome、iPhone Safariで、画像前処理、Turnstile、Worker、Gemini、確認画面のどこまで到達したかを安全に切り分けるためのものです。Codexのブラウザ自動化では実画像を選択しません。

診断情報には処理段階、寸法、バイト数、HTTP status、件数だけを含めます。画像、ファイル名、商品名、alias、商品ID、`sourceText`、Turnstileトークン、APIキー、Secret、Gemini出力は記録・共有しないでください。

## 準備

1. 通常のデスクトップChromeを使います。
2. Chrome DevToolsを開きます。
3. Networkの`Preserve log`をONにします。
4. Consoleの`Preserve log`をONにします。
5. 開始スクリプトが`MANUAL TEST IS ENABLED`を表示した後、別ターミナルでスクリプトが表示した`wrangler tail`コマンドを実行します。
6. DevTools、診断パネル、Workerログから機密内容をコピーしないでください。

開始前に次を確認します。

- ローカル`main`が最新で、作業ツリーがclean
- `gh`とWranglerが認証済み
- `worker/wrangler.toml`が存在
- Worker Secret名`GEMINI_API_KEY`と`TURNSTILE_SECRET_KEY`が存在
- Repository VariablesのEndpointとTurnstile Site Keyが存在
- `ALLOWED_ORIGINS`が`https://takami0928.github.io`だけ
- Turnstile hostnameが`takami0928.github.io`だけ
- 取り込み機能と診断機能がOFF

Secretの実値を表示・読み取りしないでください。

## テスト画像の作成

元画像はGitへ追加しません。次のコマンドで、gitignore対象の`.manual-test/images`にJPEG品質90の画像を作ります。JPEGまたはPNGを指定でき、EXIF方向を可能な範囲で反映します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\create-handwriting-test-images.ps1 `
  -InputPath "C:\path\to\handwritten-note.jpg"
```

出力先を変更する場合:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\create-handwriting-test-images.ps1 `
  -InputPath "C:\path\to\handwritten-note.png" `
  -OutputDirectory "C:\private\handwriting-test-images"
```

生成物:

- `long-edge-800.jpg`
- `long-edge-1200.jpg`
- `long-edge-1600.jpg`
- `long-edge-2400.jpg`

元画像の長辺より大きい指定では拡大しません。

## 手動検証の開始

リポジトリルートの最新`main`から実行します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\start-handwriting-manual-test.ps1
```

このスクリプトは事前条件を確認してから、Workerの`DIAGNOSTIC_MODE=true`をデプロイし、次のRepository Variablesを一時的に`true`へ変更し、既存の`deploy.yml`を実行します。

- `VITE_HANDWRITING_DIAGNOSTICS_ENABLED`
- `VITE_HANDWRITING_IMPORT_ENABLED`

途中で失敗した場合は、可能な範囲で両フラグとWorker診断をOFFへ戻します。開始後は、成功・失敗にかかわらず終了スクリプトが必須です。

Pages成功後、開始スクリプトは公開HTMLとJavaScript bundleを取得し、両フラグがONで、EndpointとTurnstile Site Keyが設定されたbundleであることを確認します。この確認が完了するまで`MANUAL TEST IS ENABLED`は表示されません。表示前に`wrangler tail`やブラウザ検証を開始しないでください。

手動検証URL:

```text
https://takami0928.github.io/otsukai/?handwritingDiagnostics=1#/create
```

診断パネルは、公開ビルド変数が`true`で、かつ`handwritingDiagnostics=1`がハッシュより前のquery parameterにある場合だけ表示されます。通常URLやハッシュ内だけのqueryでは表示されません。

開始スクリプトは、デプロイした実際のWorker version IDを埋め込んだ完成済み`wrangler tail`コマンドを表示します。`MANUAL TEST IS ENABLED`が表示された後、そのコマンド全体をコピーして別ターミナルで実行してください。`<version>`や`<表示されたWorker version>`などの山括弧付き文字列をそのまま入力しないでください。

Worker診断ログは1行JSONで、`requestId`、stage、所要時間、安全なstatus・件数だけを含みます。

## テスト順序

次の順に、利用者が手動で1画像ずつ選択します。

1. `long-edge-800.jpg`
2. `long-edge-1200.jpg`
3. `long-edge-1600.jpg`
4. `long-edge-2400.jpg`
5. 元画像

各画像について次だけを記録します。

| 項目 | 記録 |
|---|---|
| タブが維持されたか | yes / no |
| ブラウザ診断の最終stage | stage名 |
| WorkerへのPOST | あり / なし |
| HTTP status | 数値または未到達 |
| Workerの最終stage | stage名または未到達 |
| 確認画面 | 到達 / 未到達 |
| 結果件数 | total / matched / ambiguous / unknown |
| 確認前のdraft | 不変 / 問題あり |
| 確認後の反映 | 成功 / 未実施 / 問題あり |
| 通常商品機能への影響 | なし / 問題あり |

商品名、読み取った内容、商品ID、画像、リクエスト本文、レスポンス本文を診断記録へ転記しないでください。

併せて確認します。

- 確認画面を開く前にdraftが変わらない
- 既存数量と条件を上書きしない
- unknownを利用者の選択後だけ自由追加できる
- キャンセルできる
- 二重実行できない
- 通常商品、自由追加、共有に回帰がない

デスクトップChromeで切り分けた後、同じ公開URLを使ってAndroid ChromeとiPhone Safariでも代表画像（まず`long-edge-1600.jpg`、問題がなければ元画像）を手動確認します。物理端末で実施していない項目は未確認として記録し、デスクトップ結果から成功を推定しません。

## 結果の判定表

| 観測結果 | 主な切り分け先 |
|---|---|
| `decode-started`で停止 | 元画像デコードまたはブラウザメモリ |
| `decode-completed`後、`canvas-render-completed`前 | Canvas描画またはブラウザメモリ |
| `preprocessing-completed`後、`turnstile-token-received`前 | Turnstileのロードまたはトークン取得 |
| `worker-request-started`だがWorkerログなし | ネットワーク、CORS、ブラウザ |
| `request-received`後、`turnstile-verified`前 | Worker入力検証またはTurnstile Siteverify |
| `gemini-request-started`後に失敗 | Gemini、無料枠、タイムアウト、SDK |
| `worker-response-received`後、`confirmation-rendered`前 | フロント結果検証または確認画面描画 |
| 小画像成功、元画像失敗 | 元画像デコード時のメモリ負荷が有力 |
| 通常Chrome成功、Codexブラウザだけ失敗 | Codexブラウザ自動化環境の問題が有力 |

ブラウザ再読み込み後も、診断パネルの「前回セッションの最終stage」で最後の安全な記録を確認できます。「診断情報をコピー」は安全なメタデータだけをJSON化し、「診断情報を消去」は診断用localStorageキーだけを削除します。

## 終了

手動検証の成否にかかわらず、必ず実行します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\stop-handwriting-manual-test.ps1
```

停止スクリプトは次を行います。

1. `VITE_HANDWRITING_IMPORT_ENABLED=false`
2. `VITE_HANDWRITING_DIAGNOSTICS_ENABLED=false`
3. 既存`deploy.yml`の実行と成功待機
4. Workerの`DIAGNOSTIC_MODE=false`で再デプロイ
5. 公開HTMLとJavaScript bundleで両機能がOFFであることを確認
6. EndpointとSite Key Variablesが残っていることを確認

最終確認:

- `VITE_HANDWRITING_IMPORT_ENABLED=false`
- `VITE_HANDWRITING_DIAGNOSTICS_ENABLED=false`
- Pages再デプロイ成功
- Worker `DIAGNOSTIC_MODE=false`
- Endpoint Variable保持
- Site Key Variable保持
- Worker Secrets保持
- Origin変更なし
- Turnstile hostname変更なし

停止処理が失敗した場合は、そのまま運用を継続せず、表示されたエラーを安全な範囲で確認してOFF復元を完了してください。
