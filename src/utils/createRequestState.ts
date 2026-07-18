import type { Product } from '../types/product'
import type { CreateDraftState } from '../types/shopping'

type InitialCreateRequestState = {
  draft: CreateDraftState
  expandedProductIds: Set<string>
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
