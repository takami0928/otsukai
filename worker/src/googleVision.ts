export type OcrLine = {
  id: string
  text: string
  confidence?: number
}

export type GoogleVisionFailureKind = 'rate-limited' | 'unavailable'

export class GoogleVisionError extends Error {
  constructor(readonly kind: GoogleVisionFailureKind) {
    super(kind)
    this.name = 'GoogleVisionError'
  }
}

const GOOGLE_VISION_ENDPOINT =
  'https://vision.googleapis.com/v1/images:annotate'
const MAX_RETURNED_LINES = 100
const MAX_LINE_CHARACTERS = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function detectedBreakType(symbol: Record<string, unknown>): string {
  const property = isRecord(symbol.property) ? symbol.property : undefined
  const detectedBreak =
    property && isRecord(property.detectedBreak)
      ? property.detectedBreak
      : undefined
  return detectedBreak ? stringValue(detectedBreak.type) : ''
}

function buildStructuralLines(
  fullTextAnnotation: Record<string, unknown>,
): Array<{ text: string; confidence?: number }> {
  const result: Array<{ text: string; confidence?: number }> = []
  let currentText = ''
  let confidenceTotal = 0
  let confidenceCount = 0

  const flush = () => {
    const text = currentText.trim().slice(0, MAX_LINE_CHARACTERS)
    if (text) {
      result.push({
        text,
        ...(confidenceCount > 0
          ? { confidence: confidenceTotal / confidenceCount }
          : {}),
      })
    }
    currentText = ''
    confidenceTotal = 0
    confidenceCount = 0
  }

  for (const page of records(fullTextAnnotation.pages)) {
    for (const block of records(page.blocks)) {
      for (const paragraph of records(block.paragraphs)) {
        for (const word of records(paragraph.words)) {
          const symbols = records(word.symbols)
          const wordText = symbols.map((symbol) => stringValue(symbol.text)).join('')
          if (wordText) {
            currentText += wordText
            const confidence = numberValue(word.confidence)
            if (typeof confidence === 'number') {
              confidenceTotal += confidence
              confidenceCount += 1
            }
          }

          const lastSymbol = symbols.at(-1)
          const breakType = lastSymbol ? detectedBreakType(lastSymbol) : ''
          if (breakType === 'SPACE' || breakType === 'SURE_SPACE') {
            currentText += ' '
          } else if (breakType === 'HYPHEN') {
            currentText += '-'
            flush()
          } else if (
            breakType === 'EOL_SURE_SPACE' ||
            breakType === 'LINE_BREAK'
          ) {
            flush()
          }
        }
        flush()
      }
    }
  }
  flush()
  return result
}

export function extractOcrLines(value: unknown): OcrLine[] {
  if (!isRecord(value)) {
    return []
  }
  const firstResponse = records(value.responses)[0]
  const fullTextAnnotation =
    firstResponse && isRecord(firstResponse.fullTextAnnotation)
      ? firstResponse.fullTextAnnotation
      : undefined
  if (!fullTextAnnotation) {
    return []
  }

  const structuralLines = buildStructuralLines(fullTextAnnotation)
  const fallbackLines: Array<{ text: string; confidence?: number }> =
    structuralLines.length > 0
      ? structuralLines
      : stringValue(fullTextAnnotation.text)
          .split(/\r?\n/u)
          .map((text) => ({ text: text.trim().slice(0, MAX_LINE_CHARACTERS) }))
          .filter((line) => Boolean(line.text))

  return fallbackLines.slice(0, MAX_RETURNED_LINES).map((line, index) => ({
    id: `line-${index + 1}`,
    text: line.text,
    ...(typeof line.confidence === 'number'
      ? { confidence: line.confidence }
      : {}),
  }))
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function responseContainsLimitError(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }
  const firstResponse = records(value.responses)[0]
  if (!firstResponse || !isRecord(firstResponse.error)) {
    return false
  }
  const code = numberValue(firstResponse.error.code)
  return code === 8 || code === 429
}

export async function recognizeWithGoogleVision(options: {
  image: Blob
  apiKey: string
  languageHints: readonly string[]
  fetchImplementation: typeof fetch
  signal: AbortSignal
}): Promise<OcrLine[]> {
  const content = arrayBufferToBase64(await options.image.arrayBuffer())
  const imageContext =
    options.languageHints.length > 0
      ? { languageHints: [...options.languageHints] }
      : undefined
  const body = {
    requests: [
      {
        image: { content },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        ...(imageContext ? { imageContext } : {}),
      },
    ],
  }

  let response: Response
  try {
    response = await options.fetchImplementation(GOOGLE_VISION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    })
  } catch (error) {
    if (options.signal.aborted) {
      throw error
    }
    throw new GoogleVisionError('unavailable')
  }

  if (response.status === 429) {
    throw new GoogleVisionError('rate-limited')
  }
  if (!response.ok) {
    throw new GoogleVisionError('unavailable')
  }

  let responseBody: unknown
  try {
    responseBody = await response.json()
  } catch {
    throw new GoogleVisionError('unavailable')
  }
  if (responseContainsLimitError(responseBody)) {
    throw new GoogleVisionError('rate-limited')
  }
  const firstResponse =
    isRecord(responseBody) ? records(responseBody.responses)[0] : undefined
  if (firstResponse && isRecord(firstResponse.error)) {
    throw new GoogleVisionError('unavailable')
  }
  return extractOcrLines(responseBody)
}
