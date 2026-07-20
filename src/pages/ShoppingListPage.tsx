import { useEffect, useMemo, useRef, useState } from 'react'
import { CategorySection } from '../components/CategorySection'
import { CheckoutReviewSection } from '../components/CheckoutReviewSection'
import { ConsultationSummary } from '../components/ConsultationSummary'
import { NativeShareUnavailableNotice } from '../components/NativeShareUnavailableNotice'
import { ShoppingCompletionView } from '../components/ShoppingCompletionView'
import { ShoppingItemCard } from '../components/ShoppingItemCard'
import { ShoppingToolbar } from '../components/ShoppingToolbar'
import { ShoppingUndoNotice } from '../components/ShoppingUndoNotice'
import { FIXED_REQUEST_TITLE } from '../constants/request'
import { decodeShoppingRequest } from '../utils/encodeRequest'
import { decodeCompactRequest } from '../utils/compactRequest'
import {
  applyShoppingStateChange,
  createShoppingStateChange,
  getCartItemsForCheckout,
  getItemStatus,
  getShoppingCompletionState,
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
} from '../utils/shoppingMessages'
import {
  isNativeShareAvailable,
  shareText,
  type NativeShareResult,
} from '../utils/shareText'
import { addLineExternalBrowserHint } from '../utils/lineDeliveryUrl'
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
type UndoNoticeState = {
  change: ShoppingStateChange
  message: string
  previousCartOrder: string[]
} | null

const UNDO_NOTICE_DURATION_MS = 5_000

const EMPTY_SHOPPING_STATE: ShoppingStateSnapshot = {
  checkedState: {},
  itemIssues: {},
  cartOrder: [],
}

function createIssue(reason: UnavailableReason, note: string): ItemIssue {
  const trimmedNote = note.trim()
  return trimmedNote ? { reason, note: trimmedNote } : { reason }
}

function getUndoNoticeMessage(
  item: ShoppingRequestItemPayload,
  change: ShoppingStateChange,
): string {
  if (change.nextStatus === 'inCart') {
    return change.previousStatus === 'verified'
      ? `${item.productNameSnapshot}の条件確認を戻しました`
      : `${item.productNameSnapshot}をかご済みにしました`
  }
  if (change.nextStatus === 'verified') {
    return `${item.productNameSnapshot}を条件確認済みにしました`
  }
  if (change.nextStatus === 'consulting') {
    return `${item.productNameSnapshot}を相談リストに追加しました`
  }
  if (change.nextStatus === 'notBuying') {
    return `${item.productNameSnapshot}を今回は買わないにしました`
  }
  return change.previousStatus === 'consulting'
    ? `${item.productNameSnapshot}の相談を取り消しました`
    : `${item.productNameSnapshot}を未購入に戻しました`
}

function getShareNotice(
  result: NativeShareResult,
  subject: 'consultation' | 'result',
): ShareNotice {
  if (result === 'shared') {
    return {
      kind: 'success',
      message:
        subject === 'result'
          ? '共有画面を開きました。\nLINEを選択して結果を送信してください。'
          : '共有画面を開きました。\nLINEを選択して送信してください。',
    }
  }

  if (result === 'copied') {
    return {
      kind: 'success',
      message:
        subject === 'result'
          ? 'OS共有を利用できなかったため、結果をコピーしました。\nLINEへ貼り付けるか、外部ブラウザで開いて共有してください。'
          : 'OS共有を利用できなかったため、相談文をコピーしました。\nLINEへ貼り付けるか、外部ブラウザで開いて共有してください。',
    }
  }

  if (result === 'cancelled') {
    return { kind: 'info', message: '共有をキャンセルしました。状態は変更していません。' }
  }

  return {
    kind: 'error',
    message:
      '共有またはコピーができませんでした。\n外部ブラウザで開いてもう一度お試しください。',
  }
}

