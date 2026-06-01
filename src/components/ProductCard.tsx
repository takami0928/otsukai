import type { Product } from '../types/product'
import type { CreateDraftItemState } from '../types/shopping'

type ProductCardProps = {
  product: Product
  draft: CreateDraftItemState
  selected: boolean
  onToggleSelect: () => void
  onQuantityChange: (value: number) => void
  onMemoChange: (value: string) => void
}

export function ProductCard({
  product,
  draft,
  selected,
  onToggleSelect,
  onQuantityChange,
  onMemoChange,
}: ProductCardProps) {
  return (
    <article className={`product-card ${selected ? 'is-selected' : ''}`}>
      <button type="button" className="product-select" onClick={onToggleSelect}>
        <span className="product-icon" aria-hidden="true">
          {product.icon}
        </span>
        <span className="product-main">
          <strong>{product.name}</strong>
          <span className="product-meta">
            既定: {product.defaultQuantity}
            {product.unit}
          </span>
        </span>
        <span className="selection-badge">{selected ? '追加済み' : 'タップで追加'}</span>
      </button>

      <div className="product-controls">
        <label>
          数量
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.quantity}
            onChange={(event) => onQuantityChange(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <label>
          メモ
          <input
            type="text"
            placeholder="例: 安い方でOK"
            value={draft.memo}
            onChange={(event) => onMemoChange(event.target.value)}
          />
        </label>
      </div>
    </article>
  )
}
