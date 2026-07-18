import type { Product } from '../types/product'
import type { CreateDraftItemState } from '../types/shopping'

type ProductCardProps = {
  product: Product
  draft: CreateDraftItemState
  isExpanded: boolean
  onIncrease: () => void
  onDecrease: () => void
  onToggleDetails: () => void
  onMemoChange: (value: string) => void
}

export function ProductCard({
  product,
  draft,
  isExpanded,
  onIncrease,
  onDecrease,
  onToggleDetails,
  onMemoChange,
}: ProductCardProps) {
  const isSelected = draft.quantity > 0
  const conditionPanelId = `product-condition-${product.id}`
  const conditionToggleLabel = isExpanded
    ? `${product.name}の条件を閉じる`
    : draft.memo.trim()
      ? `${product.name}の条件を開く`
      : `${product.name}の条件を追加`

  return (
    <article className={`product-row ${isSelected ? 'is-selected' : ''}`}>
      <div className="product-row-main">
        <span className={`selection-mark ${isSelected ? 'is-selected' : ''}`} aria-hidden="true">
          {isSelected ? '✓' : '□'}
        </span>
        <span className="product-icon" aria-hidden="true">
          {product.icon}
        </span>
        <span className="product-main">
          <strong>{product.name}</strong>
        </span>
        <div className="quantity-stepper" role="group" aria-label={`${product.name}の数量`}>
          <button
            type="button"
            className="step-button"
            onClick={onDecrease}
            aria-label={`${product.name}を1${product.unit}減らす（現在${draft.quantity}${product.unit}）`}
          >
            −
          </button>
          <span className="quantity-value">{draft.quantity}</span>
          <button
            type="button"
            className="step-button"
            onClick={onIncrease}
            aria-label={`${product.name}を1${product.unit}増やす（現在${draft.quantity}${product.unit}）`}
          >
            ＋
          </button>
        </div>
        <button
          type="button"
          className="detail-toggle"
          onClick={onToggleDetails}
          aria-expanded={isExpanded}
          aria-controls={conditionPanelId}
          aria-label={conditionToggleLabel}
        >
          {isExpanded ? '閉じる' : draft.memo.trim() ? '条件あり' : '条件を追加'}
        </button>
      </div>

      {isExpanded ? (
        <div id={conditionPanelId} className="product-detail-panel">
          <input
            type="text"
            aria-label={`${product.name}の条件`}
            placeholder="例：安い方でOK、○○味、500g以上"
            value={draft.memo}
            onChange={(event) => onMemoChange(event.target.value)}
          />
        </div>
      ) : null}
    </article>
  )
}
