# 第2次リファクタリング計画

## 1. 目的

機能削減・統合後の現在の仕様を固定し、利用者向けの機能・表示・互換性を変えずに、以下を改善する。

- 巨大なページコンポーネントの責務分離
- 純粋処理の単体テスト容易性
- UI状態の局所化
- タイマーや非同期共有処理のライフサイクル明確化
- 今後の変更時に影響範囲を限定できる構造

機能改善、UI再設計、依存更新、URL・保存形式の変更は本計画の対象外とする。

## 2. 計画作成時の基準点

- 機能削減・統合後のmain: `30e441db5eb6eb480be88235bd3d102cf3eabccc`
- 対応PR: `#11 Simplify request and shopping interactions`
- 検証済み基準: 20 test files / 196 tests、build成功

実行開始時は必ず最新mainを取得し、その時点のSHA、テスト数、build結果を新しいベースラインとして記録する。

## 3. 全フェーズ共通の不変条件

`AGENTS.md`のProduct invariantsをすべて適用する。特に次を壊さない。

- v1/v2共有URLと公開済みリンクの復号
- 内部互換フィールドである`ShoppingRequestPayload.title`
- 商品ID表、requestKey、requestId、item ID
- 2,200文字制限とURL予算検証
- Web Share API、コピーfallback、キャンセル・失敗時の挙動
- LINE外部ブラウザ指定
- localStorageのキー、形式、正規化、保存・復元タイミング
- 日本語IMEと書記素単位の上限処理
- 相談リスト、二段階かご投入、会計前確認、完了条件、結果共有
- 最新1操作を5秒間だけ戻すUndo
- 文言、CSS、DOM順序、フォーカス、ARIA、レスポンシブ表示

## 4. 実行方針

- フェーズ順を守る。
- 1フェーズにつき1ブランチ・1PR・1 Squash mergeとする。
- 各フェーズをCI成功、mainへのマージ、Pages成功、関連スモーク確認まで完了してから次へ進む。
- フェーズ間で未マージの変更を持ち越さない。
- 各フェーズPRでこの文書の該当フェーズだけを更新する。
- 不要な抽象化は導入しない。特にPhase 6は、監査結果により「共通化しない」と判断して完了してよい。

## 5. 進捗一覧

| Phase | 内容 | 状態 | PR | 結果 |
|---|---|---|---|---|
| 0 | 実行ルールと計画書の導入 | 完了 | #12 | AGENTS.md、計画書、ランブックを導入 |
| 1 | CreateRequestPageの表示責務分割 | 完了 | #13 | 表示を5つのpresentational componentへ抽出 |
| 2 | history state・通知変換の純粋モジュール化 | 完了 | #14 | 履歴入出力と通知変換を2つのutilsへ抽出 |
| 3 | 自由追加商品エディタ状態の局所化 | 完了 | #15 | 7つの連動UI stateを専用hookへ局所化 |
| 4 | 一時Undoライフサイクルの局所化 | 完了 | #16 | 最新候補と5秒timerを専用hookへ局所化 |
| 5 | ShoppingListPage派生データのselector化 | 完了 | #17 | 売り場順・分類・filter・完了集計を純粋selector化 |
| 6 | 共有実行制御の監査と限定的整理 | 完了（非実装） | #18 | 判断B: 意味の異なる制御を意図的に維持 |
| 7 | 全体最終検証・ドキュメント確定 | 完了 | - | 全体監査、全検証、公開スモークを完了 |

### Phase 1〜6のdelivery記録

