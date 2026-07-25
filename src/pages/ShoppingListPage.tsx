import { useEffect, useMemo, useRef, useState } from 'react'
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
import { useShoppingUndoNotice } from '../hooks/useShoppingUndoNotice'
import type {
  CheckedItemStatus,
  ConsultationMap,
  ItemIssue,
  ShoppingRequestItemPayload,
  ShoppingRequestPayload,
  ShoppingStateChange,
  UnavailableReason,
} from '../types/shopping'
import { decodeCompactRequest } from '../utils/compactRequest'
import {
  createConsultationEntry,
  getConsultationIssue,
  migrateLegacyConsultingState,
  reconcileConsultations,
} from '../utils/consultationState'
import { decodeShoppingRequest } from '../utils/encodeRequest'
import { addLineExternalBrowserHint } from '../utils/lineDeliveryUrl'
import {
  buildBulkConsultationMessage,
  buildIndividualConsultationMessage,
  buildShoppingResultMessage,
} from '../utils/shoppingMessages'
import {
  selectShoppingPageView,
  type ShoppingFilterMode,
} from '../utils/shoppingPageView'
import {
  applyShoppingStateChange,
  createShoppingStateChange,
  getItemStatus,
  getShoppingCompletionState,
  hasCondition,
  isCartStatus,
  reconcileCheckedStateWithIssues,
  reconcileItemIssues,
  type ShoppingStateSnapshot,
} from '../utils/shoppingState'
import {
  isNativeShareAvailable,
  shareText,
  type NativeShareResult,
} from '../utils/shareText'
import {
  loadCartOrder,
  loadCheckedState,
  loadConsultations,
  loadItemIssues,
  saveCartOrder,
  saveCheckedState,
  saveConsultations,
  saveItemIssues,
} from '../utils/storage'

type ShoppingListPageProps = {
  encodedPayload: string
  payloadFormat: 'v1' | 'v2'
  onBackHome: () => void
  onError: (title: string, description: string) => void
}

