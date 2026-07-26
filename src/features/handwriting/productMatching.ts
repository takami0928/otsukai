import type { EffectiveProduct } from '../../types/householdCatalog'
import { PRODUCT_ALIASES } from './productAliases'
import {
  prepareOcrLines,
  stripTrailingQuantity,
  toProductComparisonText,
} from './normalization'
import type {
  OcrLine,
  OcrProductLineMatch,
  ProductMatchCandidate,
} from './types'

type SearchableProduct = {
  product: EffectiveProduct
  comparisonName: string
  comparisonAliases: string[]
}

function levenshteinDistance(left: string, right: string): number {
  if (!left) {
    return right.length
  }
  if (!right) {
    return left.length
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      )
    }
    previous = current
  }
  return previous[right.length]
}

function bigrams(value: string): string[] {
  if (value.length < 2) {
    return value ? [value] : []
  }
  return Array.from({ length: value.length - 1 }, (_, index) =>
    value.slice(index, index + 2),
  )
}

function diceCoefficient(left: string, right: string): number {
  const leftBigrams = bigrams(left)
  const rightBigrams = bigrams(right)
  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return 0
  }

  const remaining = [...rightBigrams]
  let intersection = 0
  for (const bigram of leftBigrams) {
    const index = remaining.indexOf(bigram)
    if (index >= 0) {
      intersection += 1
      remaining.splice(index, 1)
    }
  }
  return (2 * intersection) / (leftBigrams.length + rightBigrams.length)
}

function calculateSimilarity(left: string, right: string): number | undefined {
  const longestLength = Math.max(left.length, right.length)
  const shortestLength = Math.min(left.length, right.length)
  if (shortestLength === 0 || left === right) {
    return undefined
  }

  const editSimilarity =
    1 - levenshteinDistance(left, right) / Math.max(1, longestLength)
  const dice = diceCoefficient(left, right)
  const contains =
    shortestLength >= 2 && (left.includes(right) || right.includes(left))
  const hasIndependentSignals =
    (editSimilarity >= 0.5 && (dice >= 0.25 || shortestLength <= 2)) ||
    (contains && shortestLength / longestLength >= 0.45)
  if (!hasIndependentSignals) {
    return undefined
  }

  return Math.min(
    1,
    editSimilarity * 0.55 + dice * 0.45 + (contains ? 0.08 : 0),
  )
}

function candidate(
  searchable: SearchableProduct,
  matchKind: ProductMatchCandidate['matchKind'],
  score: number,
): ProductMatchCandidate {
  return {
    productId: searchable.product.id,
    productName: searchable.product.name,
    matchKind,
    score,
  }
}

function compareCandidates(
  left: ProductMatchCandidate,
  right: ProductMatchCandidate,
  productsById: ReadonlyMap<string, EffectiveProduct>,
): number {
  const scoreDifference = right.score - left.score
  if (scoreDifference !== 0) {
    return scoreDifference
  }
  const leftProduct = productsById.get(left.productId)
  const rightProduct = productsById.get(right.productId)
  return (
    (leftProduct?.sortOrder ?? 0) - (rightProduct?.sortOrder ?? 0) ||
    left.productId.localeCompare(right.productId)
  )
}

function matchOneLine(
  line: OcrLine,
  searchableProducts: readonly SearchableProduct[],
  productsById: ReadonlyMap<string, EffectiveProduct>,
): OcrProductLineMatch {
  const productText = stripTrailingQuantity(line.text)
  const comparisonText = toProductComparisonText(productText)
  const nameMatches = searchableProducts
    .filter((item) => item.comparisonName === comparisonText)
    .map((item) => candidate(item, 'name-exact', 1))

  if (nameMatches.length > 0) {
    return {
      line,
      productText,
      candidates: nameMatches.sort((left, right) =>
        compareCandidates(left, right, productsById),
      ),
      initialProductId:
        nameMatches.length === 1 ? nameMatches[0].productId : undefined,
    }
  }

  const aliasMatches = searchableProducts
    .filter((item) => item.comparisonAliases.includes(comparisonText))
    .map((item) => candidate(item, 'alias-exact', 1))
  if (aliasMatches.length > 0) {
    return {
      line,
      productText,
      candidates: aliasMatches.sort((left, right) =>
        compareCandidates(left, right, productsById),
      ),
      initialProductId:
        aliasMatches.length === 1 ? aliasMatches[0].productId : undefined,
    }
  }

  const similarMatches = searchableProducts
    .map((item) => {
      const score = calculateSimilarity(comparisonText, item.comparisonName)
      return typeof score === 'number'
        ? candidate(item, 'similar', score)
        : undefined
    })
    .filter(
      (item): item is ProductMatchCandidate => typeof item !== 'undefined',
    )
    .sort((left, right) => compareCandidates(left, right, productsById))
    .slice(0, 3)

  return {
    line,
    productText,
    candidates: similarMatches,
  }
}

export function matchOcrProductLines(
  lines: readonly OcrLine[],
  effectiveProducts: readonly EffectiveProduct[],
  aliases: Readonly<Record<string, readonly string[]>> = PRODUCT_ALIASES,
): OcrProductLineMatch[] {
  const visibleProducts = effectiveProducts.filter((product) => !product.hidden)
  const productsById = new Map(
    visibleProducts.map((product) => [product.id, product]),
  )
  const searchableProducts = visibleProducts.map<SearchableProduct>((product) => ({
    product,
    comparisonName: toProductComparisonText(product.name),
    comparisonAliases: (aliases[product.id] ?? [])
      .map(toProductComparisonText)
      .filter(Boolean),
  }))

  return prepareOcrLines(lines).map((line) =>
    matchOneLine(line, searchableProducts, productsById),
  )
}
