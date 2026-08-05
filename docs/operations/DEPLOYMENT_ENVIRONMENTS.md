# Build・staging artifact・Production境界

Status: Issue #59 Phase 3A-1 repository contract

## 対象範囲

本書は、現在のGitHub Pages serviceを維持したまま、環境別buildとProduction triggerを
分離するrepository内契約を定義する。Cloudflare Pages project、domain、DNS、GitHub
Environment protection、Repository Variables / Secrets、Worker、migrationは変更しない。

家庭マスタのorigin間移行はIssue #59の後続Phase 3A unitへ延期する。本変更はcatalogの
localStorage key、保存shape、export/import UI、復旧codecを変更しない。

## Build target

| Target | `BUILD_TARGET` | `BASE_PATH` | Public origin | 用途 |
| --- | --- | --- | --- | --- |
| GitHub Pages | `github-pages` | `/otsukai/` | `VITE_PUBLIC_APP_ORIGIN`未指定時は実行中origin | 現行serviceのProduction build |
| Cloudflare Pages互換 | `cloudflare-pages` | `/` | domain未選定の間は未指定 | PRごとの非deploy staging artifact |

target未指定時のVite既定値は従来どおり`/`である。明示targetと矛盾するbase、先頭または
末尾`/`が欠けるbase、未知target、不正なpublic originはbuild時に拒否する。

`VITE_PUBLIC_APP_ORIGIN`は公開値だけを扱う任意設定である。HTTPS origin、またはlocal
development用のlocalhost HTTP originだけを受理し、path、query、fragment、credentialsを
含めない。未選定の将来domainをrepositoryへ仮置きしない。

API endpoint、Turnstile Site Key、feature flagsは既存のclient向け公開設定を使用する。
Secretを`VITE_`変数へ置かない。不正または不足したendpoint / Site Keyでは補助機能を
fail closedとし、通常の写真、v5、手書き、manual validation flagsはOFFを維持する。

## 自動staging artifact

Pull Requestでは`.github/workflows/verify-pr.yml`の`staging-artifact` jobが次を行う。

1. `github.event.pull_request.head.sha`をexact checkoutする。
2. public origin、API endpoint、Site Keyを空、通常feature flagsをOFFとして`/` buildする。
3. allowlist済みmetadataへexact source SHA、target、base、設定有無、OFF flag状態だけを書く。
4. `cloudflare-pages-root-<exact SHA>`という名前で`dist`をuploadする。

このjobの権限は`contents: read`であり、Secrets、Production credential、Cloudflare account、
project、bindingを使用しない。GitHub Pages deploy、Cloudflare deploy、Production workflow
dispatch、`workflow_run` chainを行わない。artifactの存在や成功はProduction承認ではない。

## Production workflow

`.github/workflows/deploy.yml`は`workflow_dispatch`だけをtriggerとし、`push` triggerを持たない。
必須inputのlowercase 40文字commit SHAを検証し、そのexact commitをcheckoutした後、`HEAD`を
再照合して`/otsukai/`をbuildする。moving branchだけをProduction identityにしない。

deploy jobは`github-pages` GitHub Environmentを使用する。ただしworkflow内の
`environment:`は、required reviewers、wait timer、deployment branch rule等の外部設定が
構成済みである証拠ではない。それらはrepository外のGitHub設定であり、本PRは作成も変更も
しない。Production dispatch、approval、rerun、deployは権限を持つ人間だけが別途判断して
実行する。merge承認はProduction承認ではない。

手書きmanual validationのrepository / manual-on / manual-off deployment-state契約は維持する。
CLIは対象refをexact SHAへ解決し、そのSHAをworkflow inputと公開deployment-state manifestの
両方へ結び付ける。

## 将来のCloudflare Pages / DNS

本artifactは将来のCloudflare Pages projectへ配置可能なroot buildにすぎない。project作成、
preview/Production domain、custom domain、DNS、Turnstile hostname、Worker
`ALLOWED_ORIGINS`、Repository Variable / Secretは後続Phase 3Bの人間承認・人間実行事項である。
本PRのmergeだけでいずれも変更されない。

## Rollback

### 1. Repository workflow / configuration PRを戻す

問題のあるrepository変更は、対象PRを打ち消す通常のrevert PRとして準備し、同じCI、exact
base/head独立レビュー、人間のmerge承認を通す。revertのmerge自体もProduction deployを
開始しない。workflow fileだけを過去branchからcopy、cherry-pick、force-pushしない。

### 2. 検証済みGitHub Pages commitを再deployする

権限を持つ人間が、別のProduction承認で以前に検証したexact commit SHAを選び、現在の
manual Production workflowへ入力し、GitHub Environment protectionとartifact identityを
確認して実行する。これはAIへのdispatch、approval、rerun、deploy許可ではない。Codexは
候補SHA、事前確認、事後確認を準備できるが、Production workflowを操作しない。

### 3. Cloudflare Pages移行を放棄する

Cloudflare project / DNS変更前なら、root staging artifactの利用を停止し、現行GitHub Pages
`/otsukai/` serviceとmanual Production workflowをそのまま維持する。staging artifactを
削除したり、現行Pagesを停止したりする必要はない。外部設定後の撤回はPhase 3Bの個別
rollback計画と人間承認に従い、本書を外部操作の許可として使用しない。
