type HomePageProps = {
  onStartCreate: () => void
}

export function HomePage({ onStartCreate }: HomePageProps) {
  return (
    <main className="page">
      <section className="hero-card">
        <p className="eyebrow">URL共有で使う、家庭向けおつかいアプリ</p>
        <h1>おつかいメモ</h1>
        <p className="lead">
          商品をタップして依頼URLを作成し、そのURLを開いた人が売り場順リストを見ながら消し込めます。
        </p>
        <button type="button" className="primary-button large-button" onClick={onStartCreate}>
          依頼を作る
        </button>
      </section>

      <section className="info-card">
        <h2>使い方</h2>
        <ol className="steps-list">
          <li>依頼者が商品と数量を選ぶ</li>
          <li>共有URLを作って LINE などで送る</li>
          <li>お使いする人がスマホで URL を開く</li>
          <li>買った商品をタップして一覧から消す</li>
        </ol>
      </section>

      <section className="info-card muted-card">
        <h2>今回の仕様</h2>
        <p>サーバーや外部DBは使わず、依頼データは URL に埋め込まれます。</p>
        <p>消し込み状態は、お使い側の端末の localStorage に保存されます。</p>
      </section>
    </main>
  )
}
