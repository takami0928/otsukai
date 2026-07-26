import {
  HandwritingImportError,
  isAbortError,
} from './errors'
import type {
  HandwritingOcrProvider,
  OcrLine,
} from './types'
import type { TurnstileTokenProvider } from './turnstile'

type OcrEndpointResponse = {
  lines: OcrLine[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOcrEndpointResponse(value: unknown): OcrEndpointResponse | undefined {
  if (!isRecord(value) || !Array.isArray(value.lines)) {
    return undefined
  }
  const lines: OcrLine[] = []
  for (const line of value.lines) {
    if (
      !isRecord(line) ||
      typeof line.id !== 'string' ||
      typeof line.text !== 'string' ||
      (typeof line.confidence !== 'undefined' &&
        typeof line.confidence !== 'number')
    ) {
      return undefined
    }
    lines.push({
      id: line.id,
      text: line.text,
      ...(typeof line.confidence === 'number'
        ? { confidence: line.confidence }
        : {}),
    })
  }
  return { lines }
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

function mapEndpointFailure(status: number, code?: string): HandwritingImportError {
  if (status === 401 || status === 403 || code === 'AUTH_FAILED') {
    return new HandwritingImportError('auth-failed')
  }
  if (status === 429 || code === 'OCR_LIMIT') {
    return new HandwritingImportError('rate-limited')
  }
  if (status === 413 || code === 'IMAGE_TOO_LARGE') {
    return new HandwritingImportError('image-too-large')
  }
  return new HandwritingImportError('service-unavailable')
}

export class GoogleVisionOcrProvider implements HandwritingOcrProvider {
  constructor(
    private readonly endpoint: string,
    private readonly turnstile: TurnstileTokenProvider,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async recognizeProductLines(
    image: Blob,
    options: { signal?: AbortSignal } = {},
  ): Promise<OcrLine[]> {
    try {
      const token = await this.turnstile.getToken(options)
      const body = new FormData()
      body.append('image', image, 'handwriting.jpg')
      body.append('turnstileToken', token)

      const response = await this.fetchImplementation(this.endpoint, {
        method: 'POST',
        body,
        signal: options.signal,
      })
      if (!response.ok) {
        throw mapEndpointFailure(response.status, await readErrorCode(response))
      }

      const parsed = parseOcrEndpointResponse(await response.json())
      if (!parsed) {
        throw new HandwritingImportError('service-unavailable')
      }
      return parsed.lines
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
