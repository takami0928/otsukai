import type {
  CheckedItemStatus,
  CheckedStateMap,
  CheckedStatusChange,
  CartOrderList,
  ShoppingRequestItemPayload,
} from '../types/shopping'

const VALID_CHECKED_STATUSES = new Set<CheckedItemStatus>(['pending', 'inCart', 'verified'])

export type ShoppingCompletionState = {
  pendingCount: number
  needsVerificationCount: number
  isReadyForCheckoutReview: boolean
  isComplete: boolean
}

export function isCheckedItemStatus(value: unknown): value is CheckedItemStatus {
  return typeof value === 'string' && VALID_CHECKED_STATUSES.has(value as CheckedItemStatus)
}

export function normalizeCheckedState(value: unknown): CheckedStateMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const normalized: CheckedStateMap = {}
  for (const [itemId, status] of Object.entries(value)) {
    if (isCheckedItemStatus(status)) {
      normalized[itemId] = status
    }
  }

  return normalized
}

export function normalizeCartOrder(value: unknown): CartOrderList {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const normalized: CartOrderList = []

  for (const itemId of value) {
    if (typeof itemId === 'string' && !seen.has(itemId)) {
      seen.add(itemId)
      normalized.push(itemId)
    }
  }

  return normalized
}

export function addToCartOrder(order: CartOrderList, itemId: string): CartOrderList {
  const normalized = normalizeCartOrder(order)
  return normalized.includes(itemId) ? normalized : [...normalized, itemId]
}

export function removeFromCartOrder(order: CartOrderList, itemId: string): CartOrderList {
  return normalizeCartOrder(order).filter((currentItemId) => currentItemId !== itemId)
}

export function getItemStatus(
  checkedState: CheckedStateMap,
  itemId: string,
): CheckedItemStatus {
  const status = checkedState[itemId]
  return isCheckedItemStatus(status) ? status : 'pending'
}

export function createCheckedStatusChange(
  checkedState: CheckedStateMap,
  itemId: string,
  nextStatus: CheckedItemStatus,
): CheckedStatusChange | null {
  const previousStatus = getItemStatus(checkedState, itemId)
  if (previousStatus === nextStatus) {
    return null
  }

  return { itemId, previousStatus, nextStatus }
}

export function hasCondition(item: ShoppingRequestItemPayload): boolean {
  return Boolean(item.memo?.trim())
}

export function getShoppingCompletionState(
  items: ShoppingRequestItemPayload[],
  checkedState: CheckedStateMap,
): ShoppingCompletionState {
  const pendingCount = items.filter((item) => getItemStatus(checkedState, item.id) === 'pending').length
  const needsVerificationCount = items.filter(
    (item) => hasCondition(item) && getItemStatus(checkedState, item.id) !== 'verified',
  ).length

  return {
    pendingCount,
    needsVerificationCount,
    isReadyForCheckoutReview: pendingCount === 0 && items.length > 0,
    isComplete: pendingCount === 0 && needsVerificationCount === 0 && items.length > 0,
  }
}

export function getCartItemsInCartOrder(
  items: ShoppingRequestItemPayload[],
  checkedState: CheckedStateMap,
  cartOrder: CartOrderList,
): ShoppingRequestItemPayload[] {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const orderedItemIds = normalizeCartOrder(cartOrder)
  const addedItemIds = new Set<string>()
  const orderedItems: ShoppingRequestItemPayload[] = []

  for (const itemId of orderedItemIds) {
    const item = itemById.get(itemId)
    if (!item || getItemStatus(checkedState, item.id) === 'pending') {
      continue
    }

    addedItemIds.add(item.id)
    orderedItems.push(item)
  }

  const fallbackItems = items
    .filter((item) => getItemStatus(checkedState, item.id) !== 'pending' && !addedItemIds.has(item.id))
    .sort((a, b) => a.sortOrderSnapshot - b.sortOrderSnapshot)

  return [...orderedItems, ...fallbackItems]
}
