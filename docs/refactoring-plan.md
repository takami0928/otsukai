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
| 1 | CreateRequestPageの表示責務分割 | 完了 | 作成後追記 | 表示を5つのpresentational componentへ抽出 |
| 2 | history state・通知変換の純粋モジュール化 | 未着手 | - | - |
| 3 | 自由追加商品エディタ状態の局所化 | 未着手 | - | - |
| 4 | 一時Undoライフサイクルの局所化 | 未着手 | - | - |
| 5 | ShoppingListPage派生データのselector化 | 未着手 | - | - |
| 6 | 共有実行制御の監査と限定的整理 | 未着手 | - | - |
| 7 | 全体最終検証・ドキュメント確定 | 未着手 | - | - |

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
- PR: 作成後追記
- `RequestLimitNotice`、`CustomItemsSection`、`ProductSelectionSections`、`CreateRequestBottomActions`、`RequestReviewView`へ既存JSXを移動した。
- 親ページにはstate、ref、effect、memo、入力制約、URL予算、history、共有、リセット処理を残した。
- focused testとして警告表示のstatus/ARIA/文言と、確認画面のDOM・共有callback接続を追加した。
- 検証: 21 test files / 198 tests、build成功、`git diff --check`成功。
- CSS、文言、DOM順序、ARIA、URL、storage、共有意味は変更していない。
- Pagesと公開スモーク結果はマージ後に後続Phaseの記録で補完する。
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

### 完了条件

- Aの場合は各共有経路の多重実行、cancel、copy fallback、failure、stale resultをテスト
- Bの場合は比較結果と意図的重複の理由を記録
- 公開環境で依頼共有、相談1件・複数件、結果共有を可能な範囲で確認
- LINE実送信未実施なら明記

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

## 6. 本計画外として残す事項

- v1/v2 URL統合・廃止
- `ShoppingRequestPayload.title`削除
- localStorage migration
- Context、外部store、状態機械ライブラリ
- デザイン刷新
- 商品マスター変更
- 依存パッケージの強制更新
- 物理Android、iPhone、iPad、LINEアプリの自動化不能な最終確認
