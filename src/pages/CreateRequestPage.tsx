import { useEffect, useMemo, useRef, useState } from 'react'
import { products } from '../data/products'
import { categories } from '../data/categories'
import { FIXED_REQUEST_TITLE } from '../constants/request'
import type { CreateDraftState } from '../types/shopping'
import type { CommitTextResult } from '../components/ImeAwareTextInput'
import { CreateRequestBottomActions } from '../components/CreateRequestBottomActions'
import { CustomItemsSection } from '../components/CustomItemsSection'
import { ProductSelectionSections } from '../components/ProductSelectionSections'
import { RequestLimitNotice } from '../components/RequestLimitNotice'
import { RequestReviewView } from '../components/RequestReviewView'
import {
  loadCreateDraft,
  loadLastSharedUrl,
  saveCreateDraft,
  saveLastSharedUrl,
} from '../utils/storage'
import { createId } from '../utils/id'
import {
  createEmptyDraftState,
  createRequestContentSnapshot,
  createInitialCreateRequestState,
  hasAnyCreateRequestInput,
  resolveSharedRequestUrl,
  toggleExpandedProductId,
} from '../utils/createRequestState'
import {
  applyConditionChange,
  applyCustomItemAdd,
  applyCustomItemDelete,
  applyCustomItemUpdate,
  applyQuantityChange,
  normalizeCustomQuantity,
  normalizeRequestDraftData,
  type DraftChangeResult,
} from '../utils/draftLimits'
import {
  calculateRequestBudget,
  countTotalConditionCharacters,
  isShareUrlWarning,
  isTotalConditionWarning,
  validateDraftLimits,
  type CustomRequestDraftItem,
  type DraftLimitReason,
  type RequestBudgetContext,
  type RequestDraftData,
} from '../utils/requestBudget'
import {
  MAX_CUSTOM_ITEM_NAME_CHARS,
  MAX_CUSTOM_ITEM_UNIT_CHARS,
  MAX_ITEM_CONDITION_CHARS,
  MAX_ITEM_QUANTITY,
  MAX_SHARE_URL_LENGTH,
} from '../constants/requestLimits'
import {
  splitUserCharacters,
  truncateUserCharacters,
} from '../utils/textLength'
import { createRequestKey } from '../utils/compactRequest'
import {
  buildRequestShareMessage,
  REQUEST_SHARE_TITLE,
} from '../utils/requestShareMessage'
import {
  createRequestShareLock,
  isRequestUrlWithinShareLimit,
} from '../utils/shareRequest'
import { shareText } from '../utils/shareText'
import { buildLineDeliveryRequestUrl } from '../utils/lineDeliveryUrl'
import {
  clearCreateRequestReturnState,
  loadCreateRequestReturnState,
  saveCreateRequestReturnState,
  type CreateRequestReturnState,
} from '../utils/createRequestReturnState'
import {
  getLimitMessage,
  getShareResultMessage,
  type ShareMessageStatus,
} from '../utils/requestNoticeMessages'
import { useCustomItemEditor } from '../hooks/useCustomItemEditor'

type CreateRequestPageProps = {
  onBackHome: () => void
}

type CreateMode = 'edit' | 'review'

type CustomItem = CustomRequestDraftItem

type InitialPageState = {
  draft: CreateDraftState
  expandedProductIds: Set<string>
  customItems: CustomItem[]
  returnState?: CreateRequestReturnState
  wasNormalized: boolean
}

function createInitialPageState(): InitialPageState {
  const returnState = loadCreateRequestReturnState()
  const initialDraft = createInitialCreateRequestState(loadCreateDraft(), products)
  const normalized = normalizeRequestDraftData({
    title: FIXED_REQUEST_TITLE,
    draft: initialDraft.draft,
    customItems: returnState?.customItems ?? [],
  })

  return {
    draft: normalized.value.draft,
    expandedProductIds: new Set(
      returnState?.expandedProductIds ?? initialDraft.expandedProductIds,
    ),
    customItems: [...normalized.value.customItems],
    returnState,
    wasNormalized: initialDraft.wasNormalized || normalized.normalized,
  }
}