type ConsultationDraft = {
  itemId: string
  reason?: UnavailableReason
  note: string
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
  payloadFormat,
  onBackHome,
  onError,
}: ShoppingListPageProps) {
  const [payload, setPayload] = useState<ShoppingRequestPayload | null>(null)
  const [shoppingState, setShoppingState] =
    useState<ShoppingStateSnapshot>(EMPTY_SHOPPING_STATE)
  const [consultations, setConsultations] = useState<ConsultationMap>({})
  const [filterMode, setFilterMode] = useState<ShoppingFilterMode>('all')
  const [cartConfirmation, setCartConfirmation] =
    useState<CartConfirmationState | null>(null)
  const [consultationDraft, setConsultationDraft] =
    useState<ConsultationDraft | null>(null)
  const [isCheckoutReviewOpen, setIsCheckoutReviewOpen] = useState(false)
  const [isCompletionView, setIsCompletionView] = useState(false)
  const {
    undoNotice,
    showUndoNotice,
    consumeUndoNotice,
    clearUndoNotice,
  } = useShoppingUndoNotice()
  const [isSharingConsultation, setIsSharingConsultation] = useState(false)
  const [sharingConsultationItemId, setSharingConsultationItemId] =
    useState<string | null>(null)
  const [isSharingResult, setIsSharingResult] = useState(false)
  const [shareNotice, setShareNotice] = useState<ShareNotice | null>(null)
  const activeShareRef = useRef(false)
  const shareGenerationRef = useRef(0)
  const shoppingStateRef =
    useRef<ShoppingStateSnapshot>(EMPTY_SHOPPING_STATE)
  const consultationsRef = useRef<ConsultationMap>({})
  const checkoutReviewRef = useRef<HTMLElement | null>(null)
  const completionHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const nativeShareAvailable = isNativeShareAvailable()
  const externalBrowserUrl = useMemo(
    () => addLineExternalBrowserHint(window.location.href),
    [encodedPayload, payloadFormat],
  )

  const { checkedState, itemIssues, cartOrder } = shoppingState

  useEffect(
    () => () => {
      shareGenerationRef.current += 1
      activeShareRef.current = false
    },
    [],
  )

  useEffect(() => {
    shareGenerationRef.current += 1
    activeShareRef.current = false
    clearUndoNotice()

    try {
      const decoded =
        payloadFormat === 'v2'
          ? decodeCompactRequest(encodedPayload)
          : decodeShoppingRequest(encodedPayload)
      const migration = migrateLegacyConsultingState(
        loadCheckedState(decoded.requestId),
        loadItemIssues(decoded.requestId),
        loadConsultations(decoded.requestId),
      )
      const nextCheckedState = reconcileCheckedStateWithIssues(
        migration.checkedState,
        migration.itemIssues,
      )
      const nextItemIssues = reconcileItemIssues(
        migration.itemIssues,
        nextCheckedState,
      )
      const nextConsultations = reconcileConsultations(
        migration.consultations,
        decoded.items.map((item) => item.id),
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
      consultationsRef.current = nextConsultations
      setPayload(decoded)
      setShoppingState(nextShoppingState)
      setConsultations(nextConsultations)
      setFilterMode('all')
      setCartConfirmation(null)
      setConsultationDraft(null)
      setIsCheckoutReviewOpen(false)
      setIsCompletionView(false)
      setIsSharingConsultation(false)
      setSharingConsultationItemId(null)
      setIsSharingResult(false)
      setShareNotice(null)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '共有URLの内容を読み込めませんでした。'
      onError('共有URLを開けませんでした', message)
    }
  }, [clearUndoNotice, encodedPayload, onError, payloadFormat])

  useEffect(() => {
    shoppingStateRef.current = shoppingState
  }, [shoppingState])

  useEffect(() => {
    consultationsRef.current = consultations
  }, [consultations])

  useEffect(() => {
    if (payload) {
      saveCheckedState(payload.requestId, checkedState)
    }
  }, [checkedState, payload])

  useEffect(() => {
    if (payload) {
      saveItemIssues(payload.requestId, itemIssues)
    }
  }, [itemIssues, payload])

  useEffect(() => {
    if (payload) {
      saveCartOrder(payload.requestId, cartOrder)
    }
  }, [cartOrder, payload])

  useEffect(() => {
    if (payload) {
      saveConsultations(payload.requestId, consultations)
    }
  }, [consultations, payload])

  const {
    sortedItems,
    cartItems,
    consultationItems,
    queuedConsultationItems,
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

  const updateConsultations = (
    updater: (current: ConsultationMap) => ConsultationMap,
  ) => {
    const nextConsultations = updater(consultationsRef.current)
    consultationsRef.current = nextConsultations
    setConsultations(nextConsultations)
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
      setCartConfirmation((current) =>
        current?.itemId === itemId ? null : current,
      )
      return false
    }

    const nextState = applyShoppingStateChange(currentState, change)
    shoppingStateRef.current = nextState
    setShoppingState(nextState)
    setShareNotice(null)
    const changedItem = payload?.items.find((item) => item.id === itemId)
    if (changedItem) {
      showUndoNotice({
        change,
        message: getUndoNoticeMessage(changedItem, change),
        previousCartOrder: [...currentState.cartOrder],
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

    setConsultationDraft(null)
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
    const consultationIssue = getConsultationIssue(
      consultationsRef.current[itemId],
    )
    const existingIssue =
      consultationIssue ?? shoppingStateRef.current.itemIssues[itemId]

    setCartConfirmation(null)
    setShareNotice(null)
    setConsultationDraft({
      itemId,
      reason: existingIssue?.reason,
      note: existingIssue?.note ?? '',
    })
  }

  const handleAddToQueue = () => {
    if (!consultationDraft?.reason) {
      return
    }

    const issue = createIssue(
      consultationDraft.reason,
      consultationDraft.note,
    )
    updateConsultations((current) => ({
      ...current,
      [consultationDraft.itemId]: createConsultationEntry(
        consultationDraft.itemId,
        issue,
        'queued',
      ),
    }))
    setConsultationDraft(null)
    setShareNotice({
      kind: 'info',
      message: 'まとめ相談に追加しました。',
    })
  }

  const performConsultationShare = async (
    entries: Array<{
      item: ShoppingRequestItemPayload
      issue: ItemIssue
    }>,
    mode: 'individual' | 'bulk',
  ) => {
    if (activeShareRef.current || entries.length === 0) {
      return
    }

    const shareGeneration = shareGenerationRef.current
    const individualItemId =
      mode === 'individual' ? entries[0].item.id : null
    activeShareRef.current = true
    setIsSharingConsultation(true)
    setSharingConsultationItemId(individualItemId)
    try {
      const consultationText =
        mode === 'individual'
          ? buildIndividualConsultationMessage(entries[0].item, entries[0].issue)
          : buildBulkConsultationMessage(entries)
      const result = await shareText({
        title: 'おつかい相談',
        text: consultationText,
      })
      if (shareGeneration !== shareGenerationRef.current) {
        return
      }

      if (result === 'shared' || result === 'copied') {
        const sharedItemIds = new Set(entries.map(({ item }) => item.id))
        updateConsultations((current) =>
          Object.fromEntries(
            Object.entries(current).map(([itemId, consultation]) => [
              itemId,
              sharedItemIds.has(itemId)
                ? { ...consultation, status: 'shared' as const }
                : consultation,
            ]),
          ),
        )
        if (
          individualItemId &&
          consultationDraft?.itemId === individualItemId
        ) {
          setConsultationDraft(null)
        }
      }

      setShareNotice(getShareNotice(result, 'consultation'))
    } finally {
      if (shareGeneration === shareGenerationRef.current) {
        activeShareRef.current = false
        setIsSharingConsultation(false)
        setSharingConsultationItemId(null)
      }
    }
  }

  const handleShareDraftImmediately = async () => {
    if (!consultationDraft?.reason) {
      return
    }

    const item = sortedItems.find(
      (currentItem) => currentItem.id === consultationDraft.itemId,
    )
    if (!item) {
      return
    }

    const issue = createIssue(
      consultationDraft.reason,
      consultationDraft.note,
    )
    updateConsultations((current) => ({
      ...current,
      [item.id]: createConsultationEntry(item.id, issue, 'queued'),
    }))
    await performConsultationShare([{ item, issue }], 'individual')
  }

  const handleShareIndividual = async (itemId: string) => {
    const entry = consultationsRef.current[itemId]
    const item = sortedItems.find((currentItem) => currentItem.id === itemId)
    const issue = getConsultationIssue(entry)
    if (!item || !issue || entry.status === 'resolved') {
      return
    }

    await performConsultationShare([{ item, issue }], 'individual')
  }

  const handleShareQueued = async () => {
    const entries = queuedConsultationItems.flatMap(
      ({ item, consultation }) => {
        const issue = getConsultationIssue(consultation)
        return issue ? [{ item, issue }] : []
      },
    )
    await performConsultationShare(entries, 'bulk')
  }

  const handleRemoveConsultation = (itemId: string) => {
    updateConsultations((current) => {
      const next = { ...current }
      delete next[itemId]
      return next
    })
    setConsultationDraft((current) =>
      current?.itemId === itemId ? null : current,
    )
  }

  const handleResolveConsultation = (itemId: string) => {
    updateConsultations((current) => {
      const consultation = current[itemId]
      return consultation
        ? {
            ...current,
            [itemId]: { ...consultation, status: 'resolved' },
          }
        : current
    })
    setConsultationDraft((current) =>
      current?.itemId === itemId ? null : current,
    )
  }

  const handleMarkNotBuying = () => {
    if (!consultationDraft?.reason) {
      return
    }

    commitShoppingChange(
      consultationDraft.itemId,
      'notBuying',
      createIssue(consultationDraft.reason, consultationDraft.note),
    )
    setConsultationDraft(null)
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
    setCartConfirmation((current) =>
      current?.itemId === lastChange.itemId ? null : current,
    )
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
          notBuyingItems.map((item) => ({
            item,
            issue: itemIssues[item.id],
          })),
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
      consultationsRef.current,
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
          onReasonChange={(reason) =>
            setConsultationDraft((current) =>
              current ? { ...current, reason } : current,
            )
          }
          onNoteChange={(note) =>
            setConsultationDraft((current) =>
              current ? { ...current, note } : current,
            )
          }
          onShareImmediately={handleShareDraftImmediately}
          onAddToQueue={handleAddToQueue}
          onMarkNotBuying={handleMarkNotBuying}
          onClose={() => setConsultationDraft(null)}
        />
      ) : null}
    </main>
  )
}