export function ShoppingListPage({
  encodedPayload,
  payloadFormat,
  onBackHome,
  onError,
}: ShoppingListPageProps) {
  const [payload, setPayload] = useState<ShoppingRequestPayload | null>(null)
  const [shoppingState, setShoppingState] = useState<ShoppingStateSnapshot>(EMPTY_SHOPPING_STATE)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [pendingConfirmItemId, setPendingConfirmItemId] = useState<string | null>(null)
  const [isCheckoutReviewOpen, setIsCheckoutReviewOpen] = useState(false)
  const [isCompletionView, setIsCompletionView] = useState(false)
  const [undoNotice, setUndoNotice] = useState<UndoNoticeState>(null)
  const [issueDraft, setIssueDraft] = useState<IssueDraft | null>(null)
  const [isSharingConsultation, setIsSharingConsultation] = useState(false)
  const [isSharingResult, setIsSharingResult] = useState(false)
  const [shareNotice, setShareNotice] = useState<ShareNotice | null>(null)
  const activeShareRef = useRef(false)
  const shareGenerationRef = useRef(0)
  const undoNoticeRef = useRef<UndoNoticeState>(null)
  const undoTimerRef = useRef<number | null>(null)
  const shoppingStateRef = useRef<ShoppingStateSnapshot>(EMPTY_SHOPPING_STATE)
  const checkoutReviewRef = useRef<HTMLElement | null>(null)
  const completionHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const nativeShareAvailable = isNativeShareAvailable()
  const externalBrowserUrl = useMemo(
    () => addLineExternalBrowserHint(window.location.href),
    [encodedPayload, payloadFormat],
  )

  const { checkedState, itemIssues, cartOrder } = shoppingState

  useEffect(() => {
    shareGenerationRef.current += 1
    activeShareRef.current = false
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    undoNoticeRef.current = null
    setUndoNotice(null)

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
      setIssueDraft(null)
      setIsSharingConsultation(false)
      setIsSharingResult(false)
      setShareNotice(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '共有URLの内容を読み込めませんでした。'
      onError('共有URLを開けませんでした', message)
    }
  }, [encodedPayload, onError, payloadFormat])

  useEffect(
    () => () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current)
      }
    },
    [],
  )

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
  const isAnyShareActive = isSharingConsultation || isSharingResult

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
    setShareNotice(null)
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current)
    }
    const changedItem = payload?.items.find((item) => item.id === itemId)
    if (changedItem) {
      const nextUndoNotice = {
        change,
        message: getUndoNoticeMessage(changedItem, change),
        previousCartOrder: [...currentState.cartOrder],
      }
      undoNoticeRef.current = nextUndoNotice
      setUndoNotice(nextUndoNotice)
      const timerId = window.setTimeout(() => {
        if (undoNoticeRef.current === nextUndoNotice) {
          undoNoticeRef.current = null
          setUndoNotice(null)
        }
        if (undoTimerRef.current === timerId) {
          undoTimerRef.current = null
        }
      }, UNDO_NOTICE_DURATION_MS)
      undoTimerRef.current = timerId
    }
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
    const currentUndoNotice = undoNoticeRef.current
    if (!currentUndoNotice) {
      return
    }
    const { change: lastChange, previousCartOrder } = currentUndoNotice

    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }

    const revertedState = applyShoppingStateChange(
      shoppingStateRef.current,
      lastChange,
      'undo',
    )
    const nextState = {
      ...revertedState,
      cartOrder: [...previousCartOrder],
    }
    shoppingStateRef.current = nextState
    setShoppingState(nextState)
    removePendingConfirm(lastChange.itemId)
    setIssueDraft((current) => (current?.itemId === lastChange.itemId ? null : current))
    undoNoticeRef.current = null
    setUndoNotice(null)
  }

  const handleAddToConsultation = (item: ShoppingRequestItemPayload) => {
    if (issueDraft?.itemId !== item.id || !issueDraft.reason) {
      return
    }

    const issue = createIssue(issueDraft.reason, issueDraft.note)
    commitShoppingChange(item.id, 'consulting', issue)
  }

  const handleShareConsultation = async () => {
    if (activeShareRef.current || consultingItems.length === 0) {
      return
    }

    const shareGeneration = shareGenerationRef.current
    activeShareRef.current = true
    setIsSharingConsultation(true)
    try {
      const consultationText =
        consultingItems.length === 1
          ? buildIndividualConsultationMessage(
              consultingItems[0],
              itemIssues[consultingItems[0].id],
            )
          : buildBulkConsultationMessage(
              consultingItems.map((item) => ({ item, issue: itemIssues[item.id] })),
            )
      const result = await shareText({
        title: 'おつかい相談',
        text: consultationText,
      })
      if (shareGeneration !== shareGenerationRef.current) {
        return
      }

      setShareNotice(getShareNotice(result, 'consultation'))
    } finally {
      if (shareGeneration === shareGenerationRef.current) {
        activeShareRef.current = false
        setIsSharingConsultation(false)
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

      setShareNotice(getShareNotice(result, 'result'))
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
      <ShoppingCompletionView
        allPurchased={allPurchased}
        nativeShareAvailable={nativeShareAvailable}
        externalBrowserUrl={externalBrowserUrl}
        completionState={completionState}
        completionHeadingRef={completionHeadingRef}
        shareNotice={shareNotice}
        notBuyingItems={notBuyingItems}
        itemIssues={itemIssues}
        isSharingResult={isSharingResult}
        onShareResult={handleShareResult}
        onReviewShopping={handleReviewShopping}
        onBackHome={onBackHome}
      />
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
          <h1>{FIXED_REQUEST_TITLE}</h1>
        </div>
      </section>

      {!nativeShareAvailable ? (
        <NativeShareUnavailableNotice externalBrowserUrl={externalBrowserUrl} />
      ) : null}

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

      {undoNotice ? (
        <ShoppingUndoNotice
          message={undoNotice.message}
          disabled={isAnyShareActive}
          onUndo={handleUndo}
        />
      ) : null}

      {consultingItems.length > 0 ? (
        <ConsultationSummary
          consultingItemCount={consultingItems.length}
          isSharingConsultation={isSharingConsultation}
          isAnyShareActive={isAnyShareActive}
          onShareConsultation={handleShareConsultation}
        />
      ) : null}

      <ShoppingToolbar
        filterMode={filterMode}
        onToggleFilter={() =>
          setFilterMode((current) => (current === 'remaining' ? 'all' : 'remaining'))
        }
      />

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
                  onAddToConsultation={() => handleAddToConsultation(item)}
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
        <CheckoutReviewSection
          cartItems={cartItems}
          notBuyingItems={notBuyingItems}
          checkedState={checkedState}
          itemIssues={itemIssues}
          completionState={completionState}
          isAnyShareActive={isAnyShareActive}
          sectionRef={checkoutReviewRef}
          onChangeStatus={commitShoppingChange}
          onFinishShopping={handleFinishShopping}
        />
      ) : null}
    </main>
  )
}