export function CreateRequestPage({ onBackHome }: CreateRequestPageProps) {
  const [initialPageState] = useState(createInitialPageState)
  const [draft, setDraft] = useState<CreateDraftState>(initialPageState.draft)
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(
    initialPageState.expandedProductIds,
  )
  const [mode, setMode] = useState<CreateMode>(
    initialPageState.returnState ? 'review' : 'edit',
  )
  const [sharedUrl, setSharedUrl] = useState(
    initialPageState.returnState?.sharedUrl ?? '',
  )
  const [sharedSnapshot, setSharedSnapshot] = useState(
    initialPageState.returnState?.sharedSnapshot ?? '',
  )
  const [lastSharedUrl, setLastSharedUrl] = useState(loadLastSharedUrl)
  const [shareMessage, setShareMessage] = useState(
    initialPageState.wasNormalized
      ? '保存されていた入力を新しい上限内に調整しました。'
      : '',
  )
  const [shareStatus, setShareStatus] = useState<ShareMessageStatus>(
    initialPageState.wasNormalized ? 'cancelled' : '',
  )
  const [limitMessage, setLimitMessage] = useState('')
  const [customItems, setCustomItems] = useState<CustomItem[]>(
    initialPageState.customItems,
  )
  const {
    isOpen: isCustomFormOpen,
    editingIndex: editingCustomIndex,
    name: customName,
    quantity: customQuantity,
    unit: customUnit,
    memo: customMemo,
    isDetailsOpen: isCustomDetailsOpen,
    setName: setCustomName,
    setQuantity: setCustomQuantity,
    setUnit: setCustomUnit,
    setMemo: setCustomMemo,
    openNew: openNewCustomForm,
    openExisting: openExistingCustomForm,
    handleItemDeleted: handleCustomItemDeleted,
    toggleDetails: toggleCustomDetails,
    reset: closeCustomForm,
  } = useCustomItemEditor()
  const [requestKey, setRequestKey] = useState(createRequestKey)
  const [isSharingRequest, setIsSharingRequest] = useState(false)
  const shareLockRef = useRef(createRequestShareLock())

  const requestBaseUrl = useMemo(
    () => `${window.location.origin}${window.location.pathname}`,
    [],
  )
  const budgetContext = useMemo<RequestBudgetContext>(
    () => ({ baseUrl: requestBaseUrl, requestKey }),
    [requestBaseUrl, requestKey],
  )
  const requestData = useMemo<RequestDraftData>(
    () => ({ title: FIXED_REQUEST_TITLE, draft, customItems }),
    [customItems, draft],
  )

  useEffect(() => {
    saveCreateDraft(draft)
  }, [draft])

  useEffect(() => {
    const clearReturnState = () => clearCreateRequestReturnState()

    clearReturnState()
    window.addEventListener('pageshow', clearReturnState)
    return () => window.removeEventListener('pageshow', clearReturnState)
  }, [])

  const selectedCount = useMemo(
    () =>
      Object.values(draft).filter((item) => item.quantity > 0).length +
      customItems.length,
    [customItems, draft],
  )

  const totalConditionCharacters = useMemo(
    () => countTotalConditionCharacters(requestData),
    [requestData],
  )

  const currentBudget = useMemo(() => {
    try {
      return calculateRequestBudget(requestData, budgetContext)
    } catch {
      return undefined
    }
  }, [budgetContext, requestData])
  const isConditionLimitWarning = isTotalConditionWarning(totalConditionCharacters)
  const isShareUrlLimitWarning =
    currentBudget ? isShareUrlWarning(currentBudget.urlLength) : false
  const isShareUrlOverLimit = (currentBudget?.urlLength ?? 0) > MAX_SHARE_URL_LENGTH
  const hasRequestLimitError =
    Boolean(limitMessage) || !currentBudget || isShareUrlOverLimit
  const showRequestLimitNotice =
    isConditionLimitWarning || isShareUrlLimitWarning || hasRequestLimitError

  const currentRequestSnapshot = useMemo(
    () =>
      createRequestContentSnapshot({
        title: FIXED_REQUEST_TITLE,
        draft,
        productList: products,
        customItems,
      }),
    [customItems, draft],
  )

  const hasResettableInput = useMemo(
    () =>
      hasAnyCreateRequestInput({
        title: FIXED_REQUEST_TITLE,
        defaultTitle: FIXED_REQUEST_TITLE,
        draft,
        productList: products,
        customItemCount: customItems.length,
        isCustomFormOpen,
        customName,
        customQuantity,
        customUnit,
        customMemo,
        sharedUrl,
        lastSharedUrl,
        mode,
        copyMessage: shareMessage,
      }),
    [
      customItems.length,
      customMemo,
      customName,
      customQuantity,
      customUnit,
      draft,
      isCustomFormOpen,
      lastSharedUrl,
      mode,
      shareMessage,
      sharedUrl,
    ],
  )

  const groupedProducts = useMemo(
    () =>
      categories
        .map((category) => ({
          category,
          items: products
            .filter((product) => product.categoryId === category.id)
            .sort((a, b) => a.sortOrder - b.sortOrder),
        }))
        .filter((group) => group.items.length > 0),
    [],
  )

  const groupedSelectedProducts = useMemo(
    () =>
      groupedProducts
        .map(({ category, items }) => ({
          category,
          items: items.filter(
            (product) => (draft[product.id]?.quantity ?? 0) > 0,
          ),
        }))
        .filter((group) => group.items.length > 0),
    [draft, groupedProducts],
  )

  const applyRequestData = (next: RequestDraftData) => {
    setDraft(next.draft)
    setCustomItems([...next.customItems])
  }

  const applyChangeResult = (
    result: DraftChangeResult<RequestDraftData>,
    urlMessage?: string,
  ) => {
    if (result.accepted) {
      applyRequestData(result.value)
    }
    setLimitMessage(
      result.reason === 'url-limit' && urlMessage
        ? urlMessage
        : getLimitMessage(result.reason),
    )
  }

  const handleIncrease = (productId: string) => {
    const currentQuantity = draft[productId]?.quantity ?? 0
    const result = applyQuantityChange(
      requestData,
      productId,
      currentQuantity + 1,
      budgetContext,
    )
    applyChangeResult(
      result,
      currentQuantity === 0
        ? 'この商品を追加すると、LINEで送れるデータ量を超えます。条件を短くしてから追加してください。'
        : undefined,
    )
  }

  const handleDecrease = (productId: string) => {
    const currentQuantity = draft[productId]?.quantity ?? 0
    applyChangeResult(
      applyQuantityChange(
        requestData,
        productId,
        currentQuantity - 1,
        budgetContext,
      ),
    )
  }

  const handleConditionCommit = (
    productId: string,
    value: string,
  ): CommitTextResult => {
    const result = applyConditionChange(
      requestData,
      { kind: 'product', productId },
      value,
      budgetContext,
    )
    applyChangeResult(result)
    return {
      value: result.value.draft[productId]?.memo ?? '',
      accepted: result.accepted,
      reason: result.reason,
    }
  }

  const openCustomForm = (index?: number) => {
    if (typeof index === 'number') {
      const item = customItems[index]
      if (!item) {
        return
      }
      openExistingCustomForm(index, item)
    } else {
      openNewCustomForm()
    }
    setLimitMessage('')
  }

  const pendingCustomItem = (
    overrides: Partial<CustomItem> = {},
  ): CustomItem => ({
    id:
      editingCustomIndex === null
        ? 'custom-preview'
        : customItems[editingCustomIndex]?.id ?? 'custom-preview',
    name: customName,
    quantity: customQuantity,
    unit: customUnit,
    memo: customMemo,
    ...overrides,
  })

  const previewCustomItem = (item: CustomItem) =>
    editingCustomIndex === null
      ? applyCustomItemAdd(requestData, item, budgetContext)
      : applyCustomItemUpdate(
          requestData,
          editingCustomIndex,
          item,
          budgetContext,
        )

  const applyPendingTextChange = (
    field: 'name' | 'unit' | 'memo',
    proposedValue: string,
    limit: number,
    fieldReason: DraftLimitReason,
  ): CommitTextResult => {
    const currentValue =
      field === 'name' ? customName : field === 'unit' ? customUnit : customMemo
    const fieldLimited = truncateUserCharacters(proposedValue, limit)
    const characters = splitUserCharacters(fieldLimited)
    let acceptedValue: string | undefined
    let rejectedReason: DraftLimitReason | undefined

    for (let length = characters.length; length >= 0; length -= 1) {
      const value = characters.slice(0, length).join('')
      const item = pendingCustomItem({ [field]: value })
      if (!item.name.trim()) {
        acceptedValue = value
        break
      }
      const result = previewCustomItem(item)
      if (result.accepted) {
        acceptedValue = value
        break
      }
      rejectedReason = result.reason
    }

    if (typeof acceptedValue === 'undefined') {
      const reason = rejectedReason ?? 'url-limit'
      setLimitMessage(getLimitMessage(reason))
      return { value: currentValue, accepted: false, reason }
    }

    if (field === 'name') {
      setCustomName(acceptedValue)
    } else if (field === 'unit') {
      setCustomUnit(acceptedValue)
    } else {
      setCustomMemo(acceptedValue)
    }

    const wasUrlLimited = acceptedValue !== fieldLimited
    const wasFieldLimited = fieldLimited !== proposedValue
    const reason = wasUrlLimited
      ? rejectedReason ?? 'url-limit'
      : wasFieldLimited
        ? fieldReason
        : undefined
    setLimitMessage(getLimitMessage(reason))
    return {
      value: acceptedValue,
      accepted: acceptedValue !== currentValue,
      reason,
    }
  }

  const handleCustomQuantityChange = (value: unknown) => {
    const quantity = normalizeCustomQuantity(value)
    const item = pendingCustomItem({ quantity })
    if (item.name.trim()) {
      const preview = previewCustomItem(item)
      if (!preview.accepted) {
        setLimitMessage(getLimitMessage(preview.reason))
        return
      }
    }
    setCustomQuantity(quantity)
    const numericValue = typeof value === 'number' ? value : Number(value)
    setLimitMessage(
      !Number.isFinite(numericValue) ||
        !Number.isInteger(numericValue) ||
        numericValue < 1 ||
        numericValue > MAX_ITEM_QUANTITY
        ? getLimitMessage('quantity-limit')
        : '',
    )
  }

  const handleSaveCustomItem = () => {
    const item = {
      id:
        editingCustomIndex === null
          ? createId('custom')
          : customItems[editingCustomIndex]?.id ?? createId('custom'),
      name: customName,
      quantity: customQuantity,
      unit: customUnit,
      memo: customMemo,
    }
    const result =
      editingCustomIndex === null
        ? applyCustomItemAdd(requestData, item, budgetContext)
        : applyCustomItemUpdate(
            requestData,
            editingCustomIndex,
            item,
            budgetContext,
          )
    applyChangeResult(result)
    if (result.accepted) {
      closeCustomForm()
    }
  }

  const handleDeleteCustomItem = (index: number) => {
    applyChangeResult(applyCustomItemDelete(requestData, index))
    handleCustomItemDeleted(index)
  }

  const resolveRequestUrlForShare = () => {
    const validation = validateDraftLimits(requestData, budgetContext, true)
    if (!validation.valid) {
      setShareMessage(getLimitMessage(validation.reason))
      setShareStatus('error')
      return ''
    }

    const reusableSharedUrl = sharedUrl.includes('#/l/')
      ? buildLineDeliveryRequestUrl(sharedUrl)
      : ''
    const resolved = resolveSharedRequestUrl(
      currentRequestSnapshot,
      sharedSnapshot,
      reusableSharedUrl,
      () => validation.url,
    )

    if (!resolved.reused || resolved.url !== sharedUrl) {
      setSharedUrl(resolved.url)
      setSharedSnapshot(resolved.snapshot)
      setLastSharedUrl(resolved.url)
      saveLastSharedUrl(resolved.url)
    }

    if (!resolved.reused) {
      setRequestKey(createRequestKey())
    }

    return resolved.url
  }

  const handleShareRequest = async () => {
    if (!shareLockRef.current.tryAcquire()) {
      return
    }

    try {
      const requestUrl = resolveRequestUrlForShare()
      if (!requestUrl) {
        return
      }
      if (!isRequestUrlWithinShareLimit(requestUrl)) {
        setShareMessage(getLimitMessage('url-limit'))
        setShareStatus('error')
        return
      }

      saveCreateDraft(draft)
      saveCreateRequestReturnState({
        customItems,
        expandedProductIds: [...expandedProductIds],
        sharedUrl: requestUrl,
        sharedSnapshot: currentRequestSnapshot,
      })

      setIsSharingRequest(true)
      setShareMessage('共有画面を開いています…')
      setShareStatus('cancelled')
      const result = await shareText({
        title: REQUEST_SHARE_TITLE,
        text: buildRequestShareMessage(requestUrl),
      })
      const notice = getShareResultMessage(result)
      setShareMessage(notice.message)
      setShareStatus(notice.status)
    } finally {
      shareLockRef.current.release()
      setIsSharingRequest(false)
    }
  }

  const handleReturnToEdit = () => {
    setShareMessage('')
    setShareStatus('')
    setMode('edit')
  }

  const handleReset = () => {
    if (
      hasResettableInput &&
      !window.confirm('入力内容をすべて消去しますか？')
    ) {
      return
    }

    const emptyDraft = createEmptyDraftState(products)
    setDraft(emptyDraft)
    saveCreateDraft(emptyDraft)
    setExpandedProductIds(new Set())
    setMode('edit')
    setSharedUrl('')
    setSharedSnapshot('')
    setLastSharedUrl('')
    saveLastSharedUrl('')
    setShareMessage('')
    setShareStatus('')
    setLimitMessage('')
    setCustomItems([])
    setRequestKey(createRequestKey())
    closeCustomForm()
  }

  const renderEdit = () => (
    <>
      <section className="top-bar">
        <button type="button" className="ghost-button" onClick={onBackHome}>
          戻る
        </button>
        <div>
          <p className="eyebrow">依頼作成</p>
          <h1>商品を選ぶ</h1>
        </div>
      </section>

      <section className="info-card">
        <p className="helper-text">
          商品はリストから数量で選びます。共有時は数量が1以上のものだけ送られます。
        </p>
      </section>

      {showRequestLimitNotice ? (
        <RequestLimitNotice
          hasError={hasRequestLimitError}
          isConditionWarning={isConditionLimitWarning}
          isShareUrlOverLimit={isShareUrlOverLimit}
          isShareUrlWarning={isShareUrlLimitWarning}
          limitMessage={limitMessage}
          shareUrlLength={currentBudget?.urlLength}
          totalConditionCharacters={totalConditionCharacters}
        />
      ) : null}

      <CustomItemsSection
        customItems={customItems}
        customMemo={customMemo}
        customName={customName}
        customQuantity={customQuantity}
        customUnit={customUnit}
        editingCustomIndex={editingCustomIndex}
        isCustomDetailsOpen={isCustomDetailsOpen}
        isCustomFormOpen={isCustomFormOpen}
        onCancel={closeCustomForm}
        onDelete={handleDeleteCustomItem}
        onMemoCommit={(value) =>
          applyPendingTextChange(
            'memo',
            value,
            MAX_ITEM_CONDITION_CHARS,
            'item-condition-limit',
          )
        }
        onNameCommit={(value) =>
          applyPendingTextChange(
            'name',
            value,
            MAX_CUSTOM_ITEM_NAME_CHARS,
            'custom-name-limit',
          )
        }
        onOpenForm={openCustomForm}
        onQuantityChange={handleCustomQuantityChange}
        onSave={handleSaveCustomItem}
        onToggleDetails={toggleCustomDetails}
        onUnitCommit={(value) =>
          applyPendingTextChange(
            'unit',
            value,
            MAX_CUSTOM_ITEM_UNIT_CHARS,
            'custom-unit-limit',
          )
        }
      />

      <ProductSelectionSections
        draft={draft}
        expandedProductIds={expandedProductIds}
        groups={groupedProducts}
        onConditionCommit={handleConditionCommit}
        onDecrease={handleDecrease}
        onIncrease={handleIncrease}
        onToggleDetails={(productId) =>
          setExpandedProductIds((current) =>
            toggleExpandedProductId(current, productId),
          )
        }
      />

      <CreateRequestBottomActions
        selectedCount={selectedCount}
        onReset={handleReset}
        onReview={() => setMode('review')}
      />
    </>
  )

  const renderReview = () => (
    <RequestReviewView
      customItems={customItems}
      draft={draft}
      groupedSelectedProducts={groupedSelectedProducts}
      isSharingRequest={isSharingRequest}
      onReturnToEdit={handleReturnToEdit}
      onShareRequest={handleShareRequest}
      selectedCount={selectedCount}
      shareMessage={shareMessage}
      shareStatus={shareStatus}
    />
  )

  return (
    <main className={`page ${mode === 'edit' ? 'page-with-bottom-bar' : ''}`}>
      {mode === 'edit' ? renderEdit() : null}
      {mode === 'review' ? renderReview() : null}
    </main>
  )
}
