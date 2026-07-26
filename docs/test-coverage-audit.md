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

## Phase 4：残存coverage gapと契約対称性の監査

### 開始状態

- 開始時main: `9b2b9c3654599377e39ab3199d6678865eb3193d`
- 作業開始時: clean、open PR 0件
- 45 test files / 410 tests
- Statements: 90.54%（2,173 / 2,400）
- Branches: 84.60%（1,594 / 1,884）
- Functions: 94.03%（599 / 637）
- Lines: 90.55%（2,120 / 2,341）
- build: 102 modules、成功
- production audit: 0 vulnerabilities
- `json`、`lcov`、`html` reporterをローカル監査時だけ有効にし、生成物は既存の`.gitignore`によりcommit対象外とした。

### coverage下位ファイルと判断

|ファイル|監査前Branches|監査後Branches|主な未通過箇所|分類と対応|
|---|---:|---:|---|---|
|`CreateRequestPage.tsx`|64.34%|64.34%|入力UIの個別catch、編集index不正、キャンセル分岐|D/C。主要操作はページ統合・v3 journeyで保護済み。DOM細部や上位validator後の到達不能分岐をcoverage目的で追加しない。|
|`requestBudget.ts`|66.66%|97.43%|共有直前の各入力拒否理由|A/B。title、数量、条件、自由追加件数・名称・単位、条件合計、空依頼、URL超過、payload生成失敗を直接テストした。|
|`draftLimits.ts`|72.44%|72.44%|存在しない編集index、同値更新、上位で正規化済みの分岐|C/D。利用者境界は既存のIME・書記素・数量・条件・URL境界テストで保護済み。|
|`ProductCatalogPage.tsx`|73.97%|73.97%|検索空集合、対象消失、個別catch、previewなしrestore|A/B/D。復旧JSONのbyte/文字境界、catalog保存失敗、receipt保存失敗を追加。単純表示分岐は追加しない。|
|`ShoppingListPage.tsx`|83.18%|84.40%|不正な直接handler呼出し、focus refなし、完了条件再検査guard|A/B/C。結果共有中の見直しと相談共有競合を追加し、UIから到達不能なguardは残した。|
|`compactRequest.ts`|83.23%|85.00%|v2互換用truncate、未知商品fallback、古いtailの無視|A/B/D。request key長と条件合計をproducerと一致させた。既存互換のtruncate/tail無視は維持した。|
|`compactRequestV3.ts`|84.56%|86.02%|個別の不正tuple組合せ、fallback日時|B/C。最大構造、固定fixture、条件合計1,000/1,001、重複、ID、カテゴリ、数量は保護済み。|
|`householdCatalog.ts`|83.33%|83.90%|UUID fallback/collision枯渇、存在しない商品への直接domain呼出し|A/B/C。内容同一の家庭商品保存でrevisionが進む欠陥を修正。ブラウザが通常提供しない乱数枯渇は無理に通さない。|
|`catalogStorage.ts`|87.50%|89.58%|不正receiptの一部組合せ、read例外|A/B。世代ごとのread失敗、read-back不一致、rollback中の再失敗、receipt失敗を追加。|
|`useShoppingUndoNotice.ts`|66.66%|66.66%|timer refが既に空のcleanup guard|C。4,999/5,000ms、置換、consume、request変更、unmountは既存focused testで保護済み。|
|`ShoppingToolbar.tsx`|50.00%|50.00%|フィルターlabelの反対側分岐|D。利用者フローのfilterテストがあり、文言分岐だけを増やさない。|

### 確認済み不具合

失敗する回帰テストを先に実行し、次の17 test casesが修正前に失敗することを確認した。