| Phase | branch | 最終head SHA | CI run | Squash SHA | Pages run |
|---|---|---|---|---|---|
| 1 | `refactor/phase-1-create-request-view` | `b3c8a48e51e86e058df6a29c83400a6e53df2952` | `29722216675` success | `245c6c9e9b204f0dfd63ae28fc4eaa64c3013e96` | `29722281349` success |
| 2 | `refactor/phase-2-create-request-utils` | `8f14c496c96c8088b0daa0ad0902bb8a464d89c9` | `29722766506` success | `654cb2a51cc659085bd1c66028696e7a26dada47` | `29722814611` success |
| 3 | `refactor/phase-3-custom-item-editor` | `46df8dc4df037e6ea1470b277cb35b7dfce895f7` | `29723165073` success | `648605abdc3663aad43b7722e4c3e50079a6e452` | `29723249513` success |
| 4 | `refactor/phase-4-shopping-undo` | `e347c68546b557df38fff3d33e4ee789d05586c6` | `29723691902` success | `4d1e40ea1aea1648a4ac022d275c5334737054b9` | `29723756940` success |
| 5 | `refactor/phase-5-shopping-view-selectors` | `65a9d573e0489af0554d263822ab3615025da076` | `29724297544` success | `4f0354093d21493691f7a59efc24e4abb7611861` | `29724357494` success |
| 6 | `refactor/phase-6-share-execution` | `c7e05a0a8249d062abd7c4c3b2cf77e3e1c46564` | `29724715526` success | `f028fbfe939704d45d3c348c3a580e7119e7e539` | `29724772524` success |

---

## Phase 1: CreateRequestPageの表示責務分割

### 目的

`CreateRequestPage`に残っている大きなJSXブロックをpresentational componentへ抽出し、親ページを状態・派生値・イベント調停に集中させる。

### 抽出候補

- `RequestLimitNotice`
- `CustomItemsSection`
- `CustomItemEditor`
- `ProductSelectionSections`
- `RequestReviewView`
- `CreateRequestBottomActions`

名称は既存命名規則に合わせて調整してよい。抽出数を増やすこと自体を目的にしない。

### 親ページに残すもの

- すべてのstate、ref、effect、memo
- URL予算計算と入力制約判定
- 自由追加商品の追加・更新・削除処理
- localStorageとhistory state
- 共有URL生成と共有実行
- edit/review遷移
- リセット処理

### 禁止事項

- custom hook化
- reducer導入
- ロジック書き換え
- 文言、CSS、DOM順序、ARIA、フォーカスの変更
- 既存コンポーネントの再インライン化

### 完了条件

- 表示責務が明確なコンポーネントへ移動している
- 親の状態・副作用・ハンドラの意味が変わっていない
- 既存テスト成功
- 必要なfocused test追加
- build、diff check成功
- 公開環境で依頼作成から共有画面到達まで確認

### 実施結果

- branch: `refactor/phase-1-create-request-view`
- PR: #13
- `RequestLimitNotice`、`CustomItemsSection`、`ProductSelectionSections`、`CreateRequestBottomActions`、`RequestReviewView`へ既存JSXを移動した。
- 親ページにはstate、ref、effect、memo、入力制約、URL予算、history、共有、リセット処理を残した。
- focused testとして警告表示のstatus/ARIA/文言と、確認画面のDOM・共有callback接続を追加した。
- 検証: 21 test files / 198 tests、build成功、`git diff --check`成功。
- CSS、文言、DOM順序、ARIA、URL、storage、共有意味は変更していない。
- Pages run `29722281349`はsuccess。公開環境で固定商品・自由追加商品・確認画面・共有画面到達とconsole error 0件を確認した。
- 意図的に残した負債: なし。

---

## Phase 2: history state・通知変換の純粋モジュール化

### 目的

Reactページ内にあるブラウザ履歴入出力と、理由・共有結果から表示通知への変換をページ外へ移す。

### 対象

候補ファイル:

- `src/utils/createRequestReturnState.ts`
- `src/utils/requestNoticeMessages.ts`

移動対象:

- history stateの型検証
- return stateのload/save/clear
- `DraftLimitReason`から利用者向け文言への変換
- `NativeShareResult`からstatus・文言への変換

### ルール

