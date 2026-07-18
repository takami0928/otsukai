# おつかいメモ

家庭内のお使い依頼を、共有URLだけで渡せるスマホファーストのWebアプリです。依頼者は商品と条件を選んでURLを作成し、お使いする人はそのURLをスマホで開いて、売り場順のリストを見ながら購入状況を記録できます。

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
- 商品状態と買えない理由は、お使い側の端末ごとの `localStorage` に保存されます
- 依頼データは商品マスターIDだけでなく、商品名やカテゴリ名などのスナップショットも含みます

サーバー、外部DB、ログイン機能は使用していません。同じ共有URLを別の端末で開いても、購入状態は同期されません。

## 購入状態と例外処理

商品ごとに次の状態を保存します。

| 状態 | 画面表示 | 意味 |
| --- | --- | --- |
| `pending` | 未購入 | まだ購入判断が終わっていない |
| `inCart` | かご済み | かごへ入れた。条件あり商品は会計前確認が必要 |
| `verified` | 条件確認済み | 条件あり商品を会計前に確認した |
| `consulting` | 相談中 | 売り切れなどについて依頼者の回答を待っている |
| `notBuying` | 今回は買わない | 理由を記録し、今回の購入対象から外した |

買えない理由は「売り切れ」「商品が見つからない」「指定条件の商品がない」「商品の状態が悪い」「その他」から選択できます。相談中の商品は回答後に、かご済み・今回は買わない・未購入のいずれかへ変更します。

## LINEなどへの共有

個別相談、一括相談、買い物結果は、ブラウザが対応している場合は Web Share API を使います。共有画面でLINEを選択してください。Web Share APIを利用できない場合は、相談文または結果文をクリップボードへコピーします。

LINE専用APIやLINEログインは使用しません。LINEで受け取った回答はアプリへ自動反映されないため、購入者が回答を確認して商品状態を変更します。

## 買い物の完了条件

「買い物を終了する」は、商品が1件以上あり、次をすべて満たした場合だけ表示されます。

- 未購入の商品が0件
- 相談中の商品が0件
- 条件ありで、かご済みのまま未確認の商品が0件

条件なし商品の `inCart`、`verified`、`notBuying` は終端状態です。全商品が終端状態になっても自動では完了画面へ移動せず、購入者が会計前チェック後に「買い物を終了する」を押します。

## localStorage

- 依頼作成中のドラフト: `otsukai:createDraft`
- 最後に作成した共有URL: `otsukai:lastSharedUrl`
- 商品状態: `otsukai:checked:${requestId}`
- かご投入順（古い順）: `otsukai:cartOrder:${requestId}`
- 買えない理由: `otsukai:itemIssues:${requestId}`

確認待ち、理由選択途中、Undo履歴、完了画面の表示状態は一時的なReact stateであり、保存しません。

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
- 依頼作成中の数量・条件・選択状態、最後に生成した共有URLも `localStorage` に保存します

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
