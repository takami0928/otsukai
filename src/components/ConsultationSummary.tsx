type ConsultationSummaryProps = {
  consultingItemCount: number
  isSharingBulk: boolean
  isAnyShareActive: boolean
  onBulkConsultation: () => void
}

export function ConsultationSummary({
  consultingItemCount,
  isSharingBulk,
  isAnyShareActive,
  onBulkConsultation,
}: ConsultationSummaryProps) {
  return (
    <section className="info-card consultation-summary-card">
      <div>
        <h2>相談中の商品が{consultingItemCount}件あります</h2>
        <p className="helper-text">相談内容をまとめて再共有できます。</p>
      </div>
      <button
        type="button"
        className="secondary-button"
        onClick={onBulkConsultation}
        disabled={isAnyShareActive}
      >
        {isSharingBulk ? '共有中…' : 'まとめてLINEで相談'}
      </button>
    </section>
  )
}
