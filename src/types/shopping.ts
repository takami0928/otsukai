export type ShoppingRequestItemPayload = {
  id: string
  productId: string
  productNameSnapshot: string
  categoryIdSnapshot: string
  categoryNameSnapshot: string
  quantity: number
  unit: string
  memo?: string
  iconSnapshot: string
  sortOrderSnapshot: number
}

export type ShoppingRequestPayload = {
  requestId: string
  title: string
  createdAt: string
  items: ShoppingRequestItemPayload[]
}

export type CheckedItemStatus =
  | 'pending'
  | 'inCart'
  | 'verified'
  | 'consulting'
  | 'notBuying'

export type CheckedStateMap = Record<string, CheckedItemStatus>

export type UnavailableReason =
  | 'soldOut'
  | 'notFound'
  | 'conditionMismatch'
  | 'poorCondition'
  | 'other'

export type ItemIssue = {
  reason: UnavailableReason
  note?: string
}

export type ItemIssueMap = Record<string, ItemIssue>

export type ShoppingStateChange = {
  itemId: string
  previousStatus: CheckedItemStatus
  nextStatus: CheckedItemStatus
  previousIssue?: ItemIssue
  nextIssue?: ItemIssue
}

// Kept as an alias so existing callers can migrate without changing persisted data.
export type CheckedStatusChange = ShoppingStateChange

export type CartOrderList = string[]

export type CreateDraftItemState = {
  quantity: number
  memo: string
}

export type CreateDraftState = Record<string, CreateDraftItemState>
