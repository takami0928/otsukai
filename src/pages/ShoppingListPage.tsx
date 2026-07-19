import { useEffect, useMemo, useRef, useState } from 'react'
import { CategorySection } from '../components/CategorySection'
import { ShoppingItemCard } from '../components/ShoppingItemCard'
import { decodeShoppingRequest } from '../utils/encodeRequest'
import { decodeCompactRequest } from '../utils/compactRequest'
import {
  applyShoppingStateChange,
  createShoppingStateChange,
  getCartItemsForCheckout,
  getItemStatus,
  getShoppingCompletionState,
  hasCondition,
  isCartStatus,
  reconcileCheckedStateWithIssues,
  reconcileItemIssues,
  type ShoppingStateSnapshot,
} from '../utils/shoppingState'
import {
  loadCartOrder,
  loadCheckedState,
  loadItemIssues,
  saveCartOrder,
  saveCheckedState,
  saveItemIssues,
} from '../utils/storage'
import {
  buildBulkConsultationMessage,
  buildIndividualConsultationMessage,
  buildShoppingResultMessage,
  getItemIssueLabel,
} from '../utils/shoppingMessages'
import { shareText, type ShareTextResult } from '../utils/shareText'
import { compareItemsByStoreOrder } from '../utils/storeOrder'
import type {
  CheckedItemStatus,
  ItemIssue,
  ShoppingRequestItemPayload,
  ShoppingRequestPayload,
  ShoppingStateChange,
  UnavailableReason,
} from '../types/shopping'

type ShoppingListPageProps = {
  encodedPayload: string
  payloadFormat: 'v1' | 'v2'
  onBackHome: () => void
  onOpenCreate: () => void
  onError: (title: string, description: string) => void
}

type FilterMode = 'remaining' | 'all'
type IssueDraft = {
  itemId: string
  reason?: UnavailableReason
  note: string
}
type ShareNotice = {
  kind: 'success' | 'error' | 'info'
  message: string
}

const EMPTY_SHOPPING_STATE: ShoppingStateSnapshot = {
  checkedState: {},
  itemIssues: {},
  cartOrder: [],
}

function createIssue(reason: UnavailableReason, note: string): ItemIssue {
  const trimmedNote = note.trim()
  return trimmedNote ? { reason, note: trimmedNote } : { reason }
}

function getShareNotice(result: ShareTextResult, subject: '相談文' | '結果'): ShareNotice {
  if (result === 'shared') {
    return { kind: 'success', message: `${subject}を共有しました。` }
  }

  if (result === 'copied') {
    return {
      kind: 'success',
      message: `${subject}をコピーしました。LINEなどに貼り付けて送ってください。`,
    }
  }

  if (result === 'cancelled') {
    return { kind: 'info', message: '共有をキャンセルしました。状態は変更していません。' }
  }

  return {
    kind: 'error',
    message: `${subject}を共有またはコピーできませんでした。もう一度お試しください。`,
  }
}

