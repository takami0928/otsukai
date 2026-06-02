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
import { loadCreateDraft, saveCreateDraft, saveLastSharedUrl } from '../utils/storage'
import { createId } from '../utils/id'
import { encodeShoppingRequest } from '../utils/encodeRequest'

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

function getInitialDraftState(): CreateDraftState {
  const saved = loadCreateDraft()
  return createDraftState(saved)
}

function getEmptyDraftState(): CreateDraftState {
  return createDraftState({})
}

function createDraftState(saved: CreateDraftState): CreateDraftState {
  const state: CreateDraftState = {}

  for (const product of products) {
    const item = saved[product.id]
    state[product.id] = {
      quantity: item?.quantity ?? 0,
      memo: item?.memo ?? product.memo ?? '',
    }
  }

  return state
}

export function CreateRequestPage({ onBackHome }: CreateRequestPageProps) {
  const [draft, setDraft] = useState<CreateDraftState>(() => getInitialDraftState())
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null)
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [mode, setMode] = useState<CreateMode>('edit')
  const [sharedUrl, setSharedUrl] = useState('')
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
    const product = products.find((item) => item.id === productId)
    if (!product) {
      return
    }

    const currentQuantity = draft[productId]?.quantity ?? 0
    const nextQuantity = currentQuantity > 0 ? currentQuantity + 1 : product.defaultQuantity
    updateItem(productId, { quantity: nextQuantity })
  }

  const handleDecrease = (productId: string) => {
    const currentQuantity = draft[productId]?.quantity ?? 0
    updateItem(productId, { quantity: Math.max(0, currentQuantity - 1) })
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
    saveLastSharedUrl(url)
    return url
  }

  const copyUrl = async (url: string) => {
    if (!navigator.clipboard?.writeText) {
      setCopyMessage('自動コピーできませんでした。下のURLを長押ししてコピーしてください。')
      setCopyStatus('error')
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopyMessage('共有URLをコピーしました。LINEなどに貼り付けて送ってください。')
      setCopyStatus('success')
    } catch {
      setCopyMessage('自動コピーできませんでした。下のURLを長押ししてコピーしてください。')
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
    if (selectedCount > 0 && !window.confirm('選択内容をリセットしますか？')) {
      return
    }

    setDraft(getEmptyDraftState())
    setExpandedProductId(null)
    setTitle(DEFAULT_TITLE)
    setMode('edit')
    setSharedUrl('')
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
                  {item.memo ? <small>メモ: {item.memo}</small> : null}
                </span>
                <button
                  type="button"
                  className="custom-delete-button"
                  onClick={() => setCustomItems((current) => current.filter((currentItem) => currentItem.id !== item.id))}
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
              <label className="stack-field">
                <span>数量</span>
                <span className="quantity-stepper">
                  <button
                    type="button"
                    className="step-button"
                    onClick={() => setCustomQuantity((current) => Math.max(1, current - 1))}
                  >
                    −
                  </button>
                  <span className="quantity-value">{customQuantity}</span>
                  <button
                    type="button"
                    className="step-button"
                    onClick={() => setCustomQuantity((current) => current + 1)}
                  >
                    ＋
                  </button>
                </span>
              </label>
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
              <span>メモ</span>
              <input
                type="text"
                value={customMemo}
                onChange={(event) => setCustomMemo(event.target.value)}
                placeholder="任意"
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
                isExpanded={expandedProductId === product.id}
                onIncrease={() => handleIncrease(product.id)}
                onDecrease={() => handleDecrease(product.id)}
                onToggleDetails={() =>
                  setExpandedProductId((current) => (current === product.id ? null : product.id))
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
          <button type="button" className="ghost-button danger-button" onClick={handleReset} disabled={!selectedCount}>
            リセット
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
                  {item.memo.trim() ? <p className="review-memo">メモ: {item.memo.trim()}</p> : null}
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
                {item.memo ? <p className="review-memo">メモ: {item.memo}</p> : null}
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
        {copyMessage ? <p className={`copy-message ${copyStatus}`}>{copyMessage}</p> : null}
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
            リセット
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
