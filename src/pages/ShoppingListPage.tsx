import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CartConfirmationDialog } from '../components/CartConfirmationDialog'
import { CategorySection } from '../components/CategorySection'
import { CheckoutReviewSection } from '../components/CheckoutReviewSection'
import { ConsultationDialog } from '../components/ConsultationDialog'
import { ConsultationSummary } from '../components/ConsultationSummary'
import { NativeShareUnavailableNotice } from '../components/NativeShareUnavailableNotice'
import { ShoppingCompletionView } from '../components/ShoppingCompletionView'
import { ShoppingItemCard } from '../components/ShoppingItemCard'
import { ShoppingToolbar } from '../components/ShoppingToolbar'
import { ShoppingUndoNotice } from '../components/ShoppingUndoNotice'
import { FIXED_REQUEST_TITLE } from '../constants/request'
import {
  useConsultationWorkflow,
  type ConsultationShareLock,
} from '../hooks/useConsultationWorkflow'
import { usePersistedShoppingSession } from '../hooks/usePersistedShoppingSession'
import { useShoppingUndoNotice } from '../hooks/useShoppingUndoNotice'
import type {
  CheckedItemStatus,
  ItemIssue,
  ShoppingRequestItemPayload,
  ShoppingRequestPayload,
  ShoppingStateChange,
} from '../types/shopping'
import { addLineExternalBrowserHint } from '../utils/lineDeliveryUrl'
import {
  buildShoppingResultMessage,
} from '../utils/shoppingMessages'
import {
  selectShoppingPageView,
  type ShoppingFilterMode,
} from '../utils/shoppingPageView'
import {
  getItemStatus,
  getShoppingCompletionState,
  hasCondition,
} from '../utils/shoppingState'
import {
  loadShoppingSession,
  type RequestRouteCodec,
} from '../utils/shoppingSession'
import {
  isNativeShareAvailable,
  shareText,
  type NativeShareResult,
} from '../utils/shareText'

type ShoppingListPageProps = {
  encodedPayload: string
  payloadCodec: RequestRouteCodec
  onBackHome: () => void
  onError: (title: string, description: string) => void
}

type CartConfirmationState = {
  itemId: string
  needsQuantityConfirmation: boolean
  needsConditionConfirmation: boolean
  quantityConfirmed: boolean
  conditionConfirmed: boolean
  isConditionFollowUp: boolean
}

type ShareNotice = {
  kind: 'success' | 'error' | 'info'
  message: string
}

function getUndoNoticeMessage(
  item: ShoppingRequestItemPayload,
  change: ShoppingStateChange,
): string {
  if (change.nextStatus === 'inCart') {
    return `${item.productNameSnapshot}をかご済みにしました`
  }
  if (change.nextStatus === 'verified') {
    return `${item.productNameSnapshot}を購入時に条件確認してかご済みにしました`
  }
  if (change.nextStatus === 'notBuying') {
    return `${item.productNameSnapshot}を今回は買わないにしました`
  }
  return `${item.productNameSnapshot}を未購入に戻しました`
}

function getResultShareNotice(result: NativeShareResult): ShareNotice {
  if (result === 'shared') {
    return {
      kind: 'success',
      message:
        '共有画面を開きました。\nLINEを選択して結果を送信してください。',
    }
  }

  if (result === 'copied') {
    return {
      kind: 'success',
      message:
        'OS共有を利用できなかったため、結果をコピーしました。\nLINEへ貼り付けるか、外部ブラウザで開いて共有してください。',
    }
  }

  if (result === 'cancelled') {
    return {
      kind: 'info',
      message: '共有をキャンセルしました。相談内容はそのまま残しています。',
    }
  }

  return {
    kind: 'error',
    message:
      '共有またはコピーができませんでした。\n相談内容はそのまま残しています。外部ブラウザで開いてもう一度お試しください。',
  }
}

