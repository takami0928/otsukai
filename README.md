# おつかいメモ

家庭内のお使い依頼を、共有URLだけで渡せるスマホファーストのWebアプリです。依頼者は商品を選んでURLを作成し、お使いする人はそのURLをスマホで開いて、売り場順のリストを見ながら買った商品をタップで消し込めます。

## 技術スタック

- React
- TypeScript
- Vite
- localStorage
- `lz-string`
- GitHub Pages
- GitHub Actions

## 共有URL方式

このアプリはDBを使いません。依頼データは作成時に JSON 化し、圧縮して URL に埋め込みます。

- 依頼後の内容修正は共有URLに反映されません
- リアルタイム同期はできません
- 消し込み状態はお使い側の端末ごとの `localStorage` に保存されます
- 依頼データは商品マスターIDだけでなく、商品名やカテゴリ名などのスナップショットも含みます

## ローカル起動手順

```bash
npm install
npm run dev
```

ブラウザで表示されたローカルURLを開いて確認してください。

## ビルド手順

```bash
npm run build
```

## GitHub Pages 公開手順

1. GitHub リポジトリのデフォルトブランチを `main` にします。
2. このリポジトリを GitHub に push します。
3. GitHub の `Settings > Pages` を開きます。
4. `Build and deployment` の `Source` を `GitHub Actions` に変更します。
5. `main` への push で `.github/workflows/deploy.yml` が実行され、`dist` が Pages に公開されます。

この workflow では、GitHub リポジトリ名に合わせて `BASE_PATH=/{repository-name}/` をビルド時に設定します。ユーザー/組織ページとして `https://{username}.github.io/` に出す場合は、`BASE_PATH=/` を使う構成に変更してください。

## 開発メモ

- 画面遷移は GitHub Pages で壊れにくい hash 方式です
- お使いリストURLは `#/list?data=...` 形式です
- 不正なURLを開いても真っ白にならないよう、復元失敗時はエラー画面を表示します
- 依頼作成中の数量・メモ・選択状態、最後に生成した共有URLも `localStorage` に保存します

## Supabase 版に移行する場合の拡張方針

- `src/types/shopping.ts` の依頼型はそのまま流用し、URL埋め込みの代わりに DB 永続化へ差し替える
- `src/utils/encodeRequest.ts` はURL共有専用として残し、Supabase 用の repository / API 層を別追加する
- `src/utils/storage.ts` のローカル永続化は、依頼ドラフトやオフライン補助用途に限定する
- `src/pages/CreateRequestPage.tsx` の共有URL生成処理を、作成API呼び出しへ差し替える
- `src/pages/ShoppingListPage.tsx` の読み込み元を URL 復元から `requestId` ベース取得へ変更する

## 今回やらないこと

- Supabase / Firebase 接続
- ログイン認証
- 家族アカウント
- 商品画像アップロード
- 外部画像取得
- リアルタイム同期
- 完全オフライン同期
- 価格管理
- 在庫管理
- 家計簿連携
- レシピ提案
