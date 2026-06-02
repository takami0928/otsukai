import type { ShoppingRequestItemPayload } from '../types/shopping'

type ShoppingItemCardProps = {
  item: ShoppingRequestItemPayload
  checked: boolean
  onToggle: () => void
}

export function ShoppingItemCard({ item, checked, onToggle }: ShoppingItemCardProps) {
  return (
    <button
      type="button"
      className={`shopping-item-card ${checked ? 'is-checked' : ''}`}
      onClick={onToggle}
    >
      <span className="shopping-icon" aria-hidden="true">
        {item.iconSnapshot}
      </span>
      <span className="shopping-body">
        <strong>{item.productNameSnapshot}</strong>
        {item.memo ? <span className="shopping-memo">メモ: {item.memo}</span> : null}
        <span className="shopping-state">{checked ? 'かご済み' : 'タップで完了'}</span>
      </span>
      <span className={`shopping-quantity-block ${item.quantity > 1 ? 'is-multiple' : ''}`}>
        <strong>{item.quantity}</strong>
        <small>{item.unit}</small>
      </span>
    </button>
  )
}
