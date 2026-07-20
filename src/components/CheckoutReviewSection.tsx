import type { Ref } from 'react'
import type {
  CheckedItemStatus,
  CheckedStateMap,
  ItemIssueMap,
  ShoppingRequestItemPayload,
} from '../types/shopping'
import { getItemIssueLabel } from '../utils/shoppingMessages'
import {
  getItemStatus,
  hasCondition,
  type ShoppingCompletionState,
} from '../utils/shoppingState'

type CheckoutReviewSectionProps = {
  cartItems: ShoppingRequestItemPayload[]
  notBuyingItems: ShoppingRequestItemPayload[]
  checkedState: CheckedStateMap
  itemIssues: ItemIssueMap
  completionState: ShoppingCompletionState
  isAnyShareActive: boolean
  sectionRef: Ref<HTMLElement>
  onChangeStatus: (itemId: string, nextStatus: CheckedItemStatus) => void
  onFinishShopping: () => void
}

export function CheckoutReviewSection({
  cartItems,
  notBuyingItems,
  checkedState,
  itemIssues,
  completionState,
  isAnyShareActive,
  sectionRef,
  onChangeStatus,
  onFinishShopping,
}: CheckoutReviewSectionProps) {
  return (
    <section
      className="info-card checkout-review-card"
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby="checkout-review-heading"
    >
      <div className="section-heading">
        <h2 id="checkout-review-heading">会計前チェック</h2>
        <span>{cartItems.length}件</span>
      </div>
      <p className="helper-text">最後にかごへ入れた商品から表示しています。</p>
      <p className="helper-text">
        条件ありの商品だけ、会計前に条件確認済みにしてください。
      </p>

      {cartItems.length > 0 ? (
        <div className="checkout-list">
          {cartItems.map((item) => {
            const status = getItemStatus(checkedState, item.id)
            const conditionItem = hasCondition(item)

            return (
              <article key={item.id} className={`checkout-item is-${status}`}>
                <div className="checkout-item-main">
                  <span className="shopping-icon" aria-hidden="true">
                    {item.iconSnapshot}
                  </span>
                  <span>
                    <span className="shopping-title-row">
                      <strong>{item.productNameSnapshot}</strong>
                      {conditionItem ? <span className="condition-badge">条件あり</span> : null}
                    </span>
                    <span className="checkout-quantity">
                      {item.quantity}{item.unit}
                    </span>
                    {item.memo ? <span className="shopping-condition">条件: {item.memo}</span> : null}
                    <span className="shopping-state">
                      {status === 'verified' ? '条件確認済み' : 'かご済み'}
                    </span>
                  </span>
                </div>
                <div className="checkout-actions">
                  {conditionItem && status === 'inCart' ? (
                    <button
                      type="button"
                      className="primary-button compact-button"
                      onClick={() => onChangeStatus(item.id, 'verified')}
                      aria-label={`${item.productNameSnapshot}の条件を確認済みにする`}
                      disabled={isAnyShareActive}
                    >
                      条件を確認した
                    </button>
                  ) : null}
                  {conditionItem && status === 'verified' ? (
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      onClick={() => onChangeStatus(item.id, 'inCart')}
                      aria-label={`${item.productNameSnapshot}の条件確認を戻す`}
                      disabled={isAnyShareActive}
                    >
                      確認を戻す
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    onClick={() => onChangeStatus(item.id, 'pending')}
                    aria-label={`${item.productNameSnapshot}を未購入に戻す`}
                    disabled={isAnyShareActive}
                  >
                    未購入に戻す
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="empty-checkout-message">かごに入れた商品はありません。</p>
      )}

      {notBuyingItems.length > 0 ? (
        <div className="checkout-not-buying">
          <h3>今回は買わない商品</h3>
          <ul>
            {notBuyingItems.map((item) => (
              <li key={item.id}>
                <strong>{item.productNameSnapshot}</strong>
                <span>{getItemIssueLabel(itemIssues[item.id])}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="finish-shopping-panel">
        {completionState.pendingCount > 0 ? (
          <p>未購入の商品が{completionState.pendingCount}件あります。</p>
        ) : null}
        {completionState.consultingCount > 0 ? (
          <p>
            相談中の商品が{completionState.consultingCount}件あります。回答後に状態を確定してください。
          </p>
        ) : null}
        {completionState.needsVerificationCount > 0 ? (
          <p>
            条件確認が必要な商品が{completionState.needsVerificationCount}件あります。会計前に確認してください。
          </p>
        ) : null}
        {completionState.canFinish ? (
          <>
            <p>購入内容を確認してから終了してください。</p>
            <button
              type="button"
              className="primary-button large-button finish-shopping-button"
              onClick={onFinishShopping}
            >
              買い物を終了する
            </button>
          </>
        ) : null}
      </div>
    </section>
  )
}
