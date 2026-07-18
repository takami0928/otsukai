import type {
  CheckedItemStatus,
  ItemIssue,
  ShoppingRequestItemPayload,
  UnavailableReason,
} from '../types/shopping'
import { getItemIssueLabel, getUnavailableReasonLabel } from '../utils/shoppingMessages'
import { hasCondition } from '../utils/shoppingState'

type ShoppingItemCardProps = {
  item: ShoppingRequestItemPayload
  status: CheckedItemStatus
  issue?: ItemIssue
  isConfirming: boolean
  isIssueFormOpen: boolean
  selectedReason?: UnavailableReason
  issueNote: string
  isSharing: boolean
  isInteractionLocked: boolean
  onStartConfirm: () => void
  onConfirmInCart: () => void
  onCancelConfirm: () => void
  onOpenIssueForm: () => void
  onReasonChange: (reason: UnavailableReason) => void
  onIssueNoteChange: (note: string) => void
  onShareConsultation: () => void
  onMarkNotBuying: () => void
  onCancelIssueForm: () => void
  onReshareConsultation: () => void
  onReset: () => void
}

const UNAVAILABLE_REASONS: UnavailableReason[] = [
  'soldOut',
  'notFound',
  'conditionMismatch',
  'poorCondition',
  'other',
]

function getStatusLabel(status: CheckedItemStatus, isConfirming: boolean): string {
  if (isConfirming) {
    return '確認待ち'
  }

  const labels: Record<CheckedItemStatus, string> = {
    pending: '未購入',
    inCart: 'かご済み',
    verified: '条件確認済み',
    consulting: '相談中',
    notBuying: '今回は買わない',
  }

  return labels[status]
}

export function ShoppingItemCard({
  item,
  status,
  issue,
  isConfirming,
  isIssueFormOpen,
  selectedReason,
  issueNote,
  isSharing,
  isInteractionLocked,
  onStartConfirm,
  onConfirmInCart,
  onCancelConfirm,
  onOpenIssueForm,
  onReasonChange,
  onIssueNoteChange,
  onShareConsultation,
  onMarkNotBuying,
  onCancelIssueForm,
  onReshareConsultation,
  onReset,
}: ShoppingItemCardProps) {
  const conditionItem = hasCondition(item)
  const statusLabel = getStatusLabel(status, isConfirming)
  const canAddToCart = status === 'pending' || status === 'consulting'
  const issueFormId = `item-issue-${item.id}`

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
        {(status === 'consulting' || status === 'notBuying') ? (
          <span className="shopping-issue">
            理由: {getItemIssueLabel(issue)}
            {issue?.note ? <small>補足: {issue.note}</small> : null}
          </span>
        ) : null}
        <span className="shopping-state" aria-live="polite">{statusLabel}</span>
      </span>
      <span className={`shopping-quantity-block ${item.quantity > 1 ? 'is-multiple' : ''}`}>
        <strong>{item.quantity}</strong>
        <small>{item.unit}</small>
      </span>

      <span className="shopping-actions">
        {canAddToCart ? (
          <>
            <button
              type="button"
              className="primary-button shopping-cart-button"
              onClick={isConfirming ? onConfirmInCart : onStartConfirm}
              disabled={isInteractionLocked}
              aria-label={
                isConfirming
                  ? `${item.productNameSnapshot}をかご済みに確定する`
                  : `${item.productNameSnapshot}をかごに入れる確認を始める`
              }
            >
              {isConfirming ? 'もう一度押して確定' : 'かごに入れる'}
            </button>
            {isConfirming ? (
              <button
                type="button"
                className="ghost-button shopping-cancel-button"
                onClick={onCancelConfirm}
                disabled={isInteractionLocked}
                aria-label={`${item.productNameSnapshot}のかご投入確認をキャンセルする`}
              >
                キャンセル
              </button>
            ) : null}
          </>
        ) : null}

        {status === 'pending' && !isConfirming ? (
          <button
            type="button"
            className="secondary-button shopping-secondary-button"
            onClick={isIssueFormOpen ? onCancelIssueForm : onOpenIssueForm}
            aria-expanded={isIssueFormOpen}
            aria-controls={issueFormId}
            aria-label={
              isIssueFormOpen
                ? `${item.productNameSnapshot}の理由選択を閉じる`
                : `${item.productNameSnapshot}を買えない理由を選ぶ`
            }
            disabled={isInteractionLocked}
          >
            {isIssueFormOpen ? '理由選択を閉じる' : '買えない・相談する'}
          </button>
        ) : null}

        {status === 'consulting' && !isConfirming ? (
          <span className="shopping-secondary-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onReshareConsultation}
              disabled={isInteractionLocked}
              aria-label={`${item.productNameSnapshot}の相談文を再共有する`}
            >
              {isSharing ? '共有中…' : 'LINEで再相談'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onMarkNotBuying}
              aria-label={`${item.productNameSnapshot}を今回は買わない状態にする`}
              disabled={isInteractionLocked}
            >
              今回は買わない
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onReset}
              aria-label={`${item.productNameSnapshot}の相談を取り消して未購入に戻す`}
              disabled={isInteractionLocked}
            >
              相談を取り消す
            </button>
          </span>
        ) : null}

        {(status === 'inCart' || status === 'verified' || status === 'notBuying') ? (
          <button
            type="button"
            className="ghost-button shopping-secondary-button"
            onClick={onReset}
            aria-label={`${item.productNameSnapshot}を未購入に戻す`}
            disabled={isInteractionLocked}
          >
            未購入に戻す
          </button>
        ) : null}
      </span>

      {status === 'pending' && isIssueFormOpen ? (
        <fieldset className="item-issue-panel" id={issueFormId}>
          <legend>{item.productNameSnapshot}を買えない理由</legend>
          <div className="issue-reason-options">
            {UNAVAILABLE_REASONS.map((reason) => (
              <label
                key={reason}
                className={`issue-reason-option ${selectedReason === reason ? 'is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name={`unavailable-reason-${item.id}`}
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={() => onReasonChange(reason)}
                  disabled={isInteractionLocked}
                />
                <span>{getUnavailableReasonLabel(reason)}</span>
              </label>
            ))}
          </div>

          {selectedReason === 'other' ? (
            <label className="stack-field">
              <span>補足（任意）</span>
              <input
                type="text"
                value={issueNote}
                onChange={(event) => onIssueNoteChange(event.target.value)}
                placeholder="例：予算より高かった"
                aria-label={`${item.productNameSnapshot}を買えない理由の補足`}
                disabled={isInteractionLocked}
              />
            </label>
          ) : null}

          <div className="issue-panel-actions">
            {selectedReason ? (
              <>
                <button
                  type="button"
                  className="primary-button"
                  onClick={onShareConsultation}
                  disabled={isInteractionLocked}
                  aria-label={`${item.productNameSnapshot}についてLINEで相談する`}
                >
                  {isSharing ? '共有中…' : 'LINEで相談'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onMarkNotBuying}
                  aria-label={`${item.productNameSnapshot}を今回は買わない状態にする`}
                  disabled={isInteractionLocked}
                >
                  今回は買わない
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="ghost-button"
              onClick={onCancelIssueForm}
              aria-label={`${item.productNameSnapshot}の理由選択を閉じる`}
              disabled={isInteractionLocked}
            >
              戻る
            </button>
          </div>
        </fieldset>
      ) : null}
    </article>
  )
}