- 関数の入出力と文言を変えない
- browser API依存部分と純粋変換を混ぜない
- 単体テストを追加する
- ページは新しい関数を呼ぶだけにする

### 完了条件

- ページ内の補助関数が削減される
- history stateの不正値・部分値を含む既存挙動を維持
- 共有結果4種とlimit reasonのテストがある
- 公開環境で戻る・共有後復帰・入力保持を確認

### 実施結果

- branch: `refactor/phase-2-create-request-utils`
- PR: #14
- baseline main: `245c6c9e9b204f0dfd63ae28fc4eaa64c3013e96`
- `createRequestReturnState`へhistory stateの型検証とload/save/clearを移し、値の解析とbrowser history I/Oを別関数に分離した。
- `requestNoticeMessages`へ全limit reasonと共有結果4種の表示変換を、文言とstatusを変えずに移した。
- 不正値、部分値、壊れた自由追加商品、周辺history state保持、全通知変換のfocused testを追加した。
- 検証: 23 test files / 221 tests、build成功、`git diff --check`成功。
- URL、storage key/形式、共有意味、文言、CSS、DOM、ARIA、依存関係は変更していない。
- Pages run `29722814611`はsuccess。公開環境で共有後復帰、修正画面への戻り、入力保持とconsole error 0件を確認した。
- 意図的に残した負債: なし。

---

## Phase 3: 自由追加商品エディタ状態の局所化

### 目的

自由追加商品フォームに属する連動UI状態を、ドメインルールから分離した専用hookまたは小さなローカルreducerにまとめる。

### 局所化する状態

- フォーム開閉
- 編集対象index
- 商品名
- 数量
- 単位
- 条件
- 詳細設定開閉

候補: `src/hooks/useCustomItemEditor.ts`

### hookに入れないもの

- URL予算検証
- 文字数・数量制限のドメイン判定
- `applyCustomItemAdd/Update/Delete`
- ID生成
- localStorage
- request payload生成

### 必須操作

- 新規フォームを初期値で開く
- 既存商品を正しい値で開く
- 詳細設定の初期状態を維持
- 編集中の削除とindex補正
- 保存成功時とキャンセル時のreset
- 全消去時のreset

### 完了条件

- 親ページの自由追加商品用stateが明確に削減される
- hook単体テストまたは同等のcharacterization testがある
- 自由追加商品の新規追加、編集、削除、単位、条件、共有URL復元を公開環境で確認

### 実施結果

- branch: `refactor/phase-3-custom-item-editor`
- PR: #15
- baseline main: `654cb2a51cc659085bd1c66028696e7a26dada47`
- `useCustomItemEditor`へフォーム開閉、編集index、商品名、数量、単位、条件、詳細設定開閉を局所化した。
- 新規初期化、既存値の読込、非既定単位の詳細表示、削除時index補正、保存・キャンセル・全消去で使うresetをhookのUI操作としてまとめた。
- URL予算、文字数・数量制限、追加・更新・削除のdomain関数、ID生成、localStorage、payload生成は親ページに残した。
- hook単体testと既存ページcharacterization testで追加・編集・単位・条件・URL格納を検証した。
- 検証: 24 test files / 225 tests、build成功、`git diff --check`成功。
- 文言、CSS、DOM、ARIA、URL、storage、共有意味、依存関係は変更していない。
- Pages run `29723249513`はsuccess。公開環境で自由追加商品の追加・編集・削除、単位・条件、v2 URL復元とconsole error 0件を確認した。
- 意図的に残した負債: なし。

---

## Phase 4: 一時Undoライフサイクルの局所化

### 目的

`ShoppingListPage`にあるUndo通知、ref、5秒timer、解除処理を専用hookへ移し、実際の買い物状態復元とは分離する。

候補: `src/hooks/useShoppingUndoNotice.ts`

### hookの責務

- 最新Undo候補の保持
- 5秒timerの開始・更新・解除
- 通知表示状態
- Undo候補のconsume
- URL変更・reset・unmount時のclear

