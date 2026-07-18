import { useEffect, useMemo, useState } from 'react'
import { products } from '../data/products'
import { categories } from '../data/categories'
import type {
  CreateDraftItemState,
  CreateDraftState,
  ShoppingRequestItemPayload,
  ShoppingRequestPayload,
} from '../types/shopping'
import { ProductCard } from '../components/ProductCard'
import { BottomBar } from '../components/BottomBar'
import {
  loadCreateDraft,
  loadLastSharedUrl,
  saveCreateDraft,
  saveLastSharedUrl,
} from '../utils/storage'
import { createId } from '../utils/id'
import { encodeShoppingRequest } from '../utils/encodeRequest'
import {
  createEmptyDraftState,
  createInitialCreateRequestState,
  decreaseQuantity,
  hasAnyCreateRequestInput,
  increaseQuantity,
  toggleExpandedProductId,
} from '../utils/createRequestState'

type CreateRequestPageProps = {
  onBackHome: () => void
}

type CreateMode = 'edit' | 'review' | 'shared'
type CopyStatus = 'success' | 'error' | ''
type CustomItem = {
  id: string
  name: string
  quantity: number
  unit: string
  memo: string
}

const DEFAULT_TITLE = '今日のおつかい'
const OTHER_CATEGORY_ID = 'other'
const OTHER_CATEGORY_NAME = 'その他'
const CUSTOM_ITEM_SORT_ORDER = 10000