export function ShoppingListPage({
  encodedPayload,
  payloadCodec,
  onBackHome,
  onError,
}: ShoppingListPageProps) {
  const [payload, setPayload] = useState<ShoppingRequestPayload | null>(null)
  const {
    shoppingState,
    consultations,
    replaceSession,
    commitShoppingChange: commitPersistedShoppingChange,
    undoShoppingChange,
    updateConsultations,
    getCurrentShoppingState,
    getCurrentConsultations,
  } = usePersistedShoppingSession()
  const [filterMode, setFilterMode] = useState<ShoppingFilterMode>('all')
  const [cartConfirmation, setCartConfirmation] =
    useState<CartConfirmationState | null>(null)
  const [isCheckoutReviewOpen, setIsCheckoutReviewOpen] = useState(false)
  const [isCompletionView, setIsCompletionView] = useState(false)
  const {
    undoNotice,
    showUndoNotice,
    consumeUndoNotice,
    clearUndoNotice,
  } = useShoppingUndoNotice()
  const [isSharingResult, setIsSharingResult] = useState(false)
  const [shareNotice, setShareNotice] = useState<ShareNotice | null>(null)
  const activeShareRef = useRef(false)
  const resultShareGenerationRef = useRef(0)
  const checkoutReviewRef = useRef<HTMLElement | null>(null)
  const completionHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const nativeShareAvailable = isNativeShareAvailable()
  const externalBrowserUrl = useMemo(
    () => addLineExternalBrowserHint(window.location.href),
    [encodedPayload, payloadCodec],
  )
  const consultationShareLock = useMemo<ConsultationShareLock>(
    () => ({
      tryAcquire: () => {
        if (activeShareRef.current) {
          return false
        }
        activeShareRef.current = true
        return true
      },
      release: () => {
        activeShareRef.current = false
      },
    }),
    [],
  )

  const { checkedState, itemIssues, cartOrder } = shoppingState

  useEffect(
    () => () => {
      resultShareGenerationRef.current += 1
      activeShareRef.current = false
    },
    [],
  )

  const {
    sortedItems,
    cartItems,
    consultationItems,
    notBuyingItems,
    groupedVisibleItems,
    completionState,
    unresolvedCount,
  } = useMemo(
    () =>
      selectShoppingPageView({
        items: payload?.items ?? [],
        checkedState,
        consultations,
        cartOrder,
        filterMode,
      }),
    [cartOrder, checkedState, consultations, filterMode, payload],
  )
  const pendingItems = useMemo(
    () =>
      sortedItems.filter(
        (item) => getItemStatus(checkedState, item.id) === 'pending',
      ),
    [checkedState, sortedItems],
  )
  const getCurrentItemIssue = useCallback(
    (itemId: string) =>
      getCurrentShoppingState().itemIssues[itemId],
    [getCurrentShoppingState],
  )
  const {
    consultationDraft,
    isSharingConsultation,
    sharingConsultationItemId,
    openConsultation,
    closeConsultation,
    setReason: setConsultationReason,
    setNote: setConsultationNote,
    getDraftIssue,
    addToQueue: handleAddToQueue,
    shareDraftImmediately: handleShareDraftImmediately,
    shareIndividual: handleShareIndividual,
    shareQueued: handleShareQueued,
    removeConsultation: handleRemoveConsultation,
    resolveConsultation: handleResolveConsultation,
  } = useConsultationWorkflow({
    sessionKey: `${payloadCodec}:${encodedPayload}`,
    items: sortedItems,
    updateConsultations,
    getCurrentConsultations,
    getItemIssue: getCurrentItemIssue,
    share: shareText,
    shareLock: consultationShareLock,
    onNotice: setShareNotice,
  })

  useEffect(() => {
    resultShareGenerationRef.current += 1
    activeShareRef.current = false
    clearUndoNotice()

    try {
      const loadedSession = loadShoppingSession({
        encodedPayload,
        codec: payloadCodec,
      })

      setPayload(loadedSession.payload)
      replaceSession({
        requestId: loadedSession.payload.requestId,
        shoppingState: loadedSession.shoppingState,
        consultations: loadedSession.consultations,
      })
      setFilterMode('all')
      setCartConfirmation(null)
      setIsCheckoutReviewOpen(false)
      setIsCompletionView(false)
      setIsSharingResult(false)
      setShareNotice(null)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '共有URLの内容を読み込めませんでした。'
      onError('共有URLを開けませんでした', message)
    }
  }, [
    clearUndoNotice,
    encodedPayload,
    onError,
    payloadCodec,
    replaceSession,
  ])

  const commitShoppingChange = (
    itemId: string,
    nextStatus: CheckedItemStatus,
    nextIssue?: ItemIssue,
  ) => {
    const committedChange = commitPersistedShoppingChange(
      itemId,
      nextStatus,
      nextIssue,
    )

    if (!committedChange) {
      setCartConfirmation((current) =>
        current?.itemId === itemId ? null : current,
      )
      return false
    }

    const { change, previousCartOrder } = committedChange
    setShareNotice(null)
    const changedItem = payload?.items.find((item) => item.id === itemId)
    if (changedItem) {
      showUndoNotice({
        change,
        message: getUndoNoticeMessage(changedItem, change),
        previousCartOrder,
      })
    }
    setCartConfirmation((current) =>
      current?.itemId === itemId ? null : current,
    )
    return true
  }

  const handleOpenCartConfirmation = (
    item: ShoppingRequestItemPayload,
    isConditionFollowUp = false,
  ) => {
    const needsQuantityConfirmation =
      !isConditionFollowUp && item.quantity >= 2
    const needsConditionConfirmation = hasCondition(item)

    if (!needsQuantityConfirmation && !needsConditionConfirmation) {
      commitShoppingChange(item.id, 'inCart')
      return
    }

    closeConsultation()
    setShareNotice(null)
    setCartConfirmation({
      itemId: item.id,
      needsQuantityConfirmation,
      needsConditionConfirmation,
      quantityConfirmed: false,
      conditionConfirmed: false,
      isConditionFollowUp,
    })
  }

  const handleConfirmCart = () => {
    if (!cartConfirmation) {
      return
    }
    if (
      (cartConfirmation.needsQuantityConfirmation &&
        !cartConfirmation.quantityConfirmed) ||
      (cartConfirmation.needsConditionConfirmation &&
        !cartConfirmation.conditionConfirmed)
    ) {
      return
    }

    commitShoppingChange(
      cartConfirmation.itemId,
      cartConfirmation.needsConditionConfirmation ? 'verified' : 'inCart',
    )
  }

  const handleOpenConsultation = (itemId: string) => {
    setCartConfirmation(null)
    setShareNotice(null)
    openConsultation(itemId)
  }

  const handleMarkNotBuying = () => {
    const draftIssue = getDraftIssue()
    if (!draftIssue) {
      return
    }

    commitShoppingChange(
      draftIssue.itemId,
      'notBuying',
      draftIssue.issue,
    )
    closeConsultation()
  }

  const handleOpenCheckoutReview = () => {
    setIsCheckoutReviewOpen(true)
    window.requestAnimationFrame(() => {
      checkoutReviewRef.current?.focus()
      checkoutReviewRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  const handleUndo = () => {
    const currentUndoNotice = consumeUndoNotice()
    if (!currentUndoNotice) {
      return
    }
    const { change: lastChange, previousCartOrder } = currentUndoNotice

    undoShoppingChange(lastChange, previousCartOrder)
    setCartConfirmation((current) =>
      current?.itemId === lastChange.itemId ? null : current,
    )
  }

  const handleShareResult = async () => {
    if (activeShareRef.current) {
      return
    }

    const shareGeneration = resultShareGenerationRef.current
    activeShareRef.current = true
    setIsSharingResult(true)
    try {
      const result = await shareText({
        title: 'おつかい結果',
        text: buildShoppingResultMessage(
          completionState.purchasedCount,
          notBuyingItems.map((item) => ({
            item,
            issue: itemIssues[item.id],
          })),
        ),
      })
      if (shareGeneration !== resultShareGenerationRef.current) {
        return
      }

      setShareNotice(getResultShareNotice(result))
    } finally {
      if (shareGeneration === resultShareGenerationRef.current) {
        activeShareRef.current = false
        setIsSharingResult(false)
      }
    }
  }

  const handleFinishShopping = () => {
    const latestCompletionState = getShoppingCompletionState(
      sortedItems,
      getCurrentShoppingState().checkedState,
      getCurrentConsultations(),
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
      checkoutReviewRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  if (!payload) {
    return null
  }

  if (isCompletionView) {
    return (
      <ShoppingCompletionView
        allPurchased={completionState.notBuyingCount === 0}
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
    isCheckoutReviewOpen ||
    (sortedItems.length > 0 && completionState.pendingCount === 0)
  const cartConfirmationItem = cartConfirmation
    ? sortedItems.find((item) => item.id === cartConfirmation.itemId)
    : undefined
  const consultationDraftItem = consultationDraft
    ? sortedItems.find((item) => item.id === consultationDraft.itemId)
    : undefined

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
        {(cartItems.length > 0 || notBuyingItems.length > 0) &&
        !showCheckoutReview ? (
          <div className="checkout-callout">
            <p>購入内容と未処理の例外を会計前に確認できます。</p>
            <button
              type="button"
              className="primary-button"
              onClick={handleOpenCheckoutReview}
            >
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
          disabled={false}
          onUndo={handleUndo}
        />
      ) : null}

      {consultationItems.length > 0 ? (
        <ConsultationSummary
          entries={consultationItems}
          isSharingConsultation={isSharingConsultation}
          sharingItemId={sharingConsultationItemId}
          onShareQueued={handleShareQueued}
          onEdit={handleOpenConsultation}
          onShareIndividual={handleShareIndividual}
          onRemove={handleRemoveConsultation}
          onResolve={handleResolveConsultation}
        />
      ) : null}

      <ShoppingToolbar
        filterMode={filterMode}
        onToggleFilter={() =>
          setFilterMode((current) =>
            current === 'remaining' ? 'all' : 'remaining',
          )
        }
      />

      {groupedVisibleItems.length > 0 ? (
        groupedVisibleItems.map((group) => (
          <CategorySection
            key={group.id}
            name={group.name}
            count={group.items.length}
          >
            {group.items.map((item) => {
              const status = getItemStatus(checkedState, item.id)

              return (
                <ShoppingItemCard
                  key={item.id}
                  item={item}
                  status={status}
                  issue={itemIssues[item.id]}
                  consultation={consultations[item.id]}
                  isPurchaseLocked={false}
                  isConsultationLocked={isSharingConsultation}
                  onAddToCart={() => handleOpenCartConfirmation(item)}
                  onOpenConditionConfirmation={() =>
                    handleOpenCartConfirmation(item, true)
                  }
                  onOpenConsultation={() =>
                    handleOpenConsultation(item.id)
                  }
                  onReset={() =>
                    commitShoppingChange(item.id, 'pending')
                  }
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
          pendingItems={pendingItems}
          consultationEntries={consultationItems}
          checkedState={checkedState}
          itemIssues={itemIssues}
          completionState={completionState}
          isConsultationShareActive={isSharingConsultation}
          sectionRef={checkoutReviewRef}
          onResetItem={(itemId) =>
            commitShoppingChange(itemId, 'pending')
          }
          onOpenConditionConfirmation={(itemId) => {
            const item = sortedItems.find(
              (currentItem) => currentItem.id === itemId,
            )
            if (item) {
              handleOpenCartConfirmation(item, true)
            }
          }}
          onEditConsultation={handleOpenConsultation}
          onResolveConsultation={handleResolveConsultation}
          onFinishShopping={handleFinishShopping}
        />
      ) : null}

      {cartConfirmation && cartConfirmationItem ? (
        <CartConfirmationDialog
          item={cartConfirmationItem}
          needsQuantityConfirmation={
            cartConfirmation.needsQuantityConfirmation
          }
          needsConditionConfirmation={
            cartConfirmation.needsConditionConfirmation
          }
          quantityConfirmed={cartConfirmation.quantityConfirmed}
          conditionConfirmed={cartConfirmation.conditionConfirmed}
          isConditionFollowUp={cartConfirmation.isConditionFollowUp}
          isPurchaseLocked={false}
          isConsultationLocked={isSharingConsultation}
          onQuantityConfirmedChange={(confirmed) =>
            setCartConfirmation((current) =>
              current
                ? { ...current, quantityConfirmed: confirmed }
                : current,
            )
          }
          onConditionConfirmedChange={(confirmed) =>
            setCartConfirmation((current) =>
              current
                ? { ...current, conditionConfirmed: confirmed }
                : current,
            )
          }
          onConsult={() =>
            handleOpenConsultation(cartConfirmation.itemId)
          }
          onClose={() => setCartConfirmation(null)}
          onConfirm={handleConfirmCart}
        />
      ) : null}

      {consultationDraft && consultationDraftItem ? (
        <ConsultationDialog
          item={consultationDraftItem}
          selectedReason={consultationDraft.reason}
          note={consultationDraft.note}
          isSharing={
            isSharingConsultation &&
            sharingConsultationItemId === consultationDraft.itemId
          }
          onReasonChange={setConsultationReason}
          onNoteChange={setConsultationNote}
          onShareImmediately={handleShareDraftImmediately}
          onAddToQueue={handleAddToQueue}
          onMarkNotBuying={handleMarkNotBuying}
          onClose={closeConsultation}
        />
      ) : null}
    </main>
  )
}
