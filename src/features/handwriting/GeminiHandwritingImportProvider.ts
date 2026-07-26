import { MAX_CUSTOM_ITEM_NAME_CHARS } from '../../constants/requestLimits'
import { countUserCharacters } from '../../utils/textLength'
import {
  HandwritingImportError,
  isAbortError,
} from './errors'
import { parseHandwritingImportResult } from './resultValidation'
import type { TurnstileTokenProvider } from './turnstile'
import type {
  HandwritingImportProvider,
  HandwritingImportResult,
  ImportProductCandidate,
} from './types'

export const MAX_IMPORT_PRODUCT_CANDIDATES = 200
export const MAX_IMPORT_PRODUCT_ID_CHARACTERS = 128
export const MAX_IMPORT_PRODUCT_ALIASES = 10
export const MAX_IMPORT_PRODUCTS_JSON_BYTES = 128 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateProducts(
  products: readonly ImportProductCandidate[],
): string {
  const seenIds = new Set<string>()
  if (
    products.length === 0 ||
    products.length > MAX_IMPORT_PRODUCT_CANDIDATES
  ) {
    throw new HandwritingImportError('request-invalid')
  }

  for (const product of products) {
    if (
      !product.id ||
      product.id.length > MAX_IMPORT_PRODUCT_ID_CHARACTERS ||
      seenIds.has(product.id) ||
      !product.name.trim() ||
      countUserCharacters(product.name) > MAX_CUSTOM_ITEM_NAME_CHARS ||
      !Array.isArray(product.aliases) ||
      product.aliases.length > MAX_IMPORT_PRODUCT_ALIASES ||
      product.aliases.some(
        (alias) =>
          !alias.trim() ||
          countUserCharacters(alias) > MAX_CUSTOM_ITEM_NAME_CHARS,
      )
    ) {
      throw new HandwritingImportError('request-invalid')
    }
    seenIds.add(product.id)
  }

  const serialized = JSON.stringify(products)
  if (
    new TextEncoder().encode(serialized).byteLength >
    MAX_IMPORT_PRODUCTS_JSON_BYTES
  ) {
    throw new HandwritingImportError('request-invalid')
  }
  return serialized
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json()
    return isRecord(body) && typeof body.code === 'string'
      ? body.code
      : undefined
  } catch {
    return undefined
  }
}

function mapEndpointFailure(
  status: number,
  code?: string,
): HandwritingImportError {
  if (status === 401 || status === 403 || code === 'AUTH_FAILED') {
    return new HandwritingImportError('auth-failed')
  }
  if (status === 429 || code === 'ANALYSIS_LIMIT') {
    return new HandwritingImportError('analysis-limit')
  }
  if (status === 413 || code === 'IMAGE_TOO_LARGE') {
    return new HandwritingImportError('image-too-large')
  }
  if (status === 408 || status === 504 || code === 'TIMEOUT') {
    return new HandwritingImportError('timeout')
  }
  if (code === 'SAFETY_BLOCKED') {
    return new HandwritingImportError('safety-blocked')
  }
  if (code === 'INVALID_ANALYSIS_RESPONSE') {
    return new HandwritingImportError('invalid-analysis-response')
  }
  if (
    status === 400 ||
    status === 415 ||
    code === 'REQUEST_INVALID' ||
    code === 'INVALID_PRODUCTS'
  ) {
    return new HandwritingImportError('request-invalid')
  }
  return new HandwritingImportError('service-unavailable')
}

export class GeminiHandwritingImportProvider
  implements HandwritingImportProvider
{
  constructor(
    private readonly endpoint: string,
    private readonly turnstile: TurnstileTokenProvider,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async analyze(
    image: Blob,
    products: readonly ImportProductCandidate[],
    options: { signal?: AbortSignal } = {},
  ): Promise<HandwritingImportResult> {
    try {
      const serializedProducts = validateProducts(products)
      const token = await this.turnstile.getToken(options)
      const body = new FormData()
      body.append('image', image, 'handwriting.jpg')
      body.append('turnstileToken', token)
      body.append('products', serializedProducts)

      const response = await this.fetchImplementation(this.endpoint, {
        method: 'POST',
        body,
        signal: options.signal,
      })
      if (!response.ok) {
        throw mapEndpointFailure(response.status, await readErrorCode(response))
      }

      const parsed = parseHandwritingImportResult(
        await response.json(),
        products,
      )
      if (!parsed) {
        throw new HandwritingImportError('invalid-analysis-response')
      }
      if (parsed.items.length === 0) {
        throw new HandwritingImportError('no-products-detected')
      }
      return parsed
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) {
        throw new HandwritingImportError('cancelled', error)
      }
      if (error instanceof HandwritingImportError) {
        throw error
      }
      throw new HandwritingImportError('service-unavailable', error)
    } finally {
      this.turnstile.reset()
    }
  }
}
