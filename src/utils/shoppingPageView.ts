import type {
  CartOrderList,
  CheckedStateMap,
  ShoppingRequestItemPayload,
} from '../types/shopping'
import {
  getCartItemsForCheckout,
  getItemStatus,
  getShoppingCompletionState,
} from './shoppingState'
import { compareItemsByStoreOrder } from './storeOrder'

export type ShoppingFilterMode = 'remaining' | 'all'

export type ShoppingItemGroup = {
  id: string
  name: string
  items: ShoppingRequestItemPayload[]
}

export function selectSnapshotSortedItems(
  items: readonly ShoppingRequestItemPayload[],
): ShoppingRequestItemPayload[] {
  return [...items].sort(
    (left, right) => left.sortOrderSnapshot - right.sortOrderSnapshot,
  )
}

export function selectStoreOrderedItems(
  items: readonly ShoppingRequestItemPayload[],
): ShoppingRequestItemPayload[] {
  return [...items].sort(compareItemsByStoreOrder)
}

export function selectRemainingItems(
  storeOrderedItems: readonly ShoppingRequestItemPayload[],
  checkedState: CheckedStateMap,
): ShoppingRequestItemPayload[] {
  return storeOrderedItems.filter((item) => {
    const status = getItemStatus(checkedState, item.id)
    return status === 'pending' || status === 'consulting'
  })
}

export function selectItemsWithStatus(
  items: readonly ShoppingRequestItemPayload[],
  checkedState: CheckedStateMap,
  status: 'consulting' | 'notBuying',
): ShoppingRequestItemPayload[] {
  return items.filter((item) => getItemStatus(checkedState, item.id) === status)
}

export function selectVisibleItems(
  filterMode: ShoppingFilterMode,
  storeOrderedItems: readonly ShoppingRequestItemPayload[],
  remainingItems: readonly ShoppingRequestItemPayload[],
): ShoppingRequestItemPayload[] {
  return [...(filterMode === 'all' ? storeOrderedItems : remainingItems)]
}

export function groupVisibleItems(
  visibleItems: readonly ShoppingRequestItemPayload[],
): ShoppingItemGroup[] {
  const groups = new Map<
    string,
    { name: string; items: ShoppingRequestItemPayload[] }
  >()

  for (const item of visibleItems) {
    const existing = groups.get(item.categoryIdSnapshot)

    if (existing) {
      existing.items.push(item)
    } else {
      groups.set(item.categoryIdSnapshot, {
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
}

type SelectShoppingPageViewInput = {
  items: readonly ShoppingRequestItemPayload[]
  checkedState: CheckedStateMap
  cartOrder: CartOrderList
  filterMode: ShoppingFilterMode
}

export function selectShoppingPageView({
  items,
  checkedState,
  cartOrder,
  filterMode,
}: SelectShoppingPageViewInput) {
  const sortedItems = selectSnapshotSortedItems(items)
  const storeOrderedItems = selectStoreOrderedItems(items)
  const remainingItems = selectRemainingItems(storeOrderedItems, checkedState)
  const cartItems = getCartItemsForCheckout(
    sortedItems,
    checkedState,
    cartOrder,
  )
  const consultingItems = selectItemsWithStatus(
    sortedItems,
    checkedState,
    'consulting',
  )
  const notBuyingItems = selectItemsWithStatus(
    sortedItems,
    checkedState,
    'notBuying',
  )
  const visibleItems = selectVisibleItems(
    filterMode,
    storeOrderedItems,
    remainingItems,
  )
  const groupedVisibleItems = groupVisibleItems(visibleItems)
  const completionState = getShoppingCompletionState(sortedItems, checkedState)
  const unresolvedCount =
    completionState.pendingCount +
    completionState.consultingCount +
    completionState.needsVerificationCount

  return {
    sortedItems,
    storeOrderedItems,
    remainingItems,
    cartItems,
    consultingItems,
    notBuyingItems,
    visibleItems,
    groupedVisibleItems,
    completionState,
    unresolvedCount,
  }
}
