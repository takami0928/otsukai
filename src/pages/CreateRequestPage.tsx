import { useEffect, useMemo, useState } from 'react'
import { products } from '../data/products'
import { categories } from '../data/categories'
import type { CreateDraftItemState, CreateDraftState, ShoppingRequestPayload } from '../types/shopping'
import { ProductCard } from '../components/ProductCard'
import { BottomBar } from '../components/BottomBar'
import { loadCreateDraft, loadLastSharedUrl, saveCreateDraft, saveLastSharedUrl } from '../utils/storage'
import { createId } from '../utils/id'
import { encodeShoppingRequest } from '../utils/encodeRequest'

type CreateRequestPageProps = {
  onBackHome: () => void
}

function getInitialDraftState(): CreateDraftState {
  const saved = loadCreateDraft()
  const state: CreateDraftState = {}

  for (const product of products) {
    const item = saved[product.id]
    state[product.id] = {
      selected: item?.selected ?? false,
      quantity: item?.quantity ?? product.defaultQuantity,
      memo: item?.memo ?? product.memo ?? '',
    }
  }

  return state
}

export function CreateRequestPage({ onBackHome }: CreateRequestPageProps) {
  const [draft, setDraft] = useState<CreateDraftState>(() => getInitialDraftState())
  const [title, setTitle] = useState('今日のおつかい')
  const [sharedUrl, setSharedUrl] = useState(() => loadLastSharedUrl())
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    saveCreateDraft(draft)
  }, [draft])

  const selectedCount = useMemo(
    () => Object.values(draft).filter((item) => item.selected).length,
    [draft],
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

  const updateItem = (productId: string, next: Partial<CreateDraftItemState>) => {
    setDraft((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        ...next,
      },
    }))
  }

  const handleCreateUrl = () => {
    const selectedItems = products
      .filter((product) => draft[product.id]?.selected)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    if (selectedItems.length === 0) {
      setCopyMessage('商品を1つ以上選んでください。')
      return
    }

    const payload: ShoppingRequestPayload = {
      requestId: createId('request'),
      title: title.trim() || 'おつかい依頼',
      createdAt: new Date().toISOString(),
      items: selectedItems.map((product) => {
        const category = categories.find((item) => item.id === product.categoryId)
        const itemState = draft[product.id]

        return {
          id: createId('item'),
          productId: product.id,
          productNameSnapshot: product.name,
          categoryIdSnapshot: product.categoryId,
          categoryNameSnapshot: category?.name || 'その他',
          quantity: itemState.quantity,
          unit: product.unit,
          memo: itemState.memo.trim() || undefined,
          iconSnapshot: product.icon,
          sortOrderSnapshot: product.sortOrder,
        }
      }),
    }

    const encoded = encodeShoppingRequest(payload)
    const url = `${window.location.origin}${window.location.pathname}#/list?data=${encoded}`
    setSharedUrl(url)
    saveLastSharedUrl(url)
    setCopyMessage('共有URLを作成しました。')
  }

  const handleCopyUrl = async () => {
    if (!sharedUrl) {
      setCopyMessage('先に共有URLを作成してください。')
      return
    }

    try {
      await navigator.clipboard.writeText(sharedUrl)
      setCopyMessage('共有URLをコピーしました。')
    } catch {
      setCopyMessage('コピーに失敗しました。手動でURLを選択してください。')
    }
  }

  return (
    <main className="page page-with-bottom-bar">
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
            placeholder="例: 夕飯のおつかい"
          />
        </label>
        <p className="helper-text">選択した内容は URL に埋め込まれます。</p>
      </section>

      {groupedProducts.map(({ category, items }) => (
        <section key={category.id} className="category-block">
          <div className="section-heading">
            <h2>{category.name}</h2>
            <span>{items.length}商品</span>
          </div>
          <div className="product-grid">
            {items.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                draft={draft[product.id]}
                selected={draft[product.id].selected}
                onToggleSelect={() =>
                  updateItem(product.id, { selected: !draft[product.id].selected })
                }
                onQuantityChange={(value) => updateItem(product.id, { quantity: value })}
                onMemoChange={(value) => updateItem(product.id, { memo: value })}
              />
            ))}
          </div>
        </section>
      ))}

      <section className="info-card">
        <h2>共有URL</h2>
        <textarea readOnly value={sharedUrl} placeholder="URLを作成するとここに表示されます" rows={4} />
        {copyMessage ? <p className="helper-text">{copyMessage}</p> : null}
        <div className="inline-actions">
          <button type="button" className="primary-button" onClick={handleCopyUrl}>
            URLをコピー
          </button>
          <a
            className="secondary-button"
            href={sharedUrl || '#'}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!sharedUrl}
          >
            別タブで確認
          </a>
        </div>
      </section>

      <BottomBar>
        <div>
          <strong>{selectedCount}件選択中</strong>
          <p>買い物依頼URLを生成します</p>
        </div>
        <button type="button" className="primary-button" onClick={handleCreateUrl}>
          共有URLを作成
        </button>
      </BottomBar>
    </main>
  )
}
