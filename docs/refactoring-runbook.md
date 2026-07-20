# 自律実行ランブック

## 1. 適用条件

ユーザーが明示的に「第2次リファクタリング計画を全Phase、デプロイ完了まで実行する」と指示した場合にのみ使用する。

単一のユーザー指示で開始してよいが、実装は必ず次の単位に分ける。

- 1 Phase
- 1 branch
- 1 pull request
- 1 CI gate
- 1 Squash merge
- 1 Pages deploy確認

一つの巨大PRに全Phaseを入れない。

## 2. 開始前確認

1. `AGENTS.md`、`docs/refactoring-plan.md`、本書を読む。
2. 利用可能なGitHub App/API/MCP/connectorを確認する。
3. `gh`が未認証でも、GitHub API経路がある限り停止しない。
4. 公開リポジトリをHTTPSでcloneする。
5. 最新`main`を取得し、SHAを記録する。
6. 作業ツリーがcleanであることを確認する。
7. `npm ci`、`npm test`、`npm run build`、`git diff --check`を実行する。
8. baseline失敗時は原因を分類する。既存コード起因の失敗を無視して開始しない。
9. open中の競合するrefactoring PRがないことを確認する。

## 3. Phase実行ループ

`docs/refactoring-plan.md`で未完了の最小番号Phaseから開始し、Phase 7まで以下を繰り返す。

### 3.1 main同期

- 直前Phaseがマージ済みであることを確認する。
- 最新mainを取得する。
- main SHAと直前のSquash SHAが一致することを確認する。
- 直前PhaseのPages deployがsuccessでない限り次へ進まない。

### 3.2 ブランチ

推奨名:

- Phase 1: `refactor/phase-1-create-request-view`
- Phase 2: `refactor/phase-2-create-request-utils`
- Phase 3: `refactor/phase-3-custom-item-editor`
- Phase 4: `refactor/phase-4-shopping-undo`
- Phase 5: `refactor/phase-5-shopping-view-selectors`
- Phase 6: `refactor/phase-6-share-execution`
- Phase 7: `refactor/phase-7-final-validation`

同名branchがある場合は、そのbranchが今回の未完了作業か確認する。無関係または古いbranchをforce更新しない。

### 3.3 実装

- active Phaseの目的、対象、禁止事項、完了条件だけを実施する。
- 他Phaseの改善点を見つけても、その場で実装しない。
- 追加課題はplanの該当結果欄に短く記録する。
- 既存テストをcharacterizationとして活用し、不足箇所にfocused testを追加する。
- 文言、CSS、DOM、ARIA、URL、storage、共有意味の差分を意図せず発生させない。

### 3.4 ローカル検証

最低限、次を実行する。

```bash
npm test
npm run build
git diff --check
```

必要に応じて対象テストを先に実行してよいが、最終的には全テストを実行する。

確認事項:

- testをskip、only、削除で回避していない
- snapshotの大規模更新で差分を隠していない
- package.json、lockfile、workflowに意図しない差分がない
- TypeScriptの型逃げとして不要な`any`や型assertionを増やしていない
- console logやdebugコードが残っていない

### 3.5 差分自己レビュー

- active Phase外のファイル変更がないか確認する。
- callback、disabled条件、key、ref、ARIA、role、tabIndexを確認する。
- async処理ではstale closure、二重実行、unmount後更新を確認する。
- timer処理ではclear条件とfake timerテストを確認する。
- pure moduleではbrowser/React依存が混入していないか確認する。
- component抽出ではDOM順序とclassNameが一致するか確認する。

問題があればPR作成前に最小修正する。

### 3.6 計画書更新

同じPR内でactive Phaseの状態を`完了`へ更新し、次を記録する。

- branch名
- PR番号（PR作成後の追記commitでもよい）
- 実装概要
- test files / test count
- build、diff check
- Pagesとsmoke結果は、マージ後に次Phaseの最初のplan更新またはPhase 7で補完してよい
- 意図的に残した負債

全体目的、不変条件、順序、他Phaseのscopeは変更しない。

### 3.7 commit・push・PR

- 意図が明確なcommitを作成する。
- API経由でremote commitを作る場合、ローカルtree SHAとの一致を確認する。
- draft PRを作成する。
- PR本文に目的、範囲、不変条件、検証、リスク、ロールバックを記載する。
- head SHAを記録する。

### 3.8 CI gate

