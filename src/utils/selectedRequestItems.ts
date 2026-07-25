import type { EffectiveProduct } from '../types/householdCatalog'
import type { CreateDraftState } from '../types/shopping'

export type SelectedRequestItem = {
  productId: string
  name: string
  unit: string
  categoryId: string
  sortOrder: number
  quantity: number
  memo: string
  icon: string
  hidden: boolean
}

export type SelectedCustomRequestItem = {
  name: string
  quantity: number
  unit: string
  memo: string
}

export function buildSelectedRequestItems(
  effectiveProducts: readonly EffectiveProduct[],
  draft: CreateDraftState,
  customItems: readonly SelectedCustomRequestItem[],
): SelectedRequestItem[] {
  const selectedProducts = effectiveProducts
    .filter((product) => (draft[product.id]?.quantity ?? 0) > 0)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.id.localeCompare(right.id, 'ja'),
    )
    .map((product) => ({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      categoryId: product.categoryId,
      sortOrder: product.sortOrder,
      quantity: draft[product.id].quantity,
      memo: draft[product.id].memo.trim(),
      icon: product.icon,
      hidden: product.hidden,
    }))

  return [
    ...selectedProducts,
    ...customItems.map((item, index) => ({
      productId: `custom:${index}`,
      name: item.name.trim(),
      unit: item.unit.trim() || '個',
      categoryId: 'other',
      sortOrder: 10_000 + index,
      quantity: item.quantity,
      memo: item.memo.trim(),
      icon: '🛒',
      hidden: false,
    })),
  ]
}
