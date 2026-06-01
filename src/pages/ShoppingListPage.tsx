import { useEffect, useMemo, useState } from 'react'
import { CategorySection } from '../components/CategorySection'
import { ShoppingItemCard } from '../components/ShoppingItemCard'
import { decodeShoppingRequest } from '../utils/encodeRequest'
import { loadCheckedState, saveCheckedState } from '../utils/storage'
import type { CheckedStateMap, ShoppingRequestPayload } from '../types/shopping'

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
  const [filterMode, setFilterMode] = useState<FilterMode>('remaining')
  const [showCompleted, setShowCompleted] = useState(false)
  const [undoStack, setUndoStack] = useState<string[]>([])

  useEffect(() => {
    try {
      const decoded = decodeShoppingRequest(encodedPayload)
      setPayload(decoded)
      setCheckedState(loadCheckedState(decoded.requestId))
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
    () => sortedItems.filter((item) => checkedState[item.id] !== 'inCart'),
    [checkedState, sortedItems],
  )

  const completedItems = useMemo(
    () => sortedItems.filter((item) => checkedState[item.id] === 'inCart'),
    [checkedState, sortedItems],
  )

  const visibleItems = filterMode === 'all' ? sortedItems : remainingItems

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

  const toggleItem = (itemId: string) => {
    const nextChecked = checkedState[itemId] === 'inCart' ? 'pending' : 'inCart'
    setCheckedState((current) => ({ ...current, [itemId]: nextChecked }))
    if (nextChecked === 'inCart') {
      setUndoStack((current) => [...current, itemId])
    }
  }

  const handleUndo = () => {
    const lastId = undoStack[undoStack.length - 1]
    if (!lastId) {
      return
    }

    setCheckedState((current) => ({ ...current, [lastId]: 'pending' }))
    setUndoStack((current) => current.slice(0, -1))
  }

  if (!payload) {
    return null
  }

  const remainingCount = remainingItems.length

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
        <p className="lead">件の買い物が残っています</p>
        {remainingCount === 0 ? (
          <p className="completion-message">全部そろいました。買い忘れなしです。</p>
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
        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowCompleted((current) => !current)}
        >
          買ったものを見る
        </button>
      </section>

      {groupedVisibleItems.length > 0 ? (
        groupedVisibleItems.map((group) => (
          <CategorySection key={group.id} name={group.name} count={group.items.length}>
            {group.items.map((item) => (
              <ShoppingItemCard
                key={item.id}
                item={item}
                checked={checkedState[item.id] === 'inCart'}
                onToggle={() => toggleItem(item.id)}
              />
            ))}
          </CategorySection>
        ))
      ) : (
        <section className="info-card">
          <p>表示できる商品がありません。</p>
        </section>
      )}

      {showCompleted ? (
        <section className="info-card">
          <div className="section-heading">
            <h2>買ったもの</h2>
            <span>{completedItems.length}件</span>
          </div>
          <div className="completed-list">
            {completedItems.length > 0 ? (
              completedItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="completed-chip"
                  onClick={() => toggleItem(item.id)}
                >
                  {item.iconSnapshot} {item.productNameSnapshot}
                </button>
              ))
            ) : (
              <p className="helper-text">まだ消し込み済みの商品はありません。</p>
            )}
          </div>
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