1. v1 decoderが0、負数、小数、安全整数外の数量を受理していた。
2. v1 decoderが空のrequest/item/product ID、不正日時、重複item/product ID、500件超の商品を受理していた。
3. v1 producerがdecoderと同じ意味検証を行っていなかった。
4. v2 producerは64文字超のrequest keyを拒否する一方、decoderは受理していた。
5. v2 producerは条件合計1,000文字超を拒否する一方、decoderは受理していた。
6. 復旧JSONは文字数上限を定義しているのに、UIが`File.size`のbyte数を同じ値と比較していた。合法なZWJ絵文字を含む195,362文字・359,442 bytesのJSONが読み込み前に拒否された。
7. household catalogのcurrent/previousを同じ`try`で読むため、一方のkeyだけが`SecurityError`になると、もう一方の正常な世代まで捨てて標準状態へ戻っていた。
8. 家庭追加商品を内容変更なしで保存しても、商品とcatalogの`updatedAt`および`revision`が進み、不要な未バックアップ状態になっていた。
9. 結果共有pending中に「買い物内容を見直す」と、古い結果noticeが買い物画面へ反映され得た。また共有lock取得失敗が無言だった。

修正は次に限定した。

- v1 producer/decoderで、非空ID、ID重複、正の安全整数数量、有効な`createdAt`、最大500 itemsを共通に検査する。過去互換のため数量20超は引き続き受理する。
- v2 decoderへrequest key 64文字と選択商品の条件合計1,000文字を適用する。
- 復旧JSONに600,000 bytesの読み込み前安全上限を設け、読み込み後は従来どおり200,000文字を厳密検査する。
- household catalogの世代を独立して読み、一方が読める場合は正常な世代を利用する。
- catalog内容比較から`createdAt`/`updatedAt`だけを除き、同内容編集をno-opにする。fingerprintと同じく利用者内容の変更だけでrevisionを進める。
- 結果共有noticeの有効性と共有lock所有期間を分ける。見直し後は古いnoticeを捨てるが、実処理完了までlockは保持する。競合する相談共有には再試行案内を表示し、完了後に共有できる。

### producer／consumer契約の対称性

|形式|producerが保証する条件|decoderが受理する条件とPhase 4判断|
|---|---|---|
|v1|`ShoppingRequestPayload` object、非空request/item/product ID、item/product ID一意、正の安全整数数量、有効日時、有限sort order、最大500 items|producerと同じvalidatorを使用。歴史的に数量上限がなかったため21、25など20超の公開済み値を維持する。title/name/unit/conditionは個別の現在UI上限を遡及適用せず、64,000 encoded / 200,000 expanded JSONの安全上限で保護する。空itemsはcodec上は維持し、UIが共有を防ぐ。|
|v2|request key 1〜64文字、固定商品0〜20、自由追加1〜20、自由追加10件、各条件30文字、条件合計1,000文字、title 30文字|request keyと選択商品の条件合計をPhase 4で一致させた。IDとitem IDは固定表/indexから決定され重複不能。過去互換のためtitle/各条件のtruncate、未知の固定商品tail無視、無効数量codeを未選択扱いする既存挙動は維持する。空itemsはproducer/decoderともcodec上は許容し、UIで共有不可。|
|v3|request key 1〜64文字、title 30文字、最大303 items、product ID一意、数量1〜20、名称30・単位10・条件30、条件合計1,000、既知category、厳密tuple|decoderも同じ上限、tuple長、ID、重複、category、条件合計を検査する。最大構造と1,000文字ちょうどを受理し1,001文字を拒否する。受信側catalogには依存しないsnapshot仕様を維持する。|
|復旧URL|version 1、正規化済みcatalog差分、有効createdAt、最大200家庭商品、UUID形式、ID一意、既知category、名称30・単位10、危険keyなし|encoded 50,000、expanded JSON 200,000文字、厳密top-level key、schema/version/date/catalog normalizerを適用する。実URL2,200文字超は切り捨てずJSONへfallbackする。|
|復旧JSON|復旧URLと同じpayloadをpretty JSONで生成|URLと同じparser/normalizerを利用する。`File.size`は600,000 bytesで先行防御し、`file.text()`後に200,000文字を再検査する。余分なfieldと危険keyは拒否する。|

固定v1/v2/v3、復旧URL、復旧JSON fixtureはすべて変更せず成功した。

### 保存・復元と非同期競合