export function CreateRequestPage({ onBackHome }: CreateRequestPageProps) {
  const [initialState] = useState(() =>
    createInitialCreateRequestState(loadCreateDraft(), products),
  )
  const [draft, setDraft] = useState<CreateDraftState>(initialState.draft)
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(
    initialState.expandedProductIds,
  )
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [mode, setMode] = useState<CreateMode>('edit')
  const [sharedUrl, setSharedUrl] = useState('')
  const [lastSharedUrl, setLastSharedUrl] = useState(() => loadLastSharedUrl())
  const [copyMessage, setCopyMessage] = useState('')
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('')
  const [customItems, setCustomItems] = useState<CustomItem[]>([])
  const [isCustomFormOpen, setIsCustomFormOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customQuantity, setCustomQuantity] = useState(1)
  const [customUnit, setCustomUnit] = useState('個')
  const [customMemo, setCustomMemo] = useState('')

  useEffect(() => {
    saveCreateDraft(draft)
  }, [draft])

  const selectedCount = useMemo(
    () => Object.values(draft).filter((item) => item.quantity > 0).length + customItems.length,
    [customItems, draft],
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
        copyMessage,
      }),
    [
      copyMessage,
      customItems.length,
      customMemo,
      customName,
      customQuantity,
      customUnit,
      draft,
      isCustomFormOpen,
      lastSharedUrl,
      mode,
      sharedUrl,
      title,
    ],
  )

  const groupedProducts = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        items: products
          .filter((product) => product.categoryId === category.id)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }))
      .filter((group) => group.items.length > 0)
  }, [])

  const groupedSelectedProducts = useMemo(() => {
    return groupedProducts
      .map(({ category, items }) => ({
        category,
        items: items.filter((product) => (draft[product.id]?.quantity ?? 0) > 0),
      }))
      .filter((group) => group.items.length > 0)
  }, [draft, groupedProducts])

  const updateItem = (productId: string, next: Partial<CreateDraftItemState>) => {
    setDraft((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        ...next,
      },
    }))
  }

  const handleIncrease = (productId: string) => {
    const currentQuantity = draft[productId]?.quantity ?? 0
    updateItem(productId, { quantity: increaseQuantity(currentQuantity) })
  }

  const handleDecrease = (productId: string) => {
    const currentQuantity = draft[productId]?.quantity ?? 0
    updateItem(productId, { quantity: decreaseQuantity(currentQuantity) })
  }

  const closeCustomForm = () => {
    setIsCustomFormOpen(false)
    setCustomName('')
    setCustomQuantity(1)
    setCustomUnit('個')
    setCustomMemo('')
  }

  const handleAddCustomItem = () => {
    const name = customName.trim()
    if (!name) {
      return
    }

    setCustomItems((current) => [
      ...current,
      {
        id: createId('custom'),
        name,
        quantity: customQuantity,
        unit: customUnit.trim() || '個',
        memo: customMemo.trim(),
      },
    ])
    closeCustomForm()
  }

  const createCustomPayloadItems = (): ShoppingRequestItemPayload[] =>
    customItems.map((item, index) => ({
      id: createId('item'),
      productId: `custom:${item.id}`,
      productNameSnapshot: item.name,
      categoryIdSnapshot: OTHER_CATEGORY_ID,
      categoryNameSnapshot: OTHER_CATEGORY_NAME,
      quantity: item.quantity,
      unit: item.unit,
      memo: item.memo || undefined,
      iconSnapshot: '🛒',
      sortOrderSnapshot: CUSTOM_ITEM_SORT_ORDER + index,
    }))

  const createUrl = () => {
    const selectedItems = products
      .filter((product) => (draft[product.id]?.quantity ?? 0) > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    if (selectedItems.length === 0 && customItems.length === 0) {
      return ''
    }

    const payload: ShoppingRequestPayload = {
      requestId: createId('request'),
      title: title.trim() || 'おつかい依頼',
      createdAt: new Date().toISOString(),
      items: [
        ...selectedItems.map((product) => {
          const category = categories.find((item) => item.id === product.categoryId)
          const itemState = draft[product.id]

          return {
            id: createId('item'),
            productId: product.id,
            productNameSnapshot: product.name,
            categoryIdSnapshot: product.categoryId,
            categoryNameSnapshot: category?.name || OTHER_CATEGORY_NAME,
            quantity: itemState.quantity,
            unit: product.unit,
            memo: itemState.memo.trim() || undefined,
            iconSnapshot: product.icon,
            sortOrderSnapshot: product.sortOrder,
          }
        }),
        ...createCustomPayloadItems(),
      ],
    }

    const encoded = encodeShoppingRequest(payload)
    const url = `${window.location.origin}${window.location.pathname}#/list?data=${encoded}`
    setSharedUrl(url)
    setLastSharedUrl(url)
    saveLastSharedUrl(url)
    return url
  }

  const copyUrl = async (url: string) => {
    if (!navigator.clipboard?.writeText) {
      setCopyMessage('自動コピーできませんでした。下のURLを選択し、ブラウザのコピー機能をご利用ください。')
      setCopyStatus('error')
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopyMessage('共有URLをコピーしました。LINEなどに貼り付けて送ってください。')
      setCopyStatus('success')
    } catch {
      setCopyMessage('自動コピーできませんでした。下のURLを選択し、ブラウザのコピー機能をご利用ください。')
      setCopyStatus('error')
    }
  }

  const handleCreateUrl = async () => {
    const url = createUrl()
    if (!url) {
      setMode('edit')
      return
    }

    setMode('shared')
    await copyUrl(url)
  }

  const handleReset = () => {
    if (hasResettableInput && !window.confirm('入力内容をすべて消去しますか？')) {
      return
    }

    const emptyDraft = createEmptyDraftState(products)
    setDraft(emptyDraft)
    saveCreateDraft(emptyDraft)
    setExpandedProductIds(new Set())
    setTitle(DEFAULT_TITLE)
    setMode('edit')
    setSharedUrl('')
    setLastSharedUrl('')
    saveLastSharedUrl('')
    setCopyMessage('')
    setCopyStatus('')
    setCustomItems([])
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
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例: 今日のおつかい"
          />
        </label>
        <p className="helper-text">商品はリストから数量で選びます。共有時は数量が1以上のものだけ送られます。</p>
      </section>

      <section className="info-card custom-items-card">
        <div className="section-heading">
          <h2>追加したもの</h2>
          <span>{customItems.length}件</span>
        </div>
        {customItems.length > 0 ? (
          <ul className="custom-items-list">
            {customItems.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.name}</strong> {item.quantity}{item.unit}
                  {item.memo ? <small>条件: {item.memo}</small> : null}
                </span>
                <button
                  type="button"
                  className="custom-delete-button"
                  onClick={() => setCustomItems((current) => current.filter((currentItem) => currentItem.id !== item.id))}
                  aria-label={`${item.name}を削除`}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="helper-text">リストにない商品を、今回の依頼だけに追加できます。</p>
        )}

        {isCustomFormOpen ? (
          <div className="custom-item-form">
            <label className="stack-field">
              <span>商品名</span>
              <input
                type="text"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="例: 洗濯ネット"
              />
            </label>
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
                    onClick={() => setCustomQuantity((current) => Math.max(1, current - 1))}
                    aria-label={`${customName.trim() || '追加する商品'}の数量を1減らす（現在${customQuantity}）`}
                  >
                    −
                  </button>
                  <span className="quantity-value">{customQuantity}</span>
                  <button
                    type="button"
                    className="step-button"
                    onClick={() => setCustomQuantity((current) => current + 1)}
                    aria-label={`${customName.trim() || '追加する商品'}の数量を1増やす（現在${customQuantity}）`}
                  >
                    ＋
                  </button>
                </div>
              </div>
              <label className="stack-field">
                <span>単位</span>
                <input
                  type="text"
                  value={customUnit}
                  onChange={(event) => setCustomUnit(event.target.value)}
                  placeholder="個"
                />
              </label>
            </div>
            <label className="stack-field">
              <span>条件</span>
              <input
                type="text"
                aria-label={customName.trim() ? `${customName.trim()}の条件` : '追加する商品の条件'}
                value={customMemo}
                onChange={(event) => setCustomMemo(event.target.value)}
                placeholder="例：安い方でOK、○○味、500g以上"
              />
            </label>
            <div className="inline-actions">
              <button type="button" className="primary-button" onClick={handleAddCustomItem} disabled={!customName.trim()}>
                追加
              </button>
              <button type="button" className="ghost-button" onClick={closeCustomForm}>
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="secondary-button custom-add-button" onClick={() => setIsCustomFormOpen(true)}>
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
                onMemoChange={(value) => updateItem(product.id, { memo: value })}
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
          <button type="button" className="ghost-button danger-button" onClick={handleReset}>
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
                  <strong>{product.name}</strong> {item.quantity}{product.unit}
                  {item.memo.trim() ? <p className="review-memo">条件: {item.memo.trim()}</p> : null}
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
                <strong>{item.name}</strong> {item.quantity}{item.unit}
                {item.memo ? <p className="review-memo">条件: {item.memo}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="inline-actions">
        <button type="button" className="ghost-button" onClick={() => setMode('edit')}>
          修正する
        </button>
        <button type="button" className="primary-button" onClick={handleCreateUrl}>
          URLを作成してコピー
        </button>
      </div>
    </>
  )

  const renderShared = () => (
    <>
      <section className="top-bar">
        <div>
          <p className="eyebrow">依頼作成</p>
          <h1>共有URLを作成しました</h1>
        </div>
      </section>

      <section className="info-card">
        {copyMessage ? <p className={`copy-message ${copyStatus}`} role="status">{copyMessage}</p> : null}
        <label className="stack-field">
          <span>共有URL</span>
          <textarea readOnly value={sharedUrl} rows={5} />
        </label>
        <div className="inline-actions">
          <button type="button" className="primary-button" onClick={() => copyUrl(sharedUrl)}>
            もう一度コピー
          </button>
          <a className="secondary-button" href={sharedUrl} target="_blank" rel="noreferrer">
            開いて確認
          </a>
          <button type="button" className="ghost-button" onClick={() => setMode('edit')}>
            修正する
          </button>
          <button type="button" className="ghost-button danger-button" onClick={handleReset}>
            入力内容を消去
          </button>
        </div>
      </section>
    </>
  )

  return (
    <main className={`page ${mode === 'edit' ? 'page-with-bottom-bar' : ''}`}>
      {mode === 'edit' ? renderEdit() : null}
      {mode === 'review' ? renderReview() : null}
      {mode === 'shared' ? renderShared() : null}
    </main>
  )
}
