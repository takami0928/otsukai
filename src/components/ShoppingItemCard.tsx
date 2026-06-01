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
        <span className="shopping-quantity">
          {item.quantity}
          {item.unit}
        </span>
        {item.memo ? <span className="shopping-memo">{item.memo}</span> : null}
      </span>
      <span className="shopping-state">{checked ? 'かご済み' : 'タップで完了'}</span>
    </button>
  )
}