### 親に残す責務

- `ShoppingStateChange`の生成と適用
- previous cart orderの復元
- pending confirmとissue draftの整理
- 永続化
- Undo文言生成をhookへ入れるかは、型の結合が増えない場合に限る

### 完了条件

- 5秒表示、最新1件のみ、新操作で置換、Undo、URL変更、unmountの挙動を維持
- fake timerを使ったfocused testがある
- 公開環境でかご投入・相談追加・今回は買わない・条件確認とUndoを確認

### 実施結果

- branch: `refactor/phase-4-shopping-undo`
- PR: #16
- baseline main: `648605abdc3663aad43b7722e4c3e50079a6e452`
- `useShoppingUndoNotice`へ最新Undo候補、通知表示、5秒timer、置換、consume、明示clear、unmount cleanupを移した。
- 親ページには`ShoppingStateChange`生成・適用、理由・補足・かご順の復元、永続化、通知文生成、pending confirmとissue draft整理を残した。
- fake timer testで4,999ms/5,000ms境界、新操作からの再計時、最新1件のみ、consume、request変更/reset、unmountを検証した。
- 既存ページtestで二段階かご投入、理由・補足・かご順の復元、URL変更、Undoが新しいUndoを作らないことを維持した。
- 検証: 25 test files / 230 tests、build成功、`git diff --check`成功。
- 5秒仕様、文言、CSS、DOM、ARIA、URL、storage、共有意味、依存関係は変更していない。
- Pages run `29723756940`はsuccess。公開環境でかご投入、相談追加、今回は買わない、条件確認、即時Undo、5秒消去、再読込復元とconsole error 0件を確認した。
- 意図的に残した負債: なし。

---

## Phase 5: ShoppingListPage派生データのselector化

### 目的

商品分類、表示順、完了状態、カテゴリグループなどの純粋な派生計算をページ外へ移す。

候補: `src/utils/shoppingPageView.ts`

### 対象

- snapshot sort順
- 売り場順
- remaining items
- cart items
- consulting items
- not-buying items
- visible items
- grouped visible items
- completion state
- unresolved count

### ルール

- 性能最適化を目的にしない
- React hookを純粋モジュールへ持ち込まない
- 一つの巨大view modelが不明瞭なら、小さなselector群に分ける
- 既存`shoppingState`ドメイン関数を重複実装しない

### 完了条件

- 分類ルールが純粋関数としてテストされる
- `ShoppingListPage`のuseMemoと分類コードが減る
- 売り場順、フィルター、会計前表示、完了件数が変わらない
- 公開環境で全フィルターと完了フローを確認

### 実施結果

- branch: `refactor/phase-5-shopping-view-selectors`
- PR: #17
- baseline main: `4d1e40ea1aea1648a4ac022d275c5334737054b9`
- `shoppingPageView`へsnapshot順、売り場順、remaining、かご、相談中、今回は買わない、visible、カテゴリgroup、完了状態、未解決件数を純粋selectorとして抽出した。
- `getCartItemsForCheckout`、`getItemStatus`、`getShoppingCompletionState`、`compareItemsByStoreOrder`を再利用し、domainルールは重複実装していない。
- 親ページは合成selectorを1つの`useMemo`で呼び、完了確定直前の最新state再検証はイベント処理として親に残した。
- pure testで全分類、売り場順、remaining/all、会計前の逆順、カテゴリgroup、完了件数、入力配列の不変性を検証した。
- 検証: 26 test files / 233 tests、build成功、`git diff --check`成功。
- 表示順、filter、会計前表示、完了条件、文言、CSS、DOM、ARIA、URL、storage、共有意味、依存関係は変更していない。
- Pages run `29724357494`はsuccess。公開環境で売り場順、remaining/all、会計前チェック、完了件数、結果共有到達とconsole error 0件を確認した。
- 意図的に残した負債: なし。

