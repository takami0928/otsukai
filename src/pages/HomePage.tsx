import { CatalogBackupStatus } from '../components/CatalogBackupStatus'
import { useHouseholdCatalog } from '../hooks/useHouseholdCatalog'

type HomePageProps = {
  onStartCreate: () => void
  onOpenProducts: () => void
  onOpenAbout: () => void
}

export function HomePage({
  onStartCreate,
  onOpenProducts,
  onOpenAbout,
}: HomePageProps) {
  const { catalog, backupStatus, confirmCatalogBackup } =
    useHouseholdCatalog()

  return (
    <main className="page">
      <section className="hero-card">
        <p className="eyebrow">URL共有で使う、家庭向けおつかいアプリ</p>
        <h1>おつかいメモ</h1>
        <p className="lead">
          商品の数量と条件から依頼URLを作成し、そのURLを開いた人が売り場順リストを見ながら購入状況を記録できます。
        </p>
        <button type="button" className="primary-button large-button" onClick={onStartCreate}>
          依頼を作る
        </button>
        <button
          type="button"
          className="secondary-button large-button"
          onClick={onOpenProducts}
        >
          商品リストを編集
        </button>
        <button type="button" className="ghost-button large-button" onClick={onOpenAbout}>
          このアプリについて
        </button>
      </section>

      {backupStatus === 'unbacked' ? (
        <CatalogBackupStatus
          catalog={catalog}
          backupStatus={backupStatus}
          compact
          onConfirmBackup={confirmCatalogBackup}
        />
      ) : null}

      <section className="info-card">
        <h2>使い方</h2>
        <ol className="steps-list">
          <li>依頼者が商品と数量を選ぶ</li>
          <li>共有URLを作って LINE などで送る</li>
          <li>お使いする人がスマホで URL を開く</li>
          <li>必要な数量と条件を確認してかご投入を記録し、迷った商品は相談する</li>
          <li>会計前に未処理や未解決の相談を確認し、結果を共有する</li>
        </ol>
      </section>
    </main>
  )
}
