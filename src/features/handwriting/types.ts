export type OcrLine = {
  id: string
  text: string
  confidence?: number
}

export interface HandwritingOcrProvider {
  recognizeProductLines(
    image: Blob,
    options?: { signal?: AbortSignal },
  ): Promise<OcrLine[]>
}

export type ProductCandidateMatchKind =
  | 'name-exact'
  | 'alias-exact'
  | 'similar'

export type ProductMatchCandidate = {
  productId: string
  productName: string
  matchKind: ProductCandidateMatchKind
  score: number
}

export type OcrProductLineMatch = {
  line: OcrLine
  productText: string
  candidates: ProductMatchCandidate[]
  initialProductId?: string
}

export type HandwritingImportSelection =
  | {
      lineId: string
      kind: 'product'
      productId: string
    }
  | {
      lineId: string
      kind: 'custom'
      name: string
      customItemId: string
    }
