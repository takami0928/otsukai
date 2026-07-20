import type { Category, Product } from '../types/product'
import type { CreateDraftState } from '../types/shopping'
import type { CustomRequestDraftItem } from '../utils/requestBudget'

type ShareMessageStatus = 'success' | 'error' | 'cancelled' | ''

type ProductGroup = {
  category: Category
  items: Product[]
}

type RequestReviewViewProps = {
  customItems: CustomRequestDraftItem[]
  draft: CreateDraftState
  groupedSelectedProducts: ProductGroup[]
  isSharingRequest: boolean
  onReturnToEdit: () => void
  onShareRequest: () => void | Promise<void>
  selectedCount: number
  shareMessage: string
  shareStatus: ShareMessageStatus
}

const OTHER_CATEGORY_NAME = 'その他'

export function RequestReviewView({
  customItems,
  draft,
  groupedSelectedProducts,
  isSharingRequest,
  onReturnToEdit,
  onShareRequest,
  selectedCount,
  shareMessage,
  shareStatus,
}: RequestReviewViewProps) {
  return (
    <>
      <section className="top-bar">
        <div>
          <p className="eyebrow">依頼作成</p>
          <h1>依頼内容の確認</h1>
        </div>
      </section>

      <section className="info-card">
        <p className="lead">{selectedCount}件の商品を選択しています。</p>
      </section>

      {groupedSelectedProducts.map(({ category, items }) => (
        <section key={category.id} className="info-card review-category">
          <h2>{category.name}</h2>
          <ul className="review-list">
            {items.map((product) => {
              const item = draft[product.id]
              return (
                <li key={product.id}>
                  <strong>{product.name}</strong> {item.quantity}
                  {product.unit}
                  {item.memo.trim() ? (
                    <p className="review-memo">条件: {item.memo.trim()}</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {customItems.length > 0 ? (
        <section className="info-card review-category">
          <h2>{OTHER_CATEGORY_NAME}</h2>
          <ul className="review-list">
            {customItems.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong> {item.quantity}
                {item.unit}
                {item.memo ? (
                  <p className="review-memo">条件: {item.memo}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="review-share-actions">
        <button
          type="button"
          className="primary-button review-share-button"
          onClick={() => void onShareRequest()}
          disabled={isSharingRequest}
        >
          {isSharingRequest ? '共有画面を開いています…' : 'LINEで送る'}
        </button>
        <p className="helper-text">共有画面でLINEを選択してください。</p>
        {shareMessage ? (
          <p
            className={`copy-message ${shareStatus}`}
            role="status"
            aria-live="polite"
          >
            {shareMessage}
          </p>
        ) : null}
        <button
          type="button"
          className="secondary-button"
          onClick={onReturnToEdit}
          disabled={isSharingRequest}
        >
          修正する
        </button>
      </div>
    </>
  )
}
