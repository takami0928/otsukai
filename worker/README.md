# 手書きメモOCR Worker

このWorkerは、GitHub Pages上のReactアプリから1枚の画像とTurnstileトークンを受け取り、Google Cloud Visionの`DOCUMENT_TEXT_DETECTION`を呼び出して、行単位の最小JSONだけを返します。

```text
React/Vite
  └─ 画像（最大2MB）+ 毎回新しいTurnstileトークン
       └─ Cloudflare Worker
            ├─ Origin/MIME/実データ/サイズ検証
            ├─ Turnstile Siteverify
            └─ Google Cloud Vision DOCUMENT_TEXT_DETECTION
                 └─ { "lines": [{ "id", "text", "confidence"? }] }
```

画像とOCR生レスポンスは保存しません。画像、OCR文字列、APIキーをログへ出さず、フロントにもGoogleの生レスポンスや生エラーを返しません。フロントは確定した商品と通常の自由追加商品だけを既存draftへ反映するため、画像、OCR生テキスト、OCR由来フラグは共有URLに入りません。

## 現在のクラウド状態を先に確認する

新しいリソースを作る前に、既存の認証・プロジェクト・課金条件を確認します。

```bash
npx wrangler whoami
gcloud auth list
gcloud config get-value project
gcloud services list --enabled --filter=vision.googleapis.com
```

Worker設定が存在する場合は、設定ファイルを指定して既存デプロイとSecret名も確認します。

```bash
npx wrangler deployments list --config worker/wrangler.toml
npx wrangler secret list --config worker/wrangler.toml
```

未認証、対象プロジェクト不明、請求先未確認の場合は先へ進めません。本リポジトリのコードだけでGoogle CloudやCloudflareの契約、請求先、APIキー、Turnstile Widgetは作成されません。

## Google Cloud Vision

運用者が対象Google Cloudプロジェクトと請求条件を確認した後、次を明示的に行います。

1. 対象プロジェクトでCloud Vision API（`vision.googleapis.com`）が利用可能か確認する。
2. 必要な場合だけCloud Vision APIを有効化する。
3. Vision APIだけにAPI制限したAPIキーを用意する。
4. Google Cloud Consoleの「割り当てとシステム上限」でリクエスト上限を確認する。
5. Billingの予算アラートを設定し、想定外の利用を監視する。

APIキーは標準の`x-goog-api-key`ヘッダーで送信します。実値を設定ファイル、GitHub、ログ、`VITE_`環境変数へ入れないでください。Googleの現在の料金と無料利用枠は変更される可能性があるため、デプロイ前に[Cloud Vision pricing](https://cloud.google.com/vision/pricing)とGoogle Cloud Consoleで確認します。

`GOOGLE_VISION_LANGUAGE_HINTS`はカンマ区切りです。空文字列なら自動判定となり、初期設定は空です。言語を固定する必要がある場合だけ、Google Visionが受け付ける言語コードを設定します。

## Cloudflare Turnstile

Cloudflare Dashboardで既存Widgetの再利用可否を確認します。新規Widgetが必要な場合は、運用者の明示操作で次を設定します。

- Widget mode: Managed
- 許可hostname: `takami0928.github.io`（ローカル用は別Widgetを推奨）
- Site Key: 公開値としてフロントへ設定
- Secret Key: Worker Secretとして設定

フロントはSPA向けの明示レンダリングと`execution: "execute"`を使い、actionを`handwriting_ocr`に固定します。WorkerはSiteverifyの`success`だけでなく、actionとOrigin由来hostnameも照合します。トークンは5分で失効し1回しか検証できないため、毎リクエスト取得し、完了・失敗・キャンセル後にWidgetをリセットします。

## Worker設定

例をコピーします。`worker/wrangler.toml`と`worker/.dev.vars`はgit管理対象外です。

```bash
cp worker/wrangler.toml.example worker/wrangler.toml
cp worker/.dev.vars.example worker/.dev.vars
```

PowerShellでは次を使用できます。

```powershell
Copy-Item worker/wrangler.toml.example worker/wrangler.toml
Copy-Item worker/.dev.vars.example worker/.dev.vars
```

本番Secretは対話入力で設定します。

```bash
npx wrangler secret put GOOGLE_VISION_API_KEY --config worker/wrangler.toml
npx wrangler secret put TURNSTILE_SECRET_KEY --config worker/wrangler.toml
```

`ALLOWED_ORIGINS`にはOriginを完全一致でカンマ区切り指定します。本番例は`https://takami0928.github.io`です。パスや末尾スラッシュは含めません。CORSはブラウザ制御であり認証ではないため、Workerは許可Originに加えてTurnstileを毎回検証します。

## ローカル開発

```bash
npm ci
npm run test:worker
npm run typecheck:worker
npm run worker:dev
```

フロントはルートの`.env.example`を`.env.local`へコピーし、ローカルWorker URL、ローカル用Turnstile Site Key、`VITE_HANDWRITING_IMPORT_ENABLED=true`を設定して`npm run dev`で起動します。Secretを`VITE_`へ入れないでください。

## 本番デプロイ

認証、既存プロジェクト、Secret、Google Vision利用可否、料金条件が揃っている場合だけ実施します。

```bash
npm test
npm run build
npm run worker:deploy
```

デプロイ後、Worker URLをGitHub Repository Variablesの`VITE_OCR_ENDPOINT`へ、公開Site Keyを`VITE_TURNSTILE_SITE_KEY`へ設定します。最後に`VITE_HANDWRITING_IMPORT_ENABLED=true`を設定し、Pages workflowを実行します。GitHub Actions SecretsではなくRepository Variablesでよいのは、これら3値がブラウザへ公開される値だからです。

## 障害時の無効化

最短の停止方法はRepository Variable `VITE_HANDWRITING_IMPORT_ENABLED=false`へ変更してPagesを再デプロイすることです。エンドポイントまたはSite Keyを未設定にしてもUIは安全に非表示になります。OCR障害時も通常の商品選択、依頼共有、買い物画面は動作し続けます。

Worker側では、必要に応じてCloudflareの利用量制限やWAF/Rate Limitingの利用可否を現在の契約で確認し、Google Cloud側ではVision APIのquotaと予算アラートを確認します。有料機能を前提にせず、契約変更前に必ず運用者の承認を得てください。

## セキュリティ制約

- POST、`multipart/form-data`、1画像だけを許可
- JPEG/PNG/WebPを宣言MIMEとマジックバイトの双方で確認
- 画像は最大2MB、リクエスト全体は境界情報を含む小さな余裕だけ許可
- 許可Originを完全一致で確認
- Turnstileを毎回Siteverifyし、actionとhostnameも確認
- 外部通信を15秒で中断
- Googleの生レスポンス、生エラー、内部URL、Secretを返さない
- `Cache-Control: no-store`
- 画像、OCR文字列、Secretをログへ出さない

## PaddleOCR.jsへの交換点

フロントの照合・確認UIは`HandwritingOcrProvider`だけに依存します。

```ts
export interface HandwritingOcrProvider {
  recognizeProductLines(
    image: Blob,
    options?: { signal?: AbortSignal },
  ): Promise<OcrLine[]>
}
```

将来PaddleOCR.jsを導入する場合は、このinterfaceを実装して`HandwritingImportSection`へ注入します。正規化、別名、類似候補、確認、一括draft反映は変更不要です。今回PaddleOCR.js本体は依存に含めていません。
