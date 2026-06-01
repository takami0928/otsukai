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
          <span className="product-meta">
            既定 {product.defaultQuantity}
            {product.unit}
          </span>
        </span>
        <div className="quantity-stepper" aria-label={`${product.name}の数量`}>
          <button
            type="button"
            className="step-button"
            onClick={onDecrease}
            aria-label={`${product.name}を減らす`}
          >
            −
          </button>
          <span className="quantity-value">{draft.quantity}</span>
          <button
            type="button"
            className="step-button"
            onClick={onIncrease}
            aria-label={`${product.name}を増やす`}
          >
            ＋
          </button>
        </div>
      </div>

      <div className="product-row-actions">
        <button type="button" className="detail-toggle" onClick={onToggleDetails}>
          {isExpanded ? '詳細を閉じる' : 'メモ'}
        </button>
      </div>

      {isExpanded ? (
        <div className="product-detail-panel">
          <input
            type="text"
            placeholder="例: 安い方でOK"
            value={draft.memo}
            onChange={(event) => onMemoChange(event.target.value)}
          />
        </div>
      ) : null}
    </article>
  )
}
