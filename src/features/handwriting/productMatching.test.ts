import { describe, expect, it } from 'vitest'
import { products } from '../../data/products'
import type { EffectiveProduct } from '../../types/householdCatalog'
import { matchOcrProductLines } from './productMatching'

function effective(
  id: string,
  overrides: Partial<EffectiveProduct> = {},
): EffectiveProduct {
  const base = products.find((product) => product.id === id)
  if (!base) {
    throw new Error(`Missing fixture product: ${id}`)
  }
  return {
    ...base,
    source: 'base',
    hidden: false,
    isCustomized: false,
    ...overrides,
  }
}

describe('matchOcrProductLines', () => {
  it('initially selects a unique normalized product-name exact match', () => {
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: '牛乳' }],
      [effective('milk')],
    )

    expect(match.initialProductId).toBe('milk')
    expect(match.candidates).toEqual([
      expect.objectContaining({
        productId: 'milk',
        matchKind: 'name-exact',
      }),
    ])
  })

  it('matches an exact registered alias from たまご to the current 卵 product', () => {
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: 'たまご' }],
      [effective('eggs')],
    )

    expect(match.initialProductId).toBe('eggs')
    expect(match.candidates[0]).toMatchObject({
      productId: 'eggs',
      productName: '卵',
      matchKind: 'alias-exact',
    })
  })

  it('normalizes full-width and half-width characters', () => {
    const product = effective('milk', { name: 'Milk' })
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: 'ＭＩＬＫ' }],
      [product],
    )
    expect(match.initialProductId).toBe('milk')
  })

  it('normalizes hiragana and katakana', () => {
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: 'ニンジン' }],
      [effective('carrot')],
    )
    expect(match.initialProductId).toBe('carrot')
  })

  it('ignores a bullet and a conservative trailing quantity while matching', () => {
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: '・ 牛乳 2本' }],
      [effective('milk')],
    )
    expect(match.productText).toBe('牛乳')
    expect(match.initialProductId).toBe('milk')
  })

  it('does not damage 三連豆腐 while matching', () => {
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: '三連豆腐' }],
      [effective('three-pack-tofu'), effective('tofu')],
    )
    expect(match.initialProductId).toBe('three-pack-tofu')
  })

  it('does not damage 5kg米 while matching', () => {
    const product = effective('rice', { name: '5kg米' })
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: '5kg米' }],
      [product],
    )
    expect(match.initialProductId).toBe('rice')
  })

  it('shows 牛乳 as a similarity candidate for 豆乳 without auto-selecting it', () => {
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: '豆乳' }],
      [effective('milk')],
    )
    expect(match.initialProductId).toBeUndefined()
    expect(match.candidates).toEqual([
      expect.objectContaining({
        productId: 'milk',
        matchKind: 'similar',
      }),
    ])
  })

  it('uses a household-renamed effective product name as the exact name', () => {
    const renamed = effective('carrot', {
      name: '家庭にんじん',
      isCustomized: true,
    })
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: '家庭ニンジン' }],
      [renamed],
    )
    expect(match.initialProductId).toBe('carrot')
    expect(match.candidates[0].productName).toBe('家庭にんじん')
  })

  it('matches a household-added effective product', () => {
    const householdProduct: EffectiveProduct = {
      id: 'household:123e4567-e89b-42d3-a456-426614174000',
      name: '麦茶パック',
      unit: '袋',
      categoryId: 'drinks',
      defaultQuantity: 1,
      icon: '🛒',
      sortOrder: 11_000,
      source: 'household',
      hidden: false,
      isCustomized: true,
    }
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: '麦茶パック' }],
      [householdProduct],
    )
    expect(match.initialProductId).toBe(householdProduct.id)
  })

  it('does not auto-select when multiple visible products have the same name', () => {
    const first = effective('milk')
    const second = effective('water', { name: '牛乳' })
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: '牛乳' }],
      [first, second],
    )
    expect(match.initialProductId).toBeUndefined()
    expect(match.candidates.map((item) => item.productId)).toEqual([
      'milk',
      'water',
    ])
  })

  it('excludes hidden products from all candidates', () => {
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: '牛乳' }],
      [effective('milk', { hidden: true })],
    )
    expect(match.candidates).toEqual([])
  })

  it('deduplicates repeated OCR lines after normalization', () => {
    const matches = matchOcrProductLines(
      [
        { id: 'line-1', text: '・ 牛乳' },
        { id: 'line-2', text: '牛乳' },
      ],
      [effective('milk')],
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].line.id).toBe('line-1')
  })

  it('returns at most three similarity candidates and never auto-selects one', () => {
    const [match] = matchOcrProductLines(
      [{ id: 'line-1', text: 'ヨーグル卜' }],
      [
        effective('yogurt'),
        effective('fruit-yogurt'),
        effective('danone-yogurt'),
        effective('baby-danone', { name: 'ベビーヨーグルト' }),
      ],
    )
    expect(match.candidates.length).toBeLessThanOrEqual(3)
    expect(match.candidates.every((item) => item.matchKind === 'similar')).toBe(
      true,
    )
    expect(match.initialProductId).toBeUndefined()
  })
})
