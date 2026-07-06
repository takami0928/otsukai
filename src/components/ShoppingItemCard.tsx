import type { CheckedItemStatus, ShoppingRequestItemPayload } from '../types/shopping'
import { hasCondition } from '../utils/shoppingState'

type ShoppingItemCardProps = {
  item: ShoppingRequestItemPayload
  status: CheckedItemStatus
  isConfirming: boolean
  onStartConfirm: () => void
  onConfirmInCart: () => void
  onCancelConfirm: () => void
  onReset: () => void
}

function getStatusLabel(status: CheckedItemStatus, isConfirming: boolean): string {
  if (isConfirming) {
    return '確認待ち'
  }

  if (status === 'verified') {
    return '条件確認済み'
  }

  if (status === 'inCart') {
    return 'かご済み'
  }

  return '未購入'
}

export function ShoppingItemCard({
  item,
  status,
  isConfirming,
  onStartConfirm,
  onConfirmInCart,
  onCancelConfirm,
  onReset,
}: ShoppingItemCardProps) {
  const conditionItem = hasCondition(item)
  const statusLabel = getStatusLabel(status, isConfirming)

  return (
    <article className={`shopping-item-card is-${status} ${isConfirming ? 'is-confirming' : ''}`}>
      <span className="shopping-icon" aria-hidden="true">
        {item.iconSnapshot}
      </span>
      <span className="shopping-body">
        <span className="shopping-title-row">
          <strong>{item.productNameSnapshot}</strong>
          {conditionItem ? <span className="condition-badge">条件あり</span> : null}
        </span>
        {item.memo ? <span className="shopping-condition">条件: {item.memo}</span> : null}
        <span className="shopping-state">{statusLabel}</span>
      </span>
      <span className={`shopping-quantity-block ${item.quantity > 1 ? 'is-multiple' : ''}`}>
        <strong>{item.quantity}</strong>
        <small>{item.unit}</small>
      </span>
      <span className="shopping-actions">
        {status === 'pending' && !isConfirming ? (
          <button type="button" className="secondary-button compact-button" onClick={onStartConfirm}>
            かごに入れる
          </button>
        ) : null}
        {status === 'pending' && isConfirming ? (
          <>
            <button type="button" className="primary-button compact-button" onClick={onConfirmInCart}>
              もう一度押すと、かご済み
            </button>
            <button type="button" className="ghost-button compact-button" onClick={onCancelConfirm}>
              キャンセル
            </button>
          </>
        ) : null}
        {status !== 'pending' ? (
          <button type="button" className="ghost-button compact-button" onClick={onReset}>
            戻す
          </button>
        ) : null}
      </span>
    </article>
  )
}
