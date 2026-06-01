import type { Product } from '../types/product'

export const products: Product[] = [
  { id: 'cabbage', name: 'キャベツ', categoryId: 'vegetables', defaultQuantity: 1, unit: '個', icon: '🥬', sortOrder: 101 },
  { id: 'broccoli', name: 'ブロッコリー', categoryId: 'vegetables', defaultQuantity: 1, unit: '個', icon: '🥦', sortOrder: 102 },
  { id: 'komatsuna', name: '小松菜', categoryId: 'vegetables', defaultQuantity: 1, unit: '袋', icon: '🥬', sortOrder: 103 },
  { id: 'horenso', name: 'ほうれん草', categoryId: 'vegetables', defaultQuantity: 1, unit: '袋', icon: '🥬', sortOrder: 104 },
  { id: 'pumpkin', name: 'かぼちゃ', categoryId: 'vegetables', defaultQuantity: 1, unit: '個', icon: '🎃', sortOrder: 105 },
  { id: 'eggplant', name: 'なす', categoryId: 'vegetables', defaultQuantity: 1, unit: '袋', icon: '🍆', sortOrder: 106 },
  { id: 'bean-sprouts', name: 'もやし', categoryId: 'vegetables', defaultQuantity: 1, unit: '袋', icon: '🌱', sortOrder: 107 },
  { id: 'bok-choy', name: 'チンゲンサイ', categoryId: 'vegetables', defaultQuantity: 1, unit: '袋', icon: '🥬', sortOrder: 108 },

  { id: 'apple', name: 'りんご', categoryId: 'fruits', defaultQuantity: 2, unit: '玉', memo: '王林かフジ', icon: '🍎', sortOrder: 201 },
  { id: 'banana', name: 'バナナ', categoryId: 'fruits', defaultQuantity: 1, unit: '房', icon: '🍌', sortOrder: 202 },

  { id: 'salmon', name: '鮭', categoryId: 'fish', defaultQuantity: 2, unit: '切れ', icon: '🐟', sortOrder: 301 },
  { id: 'kanikama', name: 'カニカマ', categoryId: 'fish', defaultQuantity: 1, unit: '個', icon: '🦀', sortOrder: 302 },

  { id: 'pork-koma', name: '豚小間肉', categoryId: 'meat', defaultQuantity: 3, unit: 'パック', icon: '🥩', sortOrder: 401 },
  { id: 'ground-chicken', name: 'とりひき肉', categoryId: 'meat', defaultQuantity: 1, unit: 'パック', icon: '🍗', sortOrder: 402 },

  { id: 'fried-chicken', name: '唐揚げ', categoryId: 'prepared', defaultQuantity: 1, unit: 'パック', icon: '🍗', sortOrder: 501 },

  { id: 'bread', name: '食パン', categoryId: 'bread', defaultQuantity: 1, unit: '斤', memo: 'ロイヤルブレッド青', icon: '🍞', sortOrder: 601 },
  { id: 'character-bread', name: 'キャラクターパン', categoryId: 'bread', defaultQuantity: 1, unit: '個', icon: '🍞', sortOrder: 602 },

  { id: 'milk', name: '牛乳', categoryId: 'eggs-dairy', defaultQuantity: 1, unit: '本', icon: '🥛', sortOrder: 701 },
  { id: 'eggs', name: '卵', categoryId: 'eggs-dairy', defaultQuantity: 1, unit: 'パック', icon: '🥚', sortOrder: 702 },
  { id: 'melting-cheese', name: 'とろけるチーズ', categoryId: 'eggs-dairy', defaultQuantity: 1, unit: '袋', icon: '🧀', sortOrder: 703 },
  { id: 'yogurt', name: 'ヨーグルト', categoryId: 'eggs-dairy', defaultQuantity: 2, unit: '個', icon: '🥣', sortOrder: 704 },
  { id: 'fruit-yogurt', name: 'フルーツヨーグルト', categoryId: 'eggs-dairy', defaultQuantity: 1, unit: '個', icon: '🥣', sortOrder: 705 },

  { id: 'silken-atsuage', name: '絹厚揚げ', categoryId: 'soy', defaultQuantity: 3, unit: '個', icon: '🫘', sortOrder: 801 },
  { id: 'konbu-natto', name: 'こんぶ納豆', categoryId: 'soy', defaultQuantity: 1, unit: '個', icon: '🫘', sortOrder: 802 },
  { id: 'hikiwari-natto', name: 'ひきわり納豆', categoryId: 'soy', defaultQuantity: 1, unit: '個', icon: '🫘', sortOrder: 803 },
  { id: 'three-pack-tofu', name: '三連豆腐', categoryId: 'soy', defaultQuantity: 1, unit: '個', icon: '⬜', sortOrder: 804 },
  { id: 'small-dish-tofu', name: '豆皿豆腐', categoryId: 'soy', defaultQuantity: 1, unit: '個', icon: '⬜', sortOrder: 805 },

  { id: 'ground-sesame', name: 'すりごま', categoryId: 'seasonings-dry', defaultQuantity: 1, unit: '個', memo: '大容量', icon: '🫘', sortOrder: 901 },
  { id: 'kinako', name: 'きな粉', categoryId: 'seasonings-dry', defaultQuantity: 1, unit: '個', memo: '国産', icon: '🫘', sortOrder: 902 },
  { id: 'cooking-sake', name: '料理酒', categoryId: 'seasonings-dry', defaultQuantity: 1, unit: '本', icon: '🍶', sortOrder: 903 },

  { id: 'frozen-udon', name: '冷凍うどん', categoryId: 'frozen', defaultQuantity: 1, unit: '袋', icon: '🥡', sortOrder: 1001 },
  { id: 'ice', name: '氷', categoryId: 'frozen', defaultQuantity: 1, unit: '袋', memo: '1キロ', icon: '🧊', sortOrder: 1002 },

  { id: 'water', name: '水', categoryId: 'drinks', defaultQuantity: 2, unit: '本', icon: '💧', sortOrder: 1101 },

  { id: 'tissue', name: 'ティッシュ', categoryId: 'daily', defaultQuantity: 2, unit: '個', memo: 'ネピネピ', icon: '🧻', sortOrder: 1201 },
  { id: 'wide-haiter', name: 'ワイドハイター', categoryId: 'daily', defaultQuantity: 1, unit: '個', icon: '🧴', sortOrder: 1202 },
  { id: 'kyukyutto', name: 'キュキュット', categoryId: 'daily', defaultQuantity: 1, unit: '個', icon: '🧴', sortOrder: 1203 },
  { id: 'freezer-bag', name: '冷凍保存袋', categoryId: 'daily', defaultQuantity: 1, unit: '個', icon: '🛍️', sortOrder: 1204 },
  { id: 'kitchen-alcohol', name: 'キッチンアルコール', categoryId: 'daily', defaultQuantity: 2, unit: '個', icon: '🧴', sortOrder: 1205 },
  { id: 'garbage-bag-medium', name: 'ごみ袋 家庭ごみ中', categoryId: 'daily', defaultQuantity: 2, unit: '個', icon: '🛍️', sortOrder: 1206 },
  { id: 'garbage-bag-large', name: 'ごみ袋 家庭ごみ大', categoryId: 'daily', defaultQuantity: 1, unit: '個', icon: '🛍️', sortOrder: 1207 },
  { id: 'garbage-bag-plastic-large', name: 'ごみ袋 プラスチック大', categoryId: 'daily', defaultQuantity: 1, unit: '個', icon: '🛍️', sortOrder: 1208 },
  { id: 'makeup-remover', name: '化粧落とし', categoryId: 'daily', defaultQuantity: 2, unit: '個', icon: '🧴', sortOrder: 1209 },
  { id: 'milk-soap', name: '牛乳石鹸', categoryId: 'daily', defaultQuantity: 1, unit: '個', icon: '🧼', sortOrder: 1210 },

  { id: 'diapers', name: 'おむつ', categoryId: 'baby', defaultQuantity: 1, unit: '袋', icon: '🍼', sortOrder: 1301 },
]
