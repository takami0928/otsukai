# テスト網羅性再監査

## 監査基準

- 開始時 `main`: `c32b16fd9b4ce1a24fa68737327506bec102f6e7`
- 開始時テスト: 39 files / 332 tests
- 開始時build: 101 modules、成功
- production audit: 0 vulnerabilities
- 分類:
  - A: 失敗する回帰テストで再現した確認済み不具合
  - B: 現状は正常だが重要な分岐が未網羅
  - C: 製品仕様の判断なしには変更できない設計リスク

## 実装とテストの対応監査

|領域|既存の主な保護|監査で確認した不足|分類|対応PR|
|---|---|---|---|---|
|結果共有|native share、copy fallback、二重実行防止|cancelled/failed時の結果専用文言、失敗後の再試行、route切替・unmount中の完了|A/B|PR 1 / PR 2|
|v1/v2/v3 decoder|固定fixture、round-trip、不正形式|圧縮入力と展開後JSONのサイズ境界、圧縮爆弾|A|PR 1|
|買い物進捗保存|4キーの正常保存、request分離|一部キーの保存失敗、利用者通知、回復、SecurityError|A|PR 1|
|v3 end-to-end|encoder/decoderと各ページの個別テスト|作成から買い物完了・再mountまでを結ぶ経路|B|PR 2|
|公開形式fixture|v1/v2固定fixture|v3、カタログ復旧URL/JSONの固定fixture|B|PR 2|
|mounted App routing|route parser|hashchange、back/forward相当、StrictMode、session UIのリセット|B|PR 2|
|依頼共有|共有utilityのlock|ページ上のpending連打、route離脱後の完了無効化|B|PR 2|
|買い物状態|主要遷移とUndo例|全statusの表形式不変条件、他request IDの除外|B/A|PR 3|
|ShoppingDialog|実装上のfocus trap、Escape、scroll lock|キーボード・backdrop・focus復元のcomponent test|B|PR 3|
|商品カタログ復旧|parser正常/異常、UI正常復元|file異常、危険キー、保存失敗時のUI不変|B|PR 3|

## PR 1で再現した確認済み不具合

1. 結果共有をキャンセルまたは共有・copyとも失敗した際に、「相談内容はそのまま残しています」と誤表示していた。
2. v1/v2/v3の依頼decoderは、圧縮入力および展開後JSONのサイズを検査せず `JSON.parse` へ進んでいた。
3. checked state、item issues、cart order、consultationsの保存失敗は `console.warn` のみで、利用者には成功したように見えていた。

PR 1では、失敗する回帰テストを先に追加して上記を再現した。v3の構造上限303商品を最大長ID・名称・単位と条件合計1,000文字で低圧縮データ化した実測値は、展開後JSON 57,868文字、encoded 51,176文字だった。公開配送URLの2,200文字制限を維持しつつ、decoder側は最大構造と過去データへ余裕を持たせてencoded 64,000文字、展開後JSON 200,000文字を上限とした。後続PRで固定fixtureと公開形式を再検証する。

## PR 3で再現した確認済み不具合

買い物セッション復元時、consultationsは依頼内の商品IDへ絞り込まれていた一方、checked state、item issues、cart orderは現在のpayloadに存在しない商品IDを保持していた。失敗する回帰テストでは、別依頼由来の`inCart`と`notBuying`、理由、かご順がそのまま復元されることを確認した。

復元直後にpayloadの商品ID集合でchecked stateとitem issuesを絞り込み、cart orderも同じ集合と購入状態の両方を満たすIDだけへ限定した。URL形式、保存キー、保存値、正常な復元動作は変更していない。

## 仕様判断を要する設計リスク

### 複数タブでの同時編集

現行実装は買い物状態と家庭用商品リストをタブ間で同期せず、最後に保存したタブの値が残る。2つの独立した買い物session hookで同じrequestIdを開くcharacterization testを追加し、先のsessionが保存した`milk: inCart`が、古いstateを持つ後のsessionによる`eggs: notBuying`の保存で置き換わることを確認した。自動同期や競合解決は保存タイミングと利用者向け仕様を変えるため、今回の回帰修正には含めない。

- 想定被害: 同じ依頼または商品リストを複数タブで同時編集した場合、古いタブの操作が新しい保存を上書きし得る。
- 現行回避策: 同一依頼・商品リストは1タブで操作する。
- 将来の検討範囲: `storage` event、revision比較、競合時の利用者選択、Undoとの整合。
- 優先度: 中（単一タブ利用では発生しない）。

## PR 2の回帰保護

- v1/v2/v3、商品カタログ復旧URL、商品カタログ復旧JSONを固定文字列fixtureとして保存した。テスト実行時にencoderで生成せず、requestId、item ID、snapshot、単位、カテゴリ、数量、条件、sortOrder、createdAt、override、家庭追加商品IDを明示的に検証する。
- `App`を実mountし、home → create → compact v3、legacy v1、v2、request A/B、不正URLとの往復、browser back/forward、scroll reset、unmount後のlistener停止を検証する。
- request変更時に以前のUndo、相談dialog、完了画面、share noticeが残らないことを検証する。
- React StrictModeで、1回のかご操作と結果共有が重複保存・重複共有にならないことを検証する。
- 結果共有pending中のrequest切替・unmount後の完了を無視し、新requestで再共有できることを検証する。
- 依頼共有pending中の連打、cancelled/failed後の再試行、route離脱後の古い完了無視、同一内容URL再利用、内容変更後の新requestIdを検証する。
- v3の標準商品、編集済み基準商品、家庭追加商品、一回限り商品、数量2以上、条件あり、送受信カタログ差を一つの買い物経路で開き、再mount、会計前、完了、結果共有まで検証する。
- hidden selected商品、家庭追加商品、通常商品、一回限り商品を同じ依頼作成レビューとv3 decodeへ通す。

PR 2終了時点のcoverageは statements 89.35%、branches 83.31%、functions 93.70%、lines 89.34%（44 files / 366 tests）。このPRで新しい製品不具合は再現せず、分類Bの回帰リスクを恒久テスト化した。

## PR 3の回帰保護

- `pending`、`inCart`、`verified`、`consulting`、`notBuying`の異なる全20遷移をtable-driven testで実行し、状態、理由、かご順、重複防止とUndoによる完全復元を検証する。
- 同一状態・同一issueのno-op、同一状態でのissue変更、不正issueを保存しない正規化を検証する。
- payload外の商品IDをchecked state、item issues、cart orderから除外する失敗回帰テストを追加し、復元処理を修正する。
- `ShoppingDialog`の前後Tab循環、disabled除外、focus対象なし、backdrop、内部mousedown、Escape、元focusとbody overflowの復元、listener cleanupを検証する。
- 商品カタログ復旧UIで、ファイル未選択、サイズ超過、`file.text()`失敗、不正JSON、未知version、危険キー、古いデータ警告、preview cancelを検証する。
- 復旧リンクとJSONの両方でlocalStorage保存失敗時にpreviewと現在catalogを維持し、正常復元時だけbackup receiptを記録することを検証する。
- 複数sessionのlast-writer動作を再現し、製品判断が必要な分類Cとして単一タブ制約を記録する。

PR 3のローカル検証時点は45 files / 410 testsで、coverageは statements 90.54%、branches 84.60%、functions 94.03%、lines 90.55%。全テスト、build（102 modules）、diff check、production auditが成功した。
