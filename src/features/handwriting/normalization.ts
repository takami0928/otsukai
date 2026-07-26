import type { OcrLine } from './types'

const BULLET_PREFIX =
  /^(?:(?:[・･•●○◯◎◦▪■□◆◇▶▷▸▹※*＊\-‐‑‒–—―]+|[☐☑☒✓✔✕])\s*)+/u

const QUANTITY_UNITS = [
  'パック',
  'セット',
  'リットル',
  'ミリリットル',
  'グラム',
  'キログラム',
  '切れ',
  'キロ',
  '本',
  '個',
  '袋',
  '枚',
  '箱',
  '缶',
  '瓶',
  'びん',
  '玉',
  '房',
  '斤',
  '束',
  '杯',
  'kg',
  'ml',
  'g',
  'l',
] as const

const QUANTITY_UNIT_PATTERN = QUANTITY_UNITS.map(escapeRegExp).join('|')
const TRAILING_MULTIPLIER = new RegExp(
  String.raw`\s*[xX×✕]\s*\d+\s*(?:${QUANTITY_UNIT_PATTERN})?\s*$`,
  'iu',
)
const TRAILING_PARENTHESIZED_QUANTITY = new RegExp(
  String.raw`\s*[（(]\s*\d+\s*(?:${QUANTITY_UNIT_PATTERN})\s*[)）]\s*$`,
  'iu',
)
const TRAILING_QUANTITY_WITH_UNIT = new RegExp(
  String.raw`^(.*?)(\d+)\s*(?:${QUANTITY_UNIT_PATTERN})\s*$`,
  'iu',
)
const PRODUCT_NUMBER_SEPARATOR = /[-‐‑‒–—―ー]\s*$/u

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function katakanaToHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6\u30fd\u30fe]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  )
}

export function normalizeOcrText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(BULLET_PREFIX, '')
    .trim()
}

export function toProductComparisonText(value: string): string {
  return katakanaToHiragana(normalizeOcrText(value)).toLocaleLowerCase('ja-JP')
}

export function stripTrailingQuantity(value: string): string {
  const normalized = normalizeOcrText(value)
  if (!normalized) {
    return ''
  }

  const withoutParenthesized = normalized.replace(
    TRAILING_PARENTHESIZED_QUANTITY,
    '',
  )
  if (withoutParenthesized !== normalized) {
    return withoutParenthesized.trim()
  }

  const withoutMultiplier = normalized.replace(TRAILING_MULTIPLIER, '')
  if (withoutMultiplier !== normalized) {
    return withoutMultiplier.trim()
  }

  const unitMatch = normalized.match(TRAILING_QUANTITY_WITH_UNIT)
  if (!unitMatch) {
    return normalized
  }

  const productPrefix = unitMatch[1].trimEnd()
  if (!productPrefix || PRODUCT_NUMBER_SEPARATOR.test(productPrefix)) {
    return normalized
  }
  return productPrefix.trim()
}

export function prepareOcrLines(lines: readonly OcrLine[]): OcrLine[] {
  const seen = new Set<string>()
  const prepared: OcrLine[] = []

  for (const line of lines) {
    const text = normalizeOcrText(line.text)
    const comparisonText = toProductComparisonText(text)
    if (!comparisonText || seen.has(comparisonText)) {
      continue
    }
    seen.add(comparisonText)
    prepared.push({ ...line, text })
  }

  return prepared
}
