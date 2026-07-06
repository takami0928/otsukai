import { useEffect, useMemo, useRef, useState } from 'react'
import { CategorySection } from '../components/CategorySection'
import { ShoppingItemCard } from '../components/ShoppingItemCard'
import { decodeShoppingRequest } from '../utils/encodeRequest'
import { getItemStatus, getShoppingCompletionState, hasCondition } from '../utils/shoppingState'
import { loadCheckedState, saveCheckedState } from '../utils/storage'
import type {
  CheckedItemStatus,
  CheckedStateMap,
  CheckedStatusChange,
  ShoppingRequestPayload,
} from '../types/shopping'

type ShoppingListPageProps = {
  encodedPayload: string
  onBackHome: () => void
  onOpenCreate: () => void
  onError: (title: string, description: string) => void
}

type FilterMode = 'remaining' | 'all'

export function ShoppingListPage({
  encodedPayload,
  onBackHome,
  onOpenCreate,
  onError,
}: ShoppingListPageProps) {
  const [payload, setPayload] = useState<ShoppingRequestPayload | null>(null)
  const [checkedState, setCheckedState] = useState<CheckedStateMap>({})
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [pendingConfirmItemId, setPendingConfirmItemId] = useState<string | null>(null)
  const [isCheckoutReviewOpen, setIsCheckoutReviewOpen] = useState(false)
  const [undoStack, setUndoStack] = useState<CheckedStatusChange[]>([])
  const checkoutReviewRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    try {
      const decoded = decodeShoppingRequest(encodedPayload)
      setPayload(decoded)
      setCheckedState(loadCheckedState(decoded.requestId))
      setPendingConfirmItemId(null)
      setIsCheckoutReviewOpen(false)
      setUndoStack([])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '共有URLの内容を読み込めませんでした。'
      onError('共有URLを開けませんでした', message)
    }
  }, [encodedPayload, onError])

  useEffect(() => {
    if (!payload) {
      return
    }

    saveCheckedState(payload.requestId, checkedState)
  }, [checkedState, payload])

  const sortedItems = useMemo(() => {
    if (!payload) {
      return []
    }

    return [...payload.items].sort((a, b) => a.sortOrderSnapshot - b.sortOrderSnapshot)
  }, [payload])

  const remainingItems = useMemo(
    () => sortedItems.filter((item) => getItemStatus(checkedState, item.id) === 'pending'),
    [checkedState, sortedItems],
  )

  const cartItems = useMemo(
    () => sortedItems.filter((item) => getItemStatus(checkedState, item.id) !== 'pending'),
    [checkedState, sortedItems],
  )

  const visibleItems = filterMode === 'all' ? sortedItems : remainingItems
  const completionState = useMemo(
    () => getShoppingCompletionState(sortedItems, checkedState),
    [checkedState, sortedItems],
  )

  const groupedVisibleItems = useMemo(() => {
    const groups = new Map<string, { name: string; items: typeof visibleItems }>()

    for (const item of visibleItems) {
      const key = item.categoryIdSnapshot
      const existing = groups.get(key)

      if (existing) {
        existing.items.push(item)
      } else {
        groups.set(key, {
          name: item.categoryNameSnapshot,
          items: [item],
        })
      }
    }

    return [...groups.entries()].map(([id, value]) => ({
      id,
      name: value.name,
      items: value.items,
    }))
  }, [visibleItems])

  const removePendingConfirm = (itemId: string) => {
    setPendingConfirmItemId((current) => (current === itemId ? null : current))
  }

  const updateItemStatus = (itemId: string, nextStatus: CheckedItemStatus) => {
    setCheckedState((current) => {
      const previousStatus = getItemStatus(current, itemId)
      if (previousStatus === nextStatus) {
        return current
      }

      setUndoStack((stack) => [...stack, { itemId, previousStatus, nextStatus }])
      return { ...current, [itemId]: nextStatus }
    })
    removePendingConfirm(itemId)
  }

  const handleStartConfirm = (itemId: string) => {
    setPendingConfirmItemId(itemId)
  }

  const handleOpenCheckoutReview = () => {
    setIsCheckoutReviewOpen(true)
    window.requestAnimationFrame(() => {
      checkoutReviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const handleUndo = () => {
    const lastId = undoStack[undoStack.length - 1]
    if (!lastId) {
      return
    }

    setCheckedState((current) => ({ ...current, [lastId.itemId]: lastId.previousStatus }))
    removePendingConfirm(lastId.itemId)
    setUndoStack((current) => current.slice(0, -1))
  }

  if (!payload) {
    return null
  }

  const remainingCount = completionState.pendingCount
  const showCheckoutReview = isCheckoutReviewOpen || completionState.isReadyForCheckoutReview

  return (
    <main className="page">
      <section className="top-bar">
        <button type="button" className="ghost-button" onClick={onBackHome}>
          ホーム
        </button>
        <div>
          <p className="eyebrow">お使いリスト</p>
          <h1>{payload.title}</h1>
        </div>
      </section>

      <section className="hero-card compact-hero">
        <p className="eyebrow">残り</p>
        <div className="remaining-count">{remainingCount}</div>
        <p className="lead">
          {remainingCount > 0 ? '件の買い物が残っています' : '未購入の商品はありません'}
        </p>
        {completionState.isComplete ? (
          <p className="completion-message">買い物完了です。</p>
        ) : null}
        {!completionState.isComplete && completionState.isReadyForCheckoutReview ? (
          <div className="checkout-callout">
            <p>
              {completionState.needsVerificationCount > 0
                ? `条件あり商品が${completionState.needsVerificationCount}件あります。会計前に確認してください。`
                : '会計前にリストを見直せます。'}
            </p>
            <button type="button" className="primary-button" onClick={handleOpenCheckoutReview}>
              会計前チェックへ
            </button>
          </div>
        ) : null}
      </section>

      <section className="toolbar-card">
        <button type="button" className="primary-button" onClick={handleUndo} disabled={!undoStack.length}>
          Undo
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setFilterMode((current) => (current === 'remaining' ? 'all' : 'remaining'))}
        >
          {filterMode === 'remaining' ? 'すべて表示' : '未購入だけ表示'}
        </button>
      </section>

      {groupedVisibleItems.length > 0 ? (
        groupedVisibleItems.map((group) => (
          <CategorySection key={group.id} name={group.name} count={group.items.length}>
            {group.items.map((item) => (
              <ShoppingItemCard
                key={item.id}
                item={item}
                status={getItemStatus(checkedState, item.id)}
                isConfirming={pendingConfirmItemId === item.id}
                onStartConfirm={() => handleStartConfirm(item.id)}
                onConfirmInCart={() => updateItemStatus(item.id, 'inCart')}
                onCancelConfirm={() => removePendingConfirm(item.id)}
                onReset={() => updateItemStatus(item.id, 'pending')}
              />
            ))}
          </CategorySection>
        ))
      ) : (
        <section className="info-card">
          <p>表示できる商品がありません。</p>
        </section>
      )}

      {showCheckoutReview ? (
        <section className="info-card checkout-review-card" ref={checkoutReviewRef}>
          <div className="section-heading">
            <h2>会計前チェック</h2>
            <span>{cartItems.length}件</span>
          </div>
          <p className="helper-text">
            条件ありの商品だけ、会計前に条件確認済みにしてください。
          </p>
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
                        onClick={() => updateItemStatus(item.id, 'verified')}
                      >
                        条件を確認した
                      </button>
                    ) : null}
                    {conditionItem && status === 'verified' ? (
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => updateItemStatus(item.id, 'inCart')}
                      >
                        確認を戻す
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() => updateItemStatus(item.id, 'pending')}
                    >
                      未購入に戻す
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
          {completionState.isComplete ? (
            <p className="completion-message">買い物完了です。</p>
          ) : null}
        </section>
      ) : null}

      <section className="info-card muted-card">
        <p>消し込み状態はこの端末の localStorage に保存されます。</p>
        <div className="inline-actions">
          <button type="button" className="ghost-button" onClick={onOpenCreate}>
            新しい依頼を作る
          </button>
        </div>
      </section>
    </main>
  )
}