- PR CIのrunとjobを確認する。
- queued/in_progressは成功扱いにしない。
- 同じrunを無駄に重複実行しない。
- GitHub基盤障害が明確な場合のみ、復旧後に失敗job/runを1回再実行してよい。
- test/build失敗はログを読んでactive Phaseに起因する最小修正だけを行う。
- 修正後はローカル全検証を再実行する。
- CI successになるまでready化・mergeしない。

### 3.9 ready化・merge

CI success後に次を再確認する。

- baseが`main`
- head SHAが期待値と一致
- mergeable
- mainに予期しない変更がない
- 差分がactive Phaseだけ

その後:

1. draftをreadyへ変更する。
2. 新しいrequired checkが開始された場合はsuccessまで確認する。
3. Squash mergeする。
4. Squash SHAと最新main SHAを記録する。
5. branch deletionは任意。履歴上必要なら残してよい。

### 3.10 Pages deploy gate

- マージ後mainを対象としたPages workflowを確認する。
- build job、deploy job、対象SHAを確認する。
- success以外をデプロイ完了としない。
- 基盤一時障害が明確な場合だけ1回再実行する。
- 公開URL `https://takami0928.github.io/otsukai/` がHTTP 200であることを確認する。
- 可能なら配信JSが新main由来であることをhashまたはartifactで確認する。
- consoleの重大errorが0件であることを確認する。

### 3.11 Phase smoke

active Phaseに関係する最小動線を公開サイトで確認する。

- Phase 1: 依頼作成、固定商品、自由追加商品、確認、共有画面到達
- Phase 2: 共有後復帰、戻る、入力保持、通知4種の自動テスト
- Phase 3: 自由追加商品の追加、編集、削除、単位、条件、URL復元
- Phase 4: 各状態変更、5秒通知、最新1件、Undo、再読込
- Phase 5: 売り場順、remaining/all、会計前、完了件数
- Phase 6: 依頼、相談1件/複数件、結果共有、多重実行防止
- Phase 7: plan記載の全体スモーク

実行環境で再現できないOS共有非対応分岐やLINE実送信は、自動テスト結果と未確認事項を分けて報告する。

### 3.12 次Phaseへ

- PR merged
- CI success
- Pages success
- relevant smoke success

上記4条件を満たしたら、ユーザーへの追加確認なしで次Phaseへ進む。

## 4. Phase 6の判断

Phase 6では、必ず比較を先に行う。

実装を選ぶ条件:

- 両ページのlock/busy/stale-result制御が同じ意味を持つ
- 共通hookの公開APIが小さい
- callback注入が増えすぎない
- テストが簡潔になる
- reset/unmount意味を維持できる

非実装を選ぶ条件:

- 依頼共有と買い物共有でライフサイクルが本質的に異なる
- 共通化するとmodeやsubjectの分岐がhookへ漏れる
- 既存の小さな重複より抽象化コストが大きい

非実装の場合も、plan更新だけのPhase PRを作り、比較根拠、意図的重複、将来再検討条件を記録し、CI・merge・Pages確認を通す。

## 5. 真の停止条件

次の場合だけ自律実行を停止し、成功扱いにせず詳細を報告する。

- baselineの既存test/buildが再現性をもって失敗する
- URL、storage、共有意味などの製品判断なしに解決できない矛盾が見つかった
- mainに並行変更が入り、active Phaseと実質的に競合する
- merge conflictを安全に自動解消できない
- CIがコード起因で失敗し、active Phase内の最小修正で解決できない
- GitHub API/connectorとpush経路がすべて利用不能
- Pagesがコード起因で失敗し、active Phase内で原因を特定できない
- 公開smokeで既存仕様からの回帰が見つかった

次は停止条件ではない。

- `gh`未認証
- annotated tag作成不能
- 物理iPhone/iPadがない
- LINEへの実送信ができない
- dev依存の既知audit警告
- 作業中に別Phaseの改善候補を発見した

## 6. 最終報告

Phase 7完了後、次を一つの報告にまとめる。

- 開始時main SHAと最終main SHA
- Phaseごとのbranch、PR、head SHA、CI run/result
- PhaseごとのSquash SHA
- PhaseごとのPages run/result
- 最終test files / test count、build、diff check、production audit
- 各Phaseのsmoke結果
- Phase 6の実装/非実装判断
- 公開URLと最終配信確認
- 追加機能・依存更新・rebase・force pushの有無
- 未実施の物理端末、OS共有非対応環境、LINE実送信
- 意図的に残した技術的負債
- 残件の有無
