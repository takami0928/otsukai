import { getLiveRequestConfig } from '../features/liveRequests/config'

type AboutPageProps = {
  onBackHome: () => void
  liveRequestsEnabled?: boolean
}

export function AboutPage({
  onBackHome,
  liveRequestsEnabled = getLiveRequestConfig().enabled,
}: AboutPageProps) {
  return (
    <main className="page">
      <section className="top-bar">
        <button type="button" className="ghost-button" onClick={onBackHome}>
          ホームへ
        </button>
        <div>
          <p className="eyebrow">おつかいメモ</p>
          <h1>このアプリについて</h1>
        </div>
      </section>

      <section className="info-card about-card">
        <h2>依頼内容</h2>
        {liveRequestsEnabled ? (
          <>
            <p>通常の固定依頼は、依頼内容が共有URLに含まれています。</p>
            <p>
              更新可能な依頼は、依頼内容を共有時から14日間だけ保存し、期限を延長しません。
            </p>
          </>
        ) : (
          <p>依頼内容は共有URLに含まれています。</p>
        )}
      </section>

      <section className="info-card about-card">
        <h2>買い物の進捗</h2>
        <p>
          買い物の進捗は、操作している端末とブラウザ内（localStorage）に保存されます。
        </p>
        <p>別の端末や別のブラウザでは、進捗が引き継がれない場合があります。</p>
        <p>
          LINE内ブラウザとChrome・Safariなどの外部ブラウザでは、保存された進捗が共有されない場合があります。
        </p>
      </section>

      <section className="info-card about-card">
        <h2>アカウントとサーバー</h2>
        <p>アカウント登録やサーバーへの進捗保存は使用していません。</p>
      </section>
    </main>
  )
}
