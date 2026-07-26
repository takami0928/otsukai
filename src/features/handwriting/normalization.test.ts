import { describe, expect, it } from 'vitest'
import {
  normalizeOcrText,
  prepareOcrLines,
  stripTrailingQuantity,
  toProductComparisonText,
} from './normalization'

describe('handwriting text normalization', () => {
  it('normalizes width, surrounding whitespace, and repeated whitespace', () => {
    expect(normalizeOcrText('  Ｍｉｌｋ　　２本  ')).toBe('Milk 2本')
  })

  it.each([
    ['・ 牛乳', '牛乳'],
    ['●牛乳', '牛乳'],
    ['□  牛乳', '牛乳'],
    ['✓ 牛乳', '牛乳'],
    ['― 牛乳', '牛乳'],
  ])('removes a leading bullet from %s', (input, expected) => {
    expect(normalizeOcrText(input)).toBe(expected)
  })

  it('normalizes katakana, hiragana, width, and latin case for comparison', () => {
    expect(toProductComparisonText('ﾆﾝｼﾞﾝ Milk')).toBe('にんじん milk')
  })

  it('drops empty lines and duplicate normalized lines', () => {
    expect(
      prepareOcrLines([
        { id: '1', text: '・ 牛乳' },
        { id: '2', text: ' 牛乳 ' },
        { id: '3', text: '　' },
        { id: '4', text: 'タマゴ' },
        { id: '5', text: 'たまご' },
      ]),
    ).toEqual([
      { id: '1', text: '牛乳' },
      { id: '4', text: 'タマゴ' },
    ])
  })
})

describe('stripTrailingQuantity', () => {
  it.each([
    ['牛乳 2本', '牛乳'],
    ['牛乳２本', '牛乳'],
    ['卵×1', '卵'],
    ['卵 x 1', '卵'],
    ['卵×1パック', '卵'],
    ['にんじん（2袋）', 'にんじん'],
    ['ティッシュ 3 箱', 'ティッシュ'],
    ['水 ２リットル', '水'],
  ])('removes an explicit trailing quantity from %s', (input, expected) => {
    expect(stripTrailingQuantity(input)).toBe(expected)
  })

  it.each([
    '三連豆腐',
    '5kg米',
    'R-1',
    'R-1本',
    'ビタミンB2',
    '商品 2026',
    '五本指ソックス',
  ])('does not damage product name %s', (input) => {
    expect(stripTrailingQuantity(input)).toBe(input)
  })
})