- checked、issues、cart order、consultationsのうち複数keyが同時に失敗した場合、全失敗targetが回復するまで警告を維持することを追加テストした。
- request切替で前requestの保存失敗noticeが消える既存テストを維持した。
- legacy migrationと不正値の正規化後はsession stateが4キーへ再保存される既存ページ統合テストを確認した。
- catalogのread-back不一致ではrollbackし、rollback自体が失敗しても元のerrorを返してcomponentをcrashさせないことを追加テストした。
- catalog本体の復元成功後にbackup receiptだけが失敗した場合、catalogは復元済みだが「未バックアップ」を維持することを追加テストした。
- 結果共有中の見直しでは、実行中のWeb Shareを重複起動しない。相談内容はqueuedで保持し、共有完了後の再操作を案内する。

### テストしなかった項目と理由

- TypeScript型と上位normalizerの後でしか呼ばれない、不正index・欠落ref・default switch分岐はCとした。
- className、単純なlabel切替、装飾だけの分岐はDとし、coverage値だけのために固定しなかった。
- v1の現在UI上限（数量20、各文字数30/10、条件合計1,000）を過去URLへ遡及適用しなかった。v1は過去にこれらの上限がなく、実在し得るquantity 21/25のfixtureを明示的に維持する。
- v2のtruncateと未知tail無視は公開互換のcharacterization testがあるため厳格化しなかった。
- `window.scrollTo`例外、BFCache/`pageshow`、clipboard権限prompt、WebKit固有focus、sticky layoutはhappy-domで信頼できる再現ができない。
- 複数タブ同期は仕様判断が必要であり、Phase 1〜3で記録したlast-writer/単一タブ制約を維持した。

### coverage threshold

Vitest 4.1.9のローカル型定義とprovider実装を確認し、`coverage.thresholds`へ次を設定した。

```ts
{
  statements: 90,
  branches: 84,
  functions: 93,
  lines: 90,
}
```

開始時実測より十分に低くせず、小数点揺れに余裕を残した。全446 testsで正常に通り、監査用にbranchesを99へ一時overrideした実行がthreshold未達でexit 1になることも確認した。coverage除外は追加していない。

### 実ブラウザE2Eの判断

Playwright等の依存は追加しなかった。

- mounted `App`のhash history、request切替、StrictMode、共有世代無効化は既存happy-dom統合テストで保護されている。
- Phase 4で必要な実ブラウザ確認は、公開Pagesを実際のChromeで開くスモーク、320/360/390pxの横スクロール、dialog focus/Escape、console error確認で代替できる。
- Playwright追加はbrowser binary管理とworkflow負荷を増やす一方、今回再現した欠陥はすべて既存Vitest環境で恒久再現できた。
- 未検出のまま残る範囲は、WebKit固有focus、BFCache、実clipboard権限、OS共有先選択後、物理端末のviewport/sticky挙動である。

### 複数タブ

全面同期、`storage` event、BroadcastChannel、競合UI、タブ間lockは追加していない。現状はlast writer winsであり、同一依頼・商品リストを複数タブで同時編集すると古いタブが後から上書きし得る。回避策は単一タブ利用、将来範囲はrevision比較・競合通知・Undo整合で、優先度は中のままとする。

### 最終ローカル結果

- 45 test files / 446 tests、全成功（Phase 4で36 tests追加）
- 修正前に失敗を確認したtest cases: 17
- Statements: 91.73%（2,231 / 2,432）
- Branches: 86.11%（1,643 / 1,908）
- Functions: 94.22%（604 / 641）
- Lines: 91.77%（2,177 / 2,372）
- build: 102 modules、成功
- `git diff --check`: 成功
- production audit: 0 vulnerabilities
- 依存、lockfile、workflow、coverage除外の変更なし

### 残存リスク

1. 複数タブはlast-writer制約がある。単一タブ利用で回避でき、将来の競合仕様決定が必要（優先度: 中）。
2. WebKit、BFCache、clipboard権限、OS共有、LINE実送信はunit/component testでは検証できない。公開Chromeスモークと物理端末確認を分けて扱う（優先度: 中）。
3. v1は公開互換のため現在UIより広いquantity/textを受理する。圧縮入力・展開後JSON・item数・ID・数値意味は安全上限で保護済みで、既知の実害はない（優先度: 低）。
