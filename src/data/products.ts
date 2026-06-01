import type { Product } from '../types/product'

export const products: Product[] = [
  { id: 'cabbage', name: 'キャベツ', categoryId: 'vegetables', defaultQuantity: 1, unit: '玉', icon: '🥬', sortOrder: 101 },
  { id: 'banana', name: 'バナナ', categoryId: 'fruits', defaultQuantity: 1, unit: '房', icon: '🍌', sortOrder: 201 },
  { id: 'salmon', name: '鮭', categoryId: 'fish', defaultQuantity: 2, unit: '切れ', icon: '🐟', sortOrder: 301 },
  { id: 'pork-koma', name: '豚こま', categoryId: 'meat', defaultQuantity: 300, unit: 'g', icon: '🥩', sortOrder: 401 },
  { id: 'fried-chicken', name: '唐揚げ', categoryId: 'prepared', defaultQuantity: 1, unit: 'パック', icon: '🍗', sortOrder: 501 },
  { id: 'milk', name: '牛乳', categoryId: 'eggs-dairy', defaultQuantity: 1, unit: '本', icon: '🥛', sortOrder: 701 },
  { id: 'eggs', name: '卵', categoryId: 'eggs-dairy', defaultQuantity: 1, unit: 'パック', icon: '🥚', sortOrder: 702 },
  { id: 'yogurt', name: 'ヨーグルト', categoryId: 'eggs-dairy', defaultQuantity: 2, unit: '個', icon: '🥣', sortOrder: 703 },
  { id: 'natto', name: '納豆', categoryId: 'soy', defaultQuantity: 1, unit: '束', icon: '🫘', sortOrder: 801 },
  { id: 'tofu', name: '豆腐', categoryId: 'soy', defaultQuantity: 1, unit: '丁', icon: '⬜', sortOrder: 802 },
  { id: 'bread', name: '食パン', categoryId: 'bread', defaultQuantity: 1, unit: '袋', icon: '🍞', sortOrder: 601 },
  { id: 'frozen-udon', name: '冷凍うどん', categoryId: 'frozen', defaultQuantity: 1, unit: '袋', icon: '🥡', sortOrder: 901 },
  { id: 'water', name: '水', categoryId: 'drinks', defaultQuantity: 2, unit: '本', icon: '💧', sortOrder: 1001 },
  { id: 'tissue', name: 'ティッシュ', categoryId: 'daily', defaultQuantity: 1, unit: 'パック', icon: '🧻', sortOrder: 1101 },
  { id: 'diapers', name: 'おむつ', categoryId: 'baby', defaultQuantity: 1, unit: '袋', icon: '🍼', sortOrder: 1201 },
]
