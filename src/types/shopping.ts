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

export type CheckedItemStatus = 'pending' | 'inCart'

export type CheckedStateMap = Record<string, CheckedItemStatus>

export type CreateDraftItemState = {
  selected: boolean
  quantity: number
  memo: string
}

export type CreateDraftState = Record<string, CreateDraftItemState>
