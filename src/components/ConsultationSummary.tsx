type ConsultationSummaryProps = {
  consultingItemCount: number
  isSharingConsultation: boolean
  isAnyShareActive: boolean
  onShareConsultation: () => void
}

export function ConsultationSummary({
  consultingItemCount,
  isSharingConsultation,
  isAnyShareActive,
  onShareConsultation,
}: ConsultationSummaryProps) {
  return (
    <section className="info-card consultation-summary-card">
      <div>
        <h2>相談リスト</h2>
        <p className="helper-text">相談中の商品が{consultingItemCount}件あります。</p>
      </div>
      <button
        type="button"
        className="secondary-button"
        onClick={onShareConsultation}
        disabled={isAnyShareActive}
      >
        {isSharingConsultation ? '共有中…' : `相談する ${consultingItemCount}件`}
      </button>
    </section>
  )
}
