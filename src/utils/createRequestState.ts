import type { Product } from '../types/product'
import type { CreateDraftState } from '../types/shopping'

type InitialCreateRequestState = {
  draft: CreateDraftState
  expandedProductIds: Set<string>
}

type CreateRequestInputState = {
  title: string
  defaultTitle: string
  draft: CreateDraftState
  productList: readonly Product[]
  customItemCount: number
  isCustomFormOpen: boolean
  customName: string
  customQuantity: number
  customUnit: string
  customMemo: string
  sharedUrl: string
  lastSharedUrl: string
  mode: string
  copyMessage: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0
  }

  return Math.floor(value)
}

export function createDraftState(
  saved: unknown,
  productList: readonly Product[],
): CreateDraftState {
  const savedItems = isRecord(saved) ? saved : {}
  const state: CreateDraftState = {}

  for (const product of productList) {
    const savedValue = savedItems[product.id]
    const savedItem = isRecord(savedValue) ? savedValue : undefined
    state[product.id] = {
      quantity: normalizeQuantity(savedItem?.quantity),
      memo: typeof savedItem?.memo === 'string' ? savedItem.memo : product.memo ?? '',
    }
  }

  return state
}

export function createEmptyDraftState(productList: readonly Product[]): CreateDraftState {
  const state: CreateDraftState = {}

  for (const product of productList) {
    state[product.id] = {
      quantity: 0,
      memo: '',
    }
  }

  return state
}

export function getSavedExpandedProductIds(
  saved: unknown,
  productList: readonly Product[],
): Set<string> {
  const savedItems = isRecord(saved) ? saved : {}
  const expandedProductIds = new Set<string>()

  for (const product of productList) {
    const savedValue = savedItems[product.id]
    const savedItem = isRecord(savedValue) ? savedValue : undefined
    if (typeof savedItem?.memo === 'string' && savedItem.memo.trim()) {
      expandedProductIds.add(product.id)
    }
  }

  return expandedProductIds
}

export function createInitialCreateRequestState(
  saved: unknown,
  productList: readonly Product[],
): InitialCreateRequestState {
  return {
    draft: createDraftState(saved, productList),
    expandedProductIds: getSavedExpandedProductIds(saved, productList),
  }
}

export function hasAnyCreateRequestInput({
  title,
  defaultTitle,
  draft,
  productList,
  customItemCount,
  isCustomFormOpen,
  customName,
  customQuantity,
  customUnit,
  customMemo,
  sharedUrl,
  lastSharedUrl,
  mode,
  copyMessage,
}: CreateRequestInputState): boolean {
  if (
    title !== defaultTitle ||
    customItemCount > 0 ||
    isCustomFormOpen ||
    customName.trim() !== '' ||
    customQuantity !== 1 ||
    customUnit !== '個' ||
    customMemo.trim() !== '' ||
    sharedUrl !== '' ||
    lastSharedUrl !== '' ||
    mode !== 'edit' ||
    copyMessage !== ''
  ) {
    return true
  }

  const productsById = new Map(productList.map((product) => [product.id, product]))

  return Object.entries(draft).some(([productId, item]) => {
    if (item.quantity > 0) {
      return true
    }

    const condition = item.memo.trim()
    if (!condition) {
      return false
    }

    const masterCondition = productsById.get(productId)?.memo?.trim() ?? ''
    return condition !== masterCondition
  })
}

export function increaseQuantity(currentQuantity: unknown): number {
  return normalizeQuantity(currentQuantity) + 1
}

export function decreaseQuantity(currentQuantity: unknown): number {
  return Math.max(0, normalizeQuantity(currentQuantity) - 1)
}

export function toggleExpandedProductId(
  current: ReadonlySet<string>,
  productId: string,
): Set<string> {
  const next = new Set(current)

  if (next.has(productId)) {
    next.delete(productId)
  } else {
    next.add(productId)
  }

  return next
}