export function ShoppingListPage({
  encodedPayload,
  payloadFormat,
  onBackHome,
  onOpenCreate,
  onError,
}: ShoppingListPageProps) {
  const [payload, setPayload] = useState<ShoppingRequestPayload | null>(null)
  const [shoppingState, setShoppingState] = useState<ShoppingStateSnapshot>(EMPTY_SHOPPING_STATE)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [pendingConfirmItemId, setPendingConfirmItemId] = useState<string | null>(null)
  const [isCheckoutReviewOpen, setIsCheckoutReviewOpen] = useState(false)
  const [isCompletionView, setIsCompletionView] = useState(false)
  const [undoStack, setUndoStack] = useState<ShoppingStateChange[]>([])
  const [issueDraft, setIssueDraft] = useState<IssueDraft | null>(null)
  const [sharingItemId, setSharingItemId] = useState<string | null>(null)
  const [isSharingBulk, setIsSharingBulk] = useState(false)
  const [isSharingResult, setIsSharingResult] = useState(false)
  const [shareNotice, setShareNotice] = useState<ShareNotice | null>(null)
  const activeShareRef = useRef(false)
  const shareGenerationRef = useRef(0)
  const undoStackRef = useRef<ShoppingStateChange[]>([])
  const shoppingStateRef = useRef<ShoppingStateSnapshot>(EMPTY_SHOPPING_STATE)
  const checkoutReviewRef = useRef<HTMLElement | null>(null)
  const completionHeadingRef = useRef<HTMLHeadingElement | null>(null)

  const { checkedState, itemIssues, cartOrder } = shoppingState

  useEffect(() => {
    shareGenerationRef.current += 1
    activeShareRef.current = false

    try {
      const decoded =
        payloadFormat === 'v2'
          ? decodeCompactRequest(encodedPayload)
          : decodeShoppingRequest(encodedPayload)
      const loadedCheckedState = loadCheckedState(decoded.requestId)
      const loadedItemIssues = loadItemIssues(decoded.requestId)
      const nextCheckedState = reconcileCheckedStateWithIssues(
        loadedCheckedState,
        loadedItemIssues,
      )
      const nextItemIssues = reconcileItemIssues(
        loadedItemIssues,
        nextCheckedState,
      )
      const nextCartOrder = loadCartOrder(decoded.requestId).filter((itemId) =>
        isCartStatus(getItemStatus(nextCheckedState, itemId)),
      )
      const nextShoppingState = {
        checkedState: nextCheckedState,
        itemIssues: nextItemIssues,
        cartOrder: nextCartOrder,
      }

      shoppingStateRef.current = nextShoppingState
      setPayload(decoded)
      setShoppingState(nextShoppingState)
      setFilterMode('all')
      setPendingConfirmItemId(null)
      setIsCheckoutReviewOpen(false)
      setIsCompletionView(false)
      undoStackRef.current = []
      setUndoStack([])
      setIssueDraft(null)
      setSharingItemId(null)
      setIsSharingBulk(false)
      setIsSharingResult(false)
      setShareNotice(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '共有URLの内容を読み込めませんでした。'
      onError('共有URLを開けませんでした', message)
    }
  }, [encodedPayload, onError, payloadFormat])

  useEffect(() => {
    shoppingStateRef.current = shoppingState
  }, [shoppingState])

  useEffect(() => {
    if (!payload) {
      return
    }

    saveCheckedState(payload.requestId, checkedState)
  }, [checkedState, payload])

  useEffect(() => {
    if (!payload) {
      return
    }

    saveItemIssues(payload.requestId, itemIssues)
  }, [itemIssues, payload])

  useEffect(() => {
    if (!payload) {
      return
    }

    saveCartOrder(payload.requestId, cartOrder)
  }, [cartOrder, payload])

  const sortedItems = useMemo(() => {
    if (!payload) {
      return []
    }

    return [...payload.items].sort((a, b) => a.sortOrderSnapshot - b.sortOrderSnapshot)
  }, [payload])

  const storeOrderedItems = useMemo(() => {
    if (!payload) {
      return []
    }

    return [...payload.items].sort(compareItemsByStoreOrder)
  }, [payload])

  const remainingItems = useMemo(
    () =>
      storeOrderedItems.filter((item) => {
        const status = getItemStatus(checkedState, item.id)
        return status === 'pending' || status === 'consulting'
      }),
    [checkedState, storeOrderedItems],
  )

  const cartItems = useMemo(
    () => getCartItemsForCheckout(sortedItems, checkedState, cartOrder),
    [cartOrder, checkedState, sortedItems],
  )

  const consultingItems = useMemo(
    () => sortedItems.filter((item) => getItemStatus(checkedState, item.id) === 'consulting'),
    [checkedState, sortedItems],
  )

  const notBuyingItems = useMemo(
    () => sortedItems.filter((item) => getItemStatus(checkedState, item.id) === 'notBuying'),
    [checkedState, sortedItems],
  )

  const visibleItems = filterMode === 'all' ? storeOrderedItems : remainingItems
  const completionState = useMemo(
    () => getShoppingCompletionState(sortedItems, checkedState),
    [checkedState, sortedItems],
  )
  const unresolvedCount =
    completionState.pendingCount +
    completionState.consultingCount +
    completionState.needsVerificationCount
  const isAnyShareActive = Boolean(sharingItemId) || isSharingBulk || isSharingResult

  const groupedVisibleItems = useMemo(() => {
    const groups = new Map<string, { name: string; items: ShoppingRequestItemPayload[] }>()

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

  const commitShoppingChange = (
    itemId: string,
    nextStatus: CheckedItemStatus,
    nextIssue?: ItemIssue,
  ) => {
    const currentState = shoppingStateRef.current
    const change = createShoppingStateChange(
      currentState.checkedState,
      currentState.itemIssues,
      itemId,
      nextStatus,
      nextIssue,
    )

    if (!change) {
      removePendingConfirm(itemId)
      return false
    }

    const nextState = applyShoppingStateChange(currentState, change)
    shoppingStateRef.current = nextState
    setShoppingState(nextState)
    const nextUndoStack = [...undoStackRef.current, change]
    undoStackRef.current = nextUndoStack
    setUndoStack(nextUndoStack)
    removePendingConfirm(itemId)
    setIssueDraft((current) => (current?.itemId === itemId ? null : current))
    return true
  }

  const handleStartConfirm = (itemId: string) => {
    setPendingConfirmItemId(itemId)
    setIssueDraft(null)
  }

  const handleOpenIssueForm = (itemId: string) => {
    setIssueDraft({ itemId, note: '' })
    setPendingConfirmItemId(null)
    setShareNotice(null)
  }

  const handleOpenCheckoutReview = () => {
    setIsCheckoutReviewOpen(true)
    window.requestAnimationFrame(() => {
      checkoutReviewRef.current?.focus()
      checkoutReviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const handleUndo = () => {
    const lastChange = undoStackRef.current[undoStackRef.current.length - 1]
    if (!lastChange) {
      return
    }

    const nextState = applyShoppingStateChange(
      shoppingStateRef.current,
      lastChange,
      'undo',
    )
    shoppingStateRef.current = nextState
    setShoppingState(nextState)
    removePendingConfirm(lastChange.itemId)
    setIssueDraft((current) => (current?.itemId === lastChange.itemId ? null : current))
    const nextUndoStack = undoStackRef.current.slice(0, -1)
    undoStackRef.current = nextUndoStack
    setUndoStack(nextUndoStack)
  }

  const handleNewConsultation = async (item: ShoppingRequestItemPayload) => {
    if (activeShareRef.current || issueDraft?.itemId !== item.id || !issueDraft.reason) {
      return
    }

    const issue = createIssue(issueDraft.reason, issueDraft.note)
    const shareGeneration = shareGenerationRef.current
    activeShareRef.current = true
    setSharingItemId(item.id)
    try {
      const result = await shareText({
        title: 'おつかい相談',
        text: buildIndividualConsultationMessage(item, issue),
      })
      if (shareGeneration !== shareGenerationRef.current) {
        return
      }

      setShareNotice(getShareNotice(result, '相談文'))

      if (
        (result === 'shared' || result === 'copied') &&
        getItemStatus(shoppingStateRef.current.checkedState, item.id) === 'pending'
      ) {
        commitShoppingChange(item.id, 'consulting', issue)
      }
    } finally {
      if (shareGeneration === shareGenerationRef.current) {
        activeShareRef.current = false
        setSharingItemId(null)
      }
    }
  }

  const handleReshareConsultation = async (item: ShoppingRequestItemPayload) => {
    if (activeShareRef.current) {
      return
    }

    const shareGeneration = shareGenerationRef.current
    activeShareRef.current = true
    setSharingItemId(item.id)
    try {
      const result = await shareText({
        title: 'おつかい相談',
        text: buildIndividualConsultationMessage(item, itemIssues[item.id]),
      })
      if (shareGeneration !== shareGenerationRef.current) {
        return
      }

      setShareNotice(getShareNotice(result, '相談文'))
    } finally {
      if (shareGeneration === shareGenerationRef.current) {
        activeShareRef.current = false
        setSharingItemId(null)
      }
    }
  }

  const handleBulkConsultation = async () => {
    if (activeShareRef.current) {
      return
    }

    const shareGeneration = shareGenerationRef.current
    activeShareRef.current = true
    setIsSharingBulk(true)
    try {
      const result = await shareText({
        title: 'おつかい相談',
        text: buildBulkConsultationMessage(
          consultingItems.map((item) => ({ item, issue: itemIssues[item.id] })),
        ),
      })
      if (shareGeneration !== shareGenerationRef.current) {
        return
      }

      setShareNotice(getShareNotice(result, '相談文'))
    } finally {
      if (shareGeneration === shareGenerationRef.current) {
        activeShareRef.current = false
        setIsSharingBulk(false)
      }
    }
  }

  const handleShareResult = async () => {
    if (activeShareRef.current) {
      return
    }

    const shareGeneration = shareGenerationRef.current
    activeShareRef.current = true
    setIsSharingResult(true)
    try {
      const result = await shareText({
        title: 'おつかい結果',
        text: buildShoppingResultMessage(
          completionState.purchasedCount,
          notBuyingItems.map((item) => ({ item, issue: itemIssues[item.id] })),
        ),
      })
      if (shareGeneration !== shareGenerationRef.current) {
        return
      }

      setShareNotice(getShareNotice(result, '結果'))
    } finally {
      if (shareGeneration === shareGenerationRef.current) {
        activeShareRef.current = false
        setIsSharingResult(false)
      }
    }
  }

  const handleFinishShopping = () => {
    const latestCompletionState = getShoppingCompletionState(
      sortedItems,
      shoppingStateRef.current.checkedState,
    )
    if (!latestCompletionState.canFinish) {
      return
    }

    setShareNotice(null)
    setIsCompletionView(true)
    window.requestAnimationFrame(() => {
      completionHeadingRef.current?.focus()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const handleReviewShopping = () => {
    setIsCompletionView(false)
    setIsCheckoutReviewOpen(true)
    setShareNotice(null)
    window.requestAnimationFrame(() => {
      checkoutReviewRef.current?.focus()
      checkoutReviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  if (!payload) {
    return null
  }

  if (isCompletionView) {
    const allPurchased = completionState.notBuyingCount === 0

    return (
      <main className="page completion-page">
        <section className={`hero-card completion-hero ${allPurchased ? 'is-complete' : ''}`}>
          <p className="completion-symbol" aria-hidden="true">{allPurchased ? '✓' : '!'}</p>
          <h1 ref={completionHeadingRef} tabIndex={-1}>
            {allPurchased ? 'おつかい完了' : 'おつかい終了'}
          </h1>
          <dl className="completion-stats">
            <div>
              <dt>購入した商品</dt>
              <dd>{completionState.purchasedCount}件</dd>
            </div>
            <div>
              <dt>買えなかった商品</dt>
              <dd>{completionState.notBuyingCount}件</dd>
            </div>
          </dl>
        </section>

        {shareNotice ? (
          <p className={`share-notice ${shareNotice.kind}`} role="status">
            {shareNotice.message}
          </p>
        ) : null}

        {notBuyingItems.length > 0 ? (
          <section className="info-card unavailable-result-card">
            <h2>買えなかった商品</h2>
            <ul className="unavailable-result-list">
              {notBuyingItems.map((item) => (
                <li key={item.id}>
                  <strong>{item.productNameSnapshot}</strong>
                  <span>{getItemIssueLabel(itemIssues[item.id])}</span>
                  {itemIssues[item.id]?.note ? <small>補足: {itemIssues[item.id]?.note}</small> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="info-card completion-actions-card">
          <button
            type="button"
            className="primary-button large-button"
            onClick={handleShareResult}
            disabled={isSharingResult}
          >
            {isSharingResult ? '共有中…' : '結果を共有'}
          </button>
          <button type="button" className="secondary-button large-button" onClick={handleReviewShopping}>
            買い物内容を見直す
          </button>
          <button type="button" className="ghost-button large-button" onClick={onBackHome}>
            ホームへ
          </button>
        </section>
      </main>
    )
  }

  const showCheckoutReview =
    isCheckoutReviewOpen || (sortedItems.length > 0 && completionState.pendingCount === 0)

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
        <p className="eyebrow">残りの処理</p>
        <div className="remaining-count">{unresolvedCount}</div>
        <p className="lead">
          {unresolvedCount > 0
            ? '件の商品が未処理または未解決です'
            : 'すべての商品を確認できました'}
        </p>
        {(cartItems.length > 0 || notBuyingItems.length > 0) && !showCheckoutReview ? (
          <div className="checkout-callout">
            <p>購入内容と条件を会計前に確認できます。</p>
            <button type="button" className="primary-button" onClick={handleOpenCheckoutReview}>
              会計前チェックへ
            </button>
          </div>
        ) : null}
      </section>

      {shareNotice ? (
        <p className={`share-notice ${shareNotice.kind}`} role="status">
          {shareNotice.message}
        </p>
      ) : null}

      {consultingItems.length > 1 ? (
        <section className="info-card consultation-summary-card">
          <div>
            <h2>相談中の商品が{consultingItems.length}件あります</h2>
            <p className="helper-text">相談内容をまとめて再共有できます。</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={handleBulkConsultation}
            disabled={isAnyShareActive}
          >
            {isSharingBulk ? '共有中…' : 'まとめてLINEで相談'}
          </button>
        </section>
      ) : null}

      <section className="toolbar-card">
        <button
          type="button"
          className="primary-button"
          onClick={handleUndo}
          disabled={!undoStack.length || isAnyShareActive}
        >
          Undo
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setFilterMode((current) => (current === 'remaining' ? 'all' : 'remaining'))}
        >
          {filterMode === 'remaining' ? 'すべて表示' : '未購入・相談中だけ表示'}
        </button>
      </section>

      {groupedVisibleItems.length > 0 ? (
        groupedVisibleItems.map((group) => (
          <CategorySection key={group.id} name={group.name} count={group.items.length}>
            {group.items.map((item) => {
              const status = getItemStatus(checkedState, item.id)
              const currentIssueDraft = issueDraft?.itemId === item.id ? issueDraft : null

              return (
                <ShoppingItemCard
                  key={item.id}
                  item={item}
                  status={status}
                  issue={itemIssues[item.id]}
                  isConfirming={pendingConfirmItemId === item.id}
                  isIssueFormOpen={Boolean(currentIssueDraft)}
                  selectedReason={currentIssueDraft?.reason}
                  issueNote={currentIssueDraft?.note ?? ''}
                  isSharing={sharingItemId === item.id}
                  isInteractionLocked={isAnyShareActive}
                  onStartConfirm={() => handleStartConfirm(item.id)}
                  onConfirmInCart={() => commitShoppingChange(item.id, 'inCart')}
                  onCancelConfirm={() => removePendingConfirm(item.id)}
                  onOpenIssueForm={() => handleOpenIssueForm(item.id)}
                  onReasonChange={(reason) =>
                    setIssueDraft((current) =>
                      current?.itemId === item.id
                        ? { ...current, reason, note: reason === 'other' ? current.note : '' }
                        : current,
                    )
                  }
                  onIssueNoteChange={(note) =>
                    setIssueDraft((current) =>
                      current?.itemId === item.id ? { ...current, note } : current,
                    )
                  }
                  onShareConsultation={() => handleNewConsultation(item)}
                  onMarkNotBuying={() => {
                    if (status === 'consulting') {
                      commitShoppingChange(item.id, 'notBuying', itemIssues[item.id])
                    } else if (currentIssueDraft?.reason) {
                      commitShoppingChange(
                        item.id,
                        'notBuying',
                        createIssue(currentIssueDraft.reason, currentIssueDraft.note),
                      )
                    }
                  }}
                  onCancelIssueForm={() => setIssueDraft(null)}
                  onReshareConsultation={() => handleReshareConsultation(item)}
                  onReset={() => commitShoppingChange(item.id, 'pending')}
                />
              )
            })}
          </CategorySection>
        ))
      ) : (
        <section className="info-card">
          <p>表示できる商品がありません。</p>
        </section>
      )}

      {showCheckoutReview ? (
        <section
          className="info-card checkout-review-card"
          ref={checkoutReviewRef}
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
                          onClick={() => commitShoppingChange(item.id, 'verified')}
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
                          onClick={() => commitShoppingChange(item.id, 'inCart')}
                          aria-label={`${item.productNameSnapshot}の条件確認を戻す`}
                          disabled={isAnyShareActive}
                        >
                          確認を戻す
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => commitShoppingChange(item.id, 'pending')}
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
                  onClick={handleFinishShopping}
                >
                  買い物を終了する
                </button>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="info-card muted-card">
        <p>商品状態はこの端末の localStorage に保存されます。</p>
        <div className="inline-actions">
          <button type="button" className="ghost-button" onClick={onOpenCreate}>
            新しい依頼を作る
          </button>
        </div>
      </section>
    </main>
  )
}
