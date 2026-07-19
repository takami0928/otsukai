import { useEffect, useMemo, useRef, useState } from 'react'
import { products } from '../data/products'
import { categories } from '../data/categories'
import type { CreateDraftState } from '../types/shopping'
import { ProductCard } from '../components/ProductCard'
import { BottomBar } from '../components/BottomBar'
import {
  ImeAwareTextInput,
  type CommitTextResult,
} from '../components/ImeAwareTextInput'
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
  applyTitleChange,
  normalizeCustomQuantity,
  normalizeRequestDraftData,
  type DraftChangeResult,
} from '../utils/draftLimits'
import {
  calculateRequestBudget,
  countTotalConditionCharacters,
  validateDraftLimits,
  type CustomRequestDraftItem,
  type DraftLimitReason,
  type RequestBudgetContext,
  type RequestDraftData,
} from '../utils/requestBudget'
import {
  MAX_CUSTOM_ITEMS,
  MAX_CUSTOM_ITEM_NAME_CHARS,
  MAX_CUSTOM_ITEM_UNIT_CHARS,
  MAX_ITEM_CONDITION_CHARS,
  MAX_ITEM_QUANTITY,
  MAX_SHARE_URL_LENGTH,
  MAX_TITLE_CHARS,
  MAX_TOTAL_CONDITION_CHARS,
} from '../constants/requestLimits'
import {
  countUserCharacters,
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
import { shareText, type NativeShareResult } from '../utils/shareText'
import { buildLineDeliveryRequestUrl } from '../utils/lineDeliveryUrl'

type CreateRequestPageProps = {
  onBackHome: () => void
}

type CreateMode = 'edit' | 'review'
type ShareMessageStatus = 'success' | 'error' | 'cancelled' | ''

type CustomItem = CustomRequestDraftItem

type CreateRequestReturnState = {
  title: string
  customItems: CustomItem[]
  expandedProductIds: string[]
  sharedUrl: string
  sharedSnapshot: string
}

type InitialPageState = {
  draft: CreateDraftState
  expandedProductIds: Set<string>
  title: string
  customItems: CustomItem[]
  returnState?: CreateRequestReturnState
  wasNormalized: boolean
}

const DEFAULT_TITLE = '今日のおつかい'
const OTHER_CATEGORY_NAME = 'その他'
const CREATE_REQUEST_RETURN_STATE_KEY = 'otsukaiCreateRequestReturnState'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function loadCreateRequestReturnState(): CreateRequestReturnState | undefined {
  const historyState = isRecord(window.history.state) ? window.history.state : undefined
  const value = historyState?.[CREATE_REQUEST_RETURN_STATE_KEY]

  if (
    !isRecord(value) ||
    typeof value.title !== 'string' ||
    typeof value.sharedUrl !== 'string' ||
    typeof value.sharedSnapshot !== 'string' ||
    !Array.isArray(value.expandedProductIds) ||
    !value.expandedProductIds.every((item) => typeof item === 'string') ||
    !Array.isArray(value.customItems)
  ) {
    return undefined
  }

  const customItems = value.customItems.filter(
    (item): item is CustomItem =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.quantity === 'number' &&
      Number.isFinite(item.quantity) &&
      typeof item.unit === 'string' &&
      typeof item.memo === 'string',
  )

  return {
    title: value.title,
    customItems,
    expandedProductIds: [...value.expandedProductIds],
    sharedUrl: value.sharedUrl,
    sharedSnapshot: value.sharedSnapshot,
  }
}

function createInitialPageState(): InitialPageState {
  const returnState = loadCreateRequestReturnState()
  const initialDraft = createInitialCreateRequestState(loadCreateDraft(), products)
  const normalized = normalizeRequestDraftData({
    title: returnState?.title ?? DEFAULT_TITLE,
    draft: initialDraft.draft,
    customItems: returnState?.customItems ?? [],
  })

  return {
    draft: normalized.value.draft,
    expandedProductIds: new Set(
      returnState?.expandedProductIds ?? initialDraft.expandedProductIds,
    ),
    title: normalized.value.title,
    customItems: [...normalized.value.customItems],
    returnState,
    wasNormalized: initialDraft.wasNormalized || normalized.normalized,
  }
}

function saveCreateRequestReturnState(state: CreateRequestReturnState) {
  const historyState = isRecord(window.history.state) ? window.history.state : {}
  window.history.replaceState(
    { ...historyState, [CREATE_REQUEST_RETURN_STATE_KEY]: state },
    '',
  )
}

function clearCreateRequestReturnState() {
  if (
    !isRecord(window.history.state) ||
    !(CREATE_REQUEST_RETURN_STATE_KEY in window.history.state)
  ) {
    return
  }

  const { [CREATE_REQUEST_RETURN_STATE_KEY]: _returnState, ...historyState } =
    window.history.state
  window.history.replaceState(historyState, '')
}

function getLimitMessage(reason?: DraftLimitReason): string {
  switch (reason) {
    case 'quantity-limit':
      return '数量は20個までです。'
    case 'item-condition-limit':
      return '条件は30文字までです。'
    case 'total-condition-limit':
      return '条件の合計が1,000文字に達しました。不要な条件を短くすると、別の商品に入力できます。'
    case 'custom-item-limit':
      return '自由追加商品は10件までです。'
    case 'custom-name-limit':
      return '自由追加の商品名は30文字までです。'
    case 'custom-unit-limit':
      return '自由追加商品の単位は10文字までです。'
    case 'title-limit':
      return '依頼タイトルは30文字までです。'
    case 'url-limit':
      return 'LINEで送れるデータ量の上限に達しました。条件や自由追加商品を短くしてください。'
    case 'no-items':
      return '共有する商品を選んでください。'
    default:
      return ''
  }
}

function getShareResultMessage(result: NativeShareResult): {
  status: ShareMessageStatus
  message: string
} {
  switch (result) {
    case 'shared':
      return {
        status: 'success',
        message: '共有画面を開きました。LINEを選択して送信してください。',
      }
    case 'copied':
      return {
        status: 'success',
        message:
          '共有画面を開けなかったため、依頼文をコピーしました。LINEへ貼り付けて送ってください。',
      }
    case 'cancelled':
      return {
        status: 'cancelled',
        message: '共有をキャンセルしました。入力内容はそのまま残しています。',
      }
    case 'failed':
      return {
        status: 'error',
        message: '共有またはコピーができませんでした。もう一度お試しください。',
      }
  }
}

export function CreateRequestPage({ onBackHome }: CreateRequestPageProps) {
  const [initialPageState] = useState(createInitialPageState)
  const [draft, setDraft] = useState<CreateDraftState>(initialPageState.draft)
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(
    initialPageState.expandedProductIds,
  )
  const [title, setTitle] = useState(initialPageState.title)
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
  const [isCustomFormOpen, setIsCustomFormOpen] = useState(false)
  const [editingCustomIndex, setEditingCustomIndex] = useState<number | null>(null)
  const [customName, setCustomName] = useState('')
  const [customQuantity, setCustomQuantity] = useState(1)
  const [customUnit, setCustomUnit] = useState('個')
  const [customMemo, setCustomMemo] = useState('')
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
    () => ({ title, draft, customItems }),
    [customItems, draft, title],
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

  const currentRequestSnapshot = useMemo(
    () =>
      createRequestContentSnapshot({
        title,
        draft,
        productList: products,
        customItems,
      }),
    [customItems, draft, title],
  )

  const hasResettableInput = useMemo(
    () =>
      hasAnyCreateRequestInput({
        title,
        defaultTitle: DEFAULT_TITLE,
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
      title,
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
    setTitle(next.title)
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

  const handleTitleCommit = (value: string): CommitTextResult => {
    const result = applyTitleChange(requestData, value, budgetContext)
    applyChangeResult(result)
    return {
      value: result.value.title,
      accepted: result.accepted,
      reason: result.reason,
    }
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

  const closeCustomForm = () => {
    setIsCustomFormOpen(false)
    setEditingCustomIndex(null)
    setCustomName('')
    setCustomQuantity(1)
    setCustomUnit('個')
    setCustomMemo('')
  }

  const openCustomForm = (index?: number) => {
    if (typeof index === 'number') {
      const item = customItems[index]
      if (!item) {
        return
      }
      setEditingCustomIndex(index)
      setCustomName(item.name)
      setCustomQuantity(item.quantity)
      setCustomUnit(item.unit)
      setCustomMemo(item.memo)
    } else {
      setEditingCustomIndex(null)
      setCustomName('')
      setCustomQuantity(1)
      setCustomUnit('個')
      setCustomMemo('')
    }
    setLimitMessage('')
    setIsCustomFormOpen(true)
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
    if (editingCustomIndex === index) {
      closeCustomForm()
    } else if (editingCustomIndex !== null && editingCustomIndex > index) {
      setEditingCustomIndex(editingCustomIndex - 1)
    }
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
        title,
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
    setTitle(DEFAULT_TITLE)
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
        <label className="stack-field">
          <span>依頼タイトル</span>
          <ImeAwareTextInput
            value={title}
            aria-describedby="request-title-count"
            onCommit={handleTitleCommit}
            placeholder="例: 今日のおつかい"
          />
          <span id="request-title-count" className="character-count">
            {countUserCharacters(title)} / {MAX_TITLE_CHARS}
          </span>
        </label>
        {countUserCharacters(title) >= MAX_TITLE_CHARS ? (
          <p className="limit-inline-message">依頼タイトルは30文字までです。</p>
        ) : null}
        <p className="helper-text">
          商品はリストから数量で選びます。共有時は数量が1以上のものだけ送られます。
        </p>
      </section>

      <section className="info-card request-limit-summary" aria-live="polite">
        <strong>
          条件：{totalConditionCharacters.toLocaleString('ja-JP')} /{' '}
          {MAX_TOTAL_CONDITION_CHARS.toLocaleString('ja-JP')}文字
        </strong>
        {totalConditionCharacters >= MAX_TOTAL_CONDITION_CHARS ? (
          <>
            <p>条件の合計が1,000文字に達しました。</p>
            <p>不要な条件を短くすると、別の商品に入力できます。</p>
          </>
        ) : MAX_TOTAL_CONDITION_CHARS - totalConditionCharacters <= 100 ? (
          <p>
            条件はあと
            {MAX_TOTAL_CONDITION_CHARS - totalConditionCharacters}
            文字入力できます。
          </p>
        ) : null}
        {currentBudget ? (
          <p>
            共有URL：{currentBudget.urlLength.toLocaleString('ja-JP')} /{' '}
            {MAX_SHARE_URL_LENGTH.toLocaleString('ja-JP')}文字
          </p>
        ) : null}
        {limitMessage ? (
          <p className="limit-message" role="status">
            {limitMessage}
          </p>
        ) : null}
      </section>

      <section className="info-card custom-items-card">
        <div className="section-heading">
          <h2>追加したもの</h2>
          <span>
            {customItems.length} / {MAX_CUSTOM_ITEMS}件
          </span>
        </div>
        {customItems.length > 0 ? (
          <ul className="custom-items-list">
            {customItems.map((item, index) => (
              <li key={item.id}>
                <span>
                  <strong>{item.name}</strong> {item.quantity}
                  {item.unit}
                  {item.memo ? <small>条件: {item.memo}</small> : null}
                </span>
                <div className="custom-item-actions">
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    onClick={() => openCustomForm(index)}
                    aria-label={`${item.name}を編集`}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    className="custom-delete-button"
                    onClick={() => handleDeleteCustomItem(index)}
                    aria-label={`${item.name}を削除`}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="helper-text">
            リストにない商品を、今回の依頼だけに追加できます。
          </p>
        )}

        {isCustomFormOpen ? (
          <div className="custom-item-form">
            <strong>{editingCustomIndex === null ? '商品を追加' : '商品を編集'}</strong>
            <label className="stack-field">
              <span>商品名</span>
              <ImeAwareTextInput
                value={customName}
                aria-describedby="custom-name-count"
                onCommit={(value) =>
                  applyPendingTextChange(
                    'name',
                    value,
                    MAX_CUSTOM_ITEM_NAME_CHARS,
                    'custom-name-limit',
                  )
                }
                placeholder="例: 洗濯ネット"
              />
              <span id="custom-name-count" className="character-count">
                {countUserCharacters(customName)} / {MAX_CUSTOM_ITEM_NAME_CHARS}
              </span>
            </label>
            {countUserCharacters(customName) >= MAX_CUSTOM_ITEM_NAME_CHARS ? (
              <p className="limit-inline-message">自由追加の商品名は30文字までです。</p>
            ) : null}
            <div className="custom-item-form-row">
              <div className="stack-field">
                <span>数量</span>
                <div
                  className="quantity-stepper"
                  role="group"
                  aria-label={`${customName.trim() || '追加する商品'}の数量`}
                >
                  <button
                    type="button"
                    className="step-button"
                    onClick={() =>
                      handleCustomQuantityChange(customQuantity - 1)
                    }
                    disabled={customQuantity <= 1}
                    aria-label={`${customName.trim() || '追加する商品'}の数量を1減らす（現在${customQuantity}）`}
                  >
                    −
                  </button>
                  <input
                    className="quantity-number-input"
                    type="number"
                    min={1}
                    max={MAX_ITEM_QUANTITY}
                    step={1}
                    value={customQuantity}
                    onChange={(event) =>
                      handleCustomQuantityChange(event.target.value)
                    }
                    aria-label={`${customName.trim() || '追加する商品'}の数量（1から20）`}
                  />
                  <button
                    type="button"
                    className="step-button"
                    onClick={() =>
                      handleCustomQuantityChange(customQuantity + 1)
                    }
                    disabled={customQuantity >= MAX_ITEM_QUANTITY}
                    aria-label={`${customName.trim() || '追加する商品'}の数量を1増やす（現在${customQuantity}）`}
                  >
                    ＋
                  </button>
                </div>
                {customQuantity >= MAX_ITEM_QUANTITY ? (
                  <span className="limit-inline-message">
                    数量は20個までです。
                  </span>
                ) : null}
              </div>
              <label className="stack-field">
                <span>単位</span>
                <ImeAwareTextInput
                  value={customUnit}
                  aria-describedby="custom-unit-count"
                  onCommit={(value) =>
                    applyPendingTextChange(
                      'unit',
                      value,
                      MAX_CUSTOM_ITEM_UNIT_CHARS,
                      'custom-unit-limit',
                    )
                  }
                  placeholder="個"
                />
                <span id="custom-unit-count" className="character-count">
                  {countUserCharacters(customUnit)} / {MAX_CUSTOM_ITEM_UNIT_CHARS}
                </span>
                {countUserCharacters(customUnit) >= MAX_CUSTOM_ITEM_UNIT_CHARS ? (
                  <span className="limit-inline-message">単位は10文字までです。</span>
                ) : null}
              </label>
            </div>
            <label className="stack-field">
              <span>条件</span>
              <ImeAwareTextInput
                aria-label={
                  customName.trim()
                    ? `${customName.trim()}の条件`
                    : '追加する商品の条件'
                }
                aria-describedby="custom-condition-count"
                value={customMemo}
                onCommit={(value) =>
                  applyPendingTextChange(
                    'memo',
                    value,
                    MAX_ITEM_CONDITION_CHARS,
                    'item-condition-limit',
                  )
                }
                placeholder="例：安い方でOK、○○味、500g以上"
              />
              <span id="custom-condition-count" className="character-count">
                {countUserCharacters(customMemo)} / {MAX_ITEM_CONDITION_CHARS}
              </span>
            </label>
            {countUserCharacters(customMemo) >=
            MAX_ITEM_CONDITION_CHARS ? (
              <p className="limit-inline-message">条件は30文字までです。</p>
            ) : null}
            <div className="inline-actions">
              <button
                type="button"
                className="primary-button"
                onClick={handleSaveCustomItem}
                disabled={!customName.trim()}
              >
                {editingCustomIndex === null ? '追加' : '変更を保存'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={closeCustomForm}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : customItems.length >= MAX_CUSTOM_ITEMS ? (
          <p className="limit-inline-message">自由追加商品は10件までです。</p>
        ) : (
          <button
            type="button"
            className="secondary-button custom-add-button"
            onClick={() => openCustomForm()}
          >
            ＋ リストにないものを追加
          </button>
        )}
      </section>

      {groupedProducts.map(({ category, items }) => (
        <section key={category.id} className="category-block">
          <div className="section-heading">
            <h2>{category.name}</h2>
            <span>{items.length}商品</span>
          </div>
          <div className="product-list">
            {items.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                draft={draft[product.id]}
                isExpanded={expandedProductIds.has(product.id)}
                onIncrease={() => handleIncrease(product.id)}
                onDecrease={() => handleDecrease(product.id)}
                onToggleDetails={() =>
                  setExpandedProductIds((current) =>
                    toggleExpandedProductId(current, product.id),
                  )
                }
                onMemoCommit={(value) =>
                  handleConditionCommit(product.id, value)
                }
              />
            ))}
          </div>
        </section>
      ))}

      <BottomBar>
        <div>
          <strong>{selectedCount}件選択中</strong>
          <p>数量が1以上の商品だけ確認画面に表示します</p>
        </div>
        <div className="inline-actions bottom-bar-actions">
          <button
            type="button"
            className="ghost-button danger-button"
            onClick={handleReset}
          >
            入力内容を消去
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setMode('review')}
            disabled={!selectedCount}
          >
            確認へ
          </button>
        </div>
      </BottomBar>
    </>
  )

  const renderReview = () => (
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
          onClick={() => void handleShareRequest()}
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
          onClick={handleReturnToEdit}
          disabled={isSharingRequest}
        >
          修正する
        </button>
      </div>
    </>
  )

  return (
    <main className={`page ${mode === 'edit' ? 'page-with-bottom-bar' : ''}`}>
      {mode === 'edit' ? renderEdit() : null}
      {mode === 'review' ? renderReview() : null}
    </main>
  )
}