---

## Phase 6: 共有実行制御の監査と限定的整理

### 目的

依頼共有、相談共有、結果共有にある多重実行防止、busy状態、古い非同期結果の破棄を比較し、意味を変えずに共通化できる部分だけ整理する。

### 共通化候補

- exclusive lock
- busy state
- generation/tokenによるstale result無効化
- reset/unmount時のinvalidate

### 共通化しないもの

- 共有文生成
- title/textの内容
- URL生成・保存
- 共有後の通知文
- consultation/result/request固有のUI状態
- 共有成功・コピー・キャンセル・失敗の意味

### 判断ゲート

次のいずれかを選ぶ。

A. `useExclusiveShareExecution`等の小さな専用hookで、重複と分岐が明確に減り、既存意味を保持できるため実装する。

B. 共通化により引数・callback・世代管理が複雑化するため実装せず、現状維持の理由と各経路の違いをこの文書に記録する。

BもPhase完了とする。DRYのためだけにAを選ばない。

### 監査結果: 判断B（共通hookを実装しない）

| 比較点 | 依頼共有 | 相談共有 | 結果共有 |
|---|---|---|---|
| 排他範囲 | `createRequestShareLock`による依頼共有1経路 | `activeShareRef`を結果共有と共有 | `activeShareRef`を相談共有と共有 |
| busy state | `isSharingRequest` 1つ | `isSharingConsultation` | `isSharingResult` |
| 実行前処理 | draft再検証、URL再利用/生成、2,200文字再検証、draft/history保存 | 相談中件数確認、1件/複数件の文生成 | 完了件数と見送り理由から結果文生成 |
| stale result | 世代管理なし | request URL変更時の`shareGenerationRef`で破棄 | request URL変更時の`shareGenerationRef`で破棄 |
| reset意味 | `finally`でlockと単一busyを解除 | 現在世代だけ共有lockと相談busyを解除 | 現在世代だけ共有lockと結果busyを解除 |
| 結果通知 | 依頼共有専用のstatus・文言 | 相談用subject文言 | 結果用subject文言 |

共通化すると、依頼共有だけに必要なURL準備callback、相談/結果だけに必要な共有lockと世代token、経路別busy setter、optionalなinvalidate/reset、subject別結果callbackがhookの公開APIへ流入する。単なるlockだけをhook化しても既存の小さな`createRequestShareLock`と`activeShareRef`を置き換える薄い層になり、コード・テスト・意味のいずれも単純化しない。

したがって、各ページ内の短い`try/finally`の形を意図的に残す。`shareText`がWeb Share、clipboard fallback、`AbortError`、failureの共通意味をすでに一元化しているため、それより上位のdomain固有フローは統合しない。

再検討条件は、同じ世代管理・同じbusyモデル・同じreset意味を持つ共有経路が新たに増え、公開APIを`run`・`busy`・`invalidate`程度に保ったまま分岐とtestを実際に減らせる場合とする。

### 完了条件

- Aの場合は各共有経路の多重実行、cancel、copy fallback、failure、stale resultをテスト
- Bの場合は比較結果と意図的重複の理由を記録
- 公開環境で依頼共有、相談1件・複数件、結果共有を可能な範囲で確認
- LINE実送信未実施なら明記

### 実施結果

- branch: `refactor/phase-6-share-execution`
- PR: #18
- baseline main: `4f0354093d21493691f7a59efc24e4abb7611861`
- 判断Bを採用し、source code・test codeは変更せず、比較結果と意図的重複の理由を記録した。
- 既存の共有focused testで依頼lock、title/text限定、1件/複数件相談、結果共有、多重実行防止、shared/copied/cancelled/failed、相談状態不変を確認した。
- focused検証: 4 test files / 43 tests。
- 全体検証: 26 test files / 233 tests、build成功、`git diff --check`成功。
- URL、storage、共有文、共有結果の意味、busy、世代管理、文言、CSS、DOM、ARIA、依存関係は変更していない。
- Pages run `29724772524`はsuccess。公開環境で依頼共有、相談1件・複数件、結果共有のbusy・排他制御とconsole error 0件を確認した。
- LINE実送信と物理端末のOS共有は未確認。
- 意図的に残した負債: 意味の異なる上位共有制御の短い`try/finally`重複。上記再検討条件を満たすまで維持する。

