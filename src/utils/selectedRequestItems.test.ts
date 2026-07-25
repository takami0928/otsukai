import { describe, expect, it } from 'vitest'
import type { EffectiveProduct } from '../types/householdCatalog'
import { buildSelectedRequestItems } from './selectedRequestItems'

const products: EffectiveProduct[] = [
  {
    id: 'visible',
    name: '表示商品',
    categoryId: 'vegetables',
    defaultQuantity: 1,
    unit: '個',
    icon: '🛒',
    sortOrder: 2,
    source: 'base',
    hidden: false,
    isCustomized: false,
  },
  {
    id: 'hidden',
    name: '非表示商品',
    categoryId: 'other',
    defaultQuantity: 1,
    unit: '袋',
    icon: '🛒',
    sortOrder: 1,
    source: 'base',
    hidden: true,
    isCustomized: true,
  },
]

describe('selected request item projection', () => {
  it('keeps hidden selected products, stable catalog order, and visible snapshots', () => {
    expect(
      buildSelectedRequestItems(
        products,
        {
          visible: { quantity: 1, memo: '' },
          hidden: { quantity: 2, memo: '条件' },
        },
        [],
      ),
    ).toEqual([
      {
        productId: 'hidden',
        name: '非表示商品',
        unit: '袋',
        categoryId: 'other',
        sortOrder: 1,
        quantity: 2,
        memo: '条件',
        icon: '🛒',
        hidden: true,
      },
      {
        productId: 'visible',
        name: '表示商品',
        unit: '個',
        categoryId: 'vegetables',
        sortOrder: 2,
        quantity: 1,
        memo: '',
        icon: '🛒',
        hidden: false,
      },
    ])
  })

  it('drops a hidden product only after its quantity reaches zero', () => {
    expect(
      buildSelectedRequestItems(
        products,
        {
          visible: { quantity: 0, memo: '' },
          hidden: { quantity: 0, memo: '保持される下書き条件' },
        },
        [],
      ),
    ).toEqual([])
  })

  it('adds one-time custom items as v3 snapshot candidates', () => {
    expect(
      buildSelectedRequestItems(
        [],
        {},
        [{ name: ' 一回商品 ', quantity: 3, unit: '', memo: ' 条件 ' }],
      ),
    ).toEqual([
      {
        productId: 'custom:0',
        name: '一回商品',
        unit: '個',
        categoryId: 'other',
        sortOrder: 10_000,
        quantity: 3,
        memo: '条件',
        icon: '🛒',
        hidden: false,
      },
    ])
  })
})
