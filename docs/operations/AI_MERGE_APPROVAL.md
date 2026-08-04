# AIによる承認済みPRのmerge実行ポリシー

Status: approved direction, implementation tracked by Issue #58

## 目的

実装・レビューを行うAIが自分の判断で変更を取り込むことを禁止したまま、権限を持つ人間が明示的に承認したPull Requestについては、GitHub接続を持つ操作役AIがmerge操作を代行できるようにする。

本書は、Pull Requestのmerge実行主体に関する限り、`AI_AGENT_POLICY.md`、`OPERATING_MODEL.md`、`PAID_BETA_READINESS.md`、`SECURITY.md`に残る「mergeは人間が自分で実行する」「AIは承認後もmergeしない」という記述を上書きする。Issue #58で各文書と`AGENTS.md`へ統合するまで、本書をmerge実行の優先規約とする。

Production反映、外部設定、Secret、課金、顧客連絡、利用者データ操作等については上書きしない。これらは従来どおりAIが実行してはならない。

## 役割分離

### 実装・レビューAI

Codex等の実装・レビューAIは次までで停止する。

- 計画
- 専用ブランチ
- 実装
- テスト
- Draft PR
- レビュー
- 修正案
- rollback案
- merge可否の判断材料

実装・レビューAIは、自分が作成またはレビューしたPRを自ら承認したり、無承認でmergeしたりしない。

### 操作役AI

GitHubのmerge権限を持つChatGPT等の操作役AIは、以下の全条件を満たす場合だけ、承認されたPRのmerge操作を代行できる。

## 必須条件

1. 権限を持つ人間が、対象PRのmergeを明示的に承認している。
2. 承認対象のリポジトリ、PR番号、base branch、head SHAが特定されている。
3. 操作役AIがmerge直前にPR番号、base、現在head SHA、Draft状態、mergeable状態、必須CI結果を再取得する。
4. 承認時点またはmerge直前に示したhead SHAから変更がない。
5. 必要な独立レビューがexact base/headに対して完了している。
6. 必須CIが成功している。
7. 未解決P0、P1、または非免除条件へ影響するP2がない。
8. 指定されたmerge methodを使用する。指定がない場合はリポジトリ標準のSquash mergeを使用する。
9. GitHub APIの`expected_head_sha`等を使用し、head移動時にmergeを失敗させる。
10. branch protection、required checks、review gateを迂回しない。

人間の承認は、操作役AIが対象PRと現在head SHAを提示した後の明示的な返答を原則とする。承認後にbase、head、差分、必須CI、最終レビュー結果のいずれかが変化した場合、その承認は失効し、再承認を必要とする。

## 禁止事項

明示承認があっても、操作役AIは次を行わない。

- auto-mergeの有効化
- merge queueへの投入
- branch protectionやrequired checksの回避
- 失敗したCIや未完了レビューを無視したmerge
- 承認対象と異なるPRまたはheadのmerge
- mergeと同時のProduction deploy
- Production workflowの起動、承認、再実行
- Cloudflare、DNS、GitHub Environment、Secrets、Variables、billingの変更
- migration
- 顧客、参加者、報告者への送信
- 課金、返金、解約
- 利用者データの取得、削除、復旧
- セキュリティ事故の公表・通知
- 規約や法的表示の確定・公開

## merge後の記録

操作役AIはmerge後に次を報告する。

- repository
- PR番号
- merge method
- merged head SHA
- 作成されたmain側commit SHA
- merge結果
- Production反映を行っていないこと
- 次に必要な人間判断またはCodex作業

## Productionとの分離

PRのmerge承認は、Production反映の承認ではない。

- mainへのmergeとProduction反映を別操作にする。
- Production反映は別の明示承認を必要とする。
- 有料βまでのProduction反映、migration、外部設定変更は権限を持つ人間が実行する。
- 操作役AIはProduction用の手順と確認項目を提示して停止する。

## 今回のbootstrap

PR #57は、本規約作成前に、リポジトリ所有者から明示された一回限りの指示に基づき、最終レビュー済みheadを`expected_head_sha`で固定して操作役AIがSquash mergeした。この事例は、今後のPRについてhead確認や再承認を省略する根拠にはしない。