---

## Phase 7: 全体最終検証・ドキュメント確定

### 目的

全Phase後のmainを基準に、不要コード、責務境界、検証結果を確認し、本計画を完了状態へ更新する。

### 実施内容

- 未使用import、未使用export、到達不能コードの確認
- ページ・component・hook・utils間の依存方向確認
- 全テストとbuild
- `git diff --check`
- `npm audit --omit=dev`
- 全体の公開サイトスモーク
- 計画表と各Phase結果の確定

### 禁止事項

- 最終段階での追加設計変更
- npm auditを理由にした依存強制更新
- CSS再設計
- URLや保存形式の整理

### 最終スモーク

- ホームとAbout
- 依頼作成、固定商品、自由追加商品、条件、確認画面
- v2 URL生成・復元
- 共有画面到達またはcopy fallback
- 相談リスト1件・複数件
- 二段階かご投入
- 最新1操作のUndo
- フィルター
- 会計前チェックと条件確認
- 今回は買わない
- 完了と結果共有
- 再読込後のlocalStorage復元
- 320px / 360px / 390pxで重大な横スクロールなし
- console error 0件

### 実施結果

- branch: `refactor/phase-7-final-validation`
- baseline main: `f028fbfe939704d45d3c348c3a580e7119e7e539`
- 第2次リファクタリング開始時main: `c337c3c6a2f7c4c87bec4f50e72edc8d0a5aa2ca`
- TypeScriptの`strict`、`noUnusedLocals`、`noUnusedParameters`を含むbuildが成功し、未使用import・未使用ローカル・到達不能な分岐を追加していないことを確認した。
- `utils`、`hooks`、`components`から`pages`へのimport、および`utils`、`hooks`から`components`へのimportは0件で、依存方向を維持した。
- 開始時mainからの差分は計画対象の19ファイルだけで、`package.json`、`package-lock.json`、`.github`、CSS、商品・カテゴリマスターは変更していない。
- 全体検証: 26 test files / 233 tests、build成功（79 modules）、`git diff --check`成功、`npm audit --omit=dev`は0 vulnerabilities。
- 公開環境でホーム、About、固定商品、自由追加商品の追加・編集・削除、数量・単位・条件、確認画面、v2 URL生成・復元、共有画面到達、相談1件・複数件、二段階かご投入、即時Undoと5秒消去、remaining/all、会計前条件確認、今回は買わない、完了、結果共有、再読込後の進捗復元を確認した。
- 320px、360px、390pxの依頼フォームと相談・Undo表示で、`scrollWidth`が`clientWidth`を超えず、各操作ボタンが画面幅内に収まることを確認した。
- 公開サイトの重大なconsole errorは0件。
- Phase 7ではsource code・test codeを変更せず、監査と本計画の確定だけを行った。
- 追加機能、利用者向け仕様変更、依存更新、rebase、force pushは行っていない。
- 物理Android、iPhone、iPad、LINE実送信、各OSの共有先選択後の動作は未確認。
- 意図的に残した負債はPhase 6に記載した上位共有制御の短い`try/finally`重複だけで、残件はない。

## 6. 本計画外として残す事項

- v1/v2 URL統合・廃止
- `ShoppingRequestPayload.title`削除
- localStorage migration
- Context、外部store、状態機械ライブラリ
- デザイン刷新
- 商品マスター変更
- 依存パッケージの強制更新
- 物理Android、iPhone、iPad、LINEアプリの自動化不能な最終確認
