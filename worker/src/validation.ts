export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024
export const MAX_TURNSTILE_TOKEN_LENGTH = 2_048

export type SupportedImageMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'

export type ValidatedOcrRequest = {
  image: File
  turnstileToken: string
  origin: string
  remoteIp?: string
}

export class RequestValidationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
    this.name = 'RequestValidationError'
  }
}

const SUPPORTED_MIME_TYPES = new Set<SupportedImageMime>([
  'image/jpeg',
  'image/png',
  'image/webp',
])

function isFile(value: FormDataEntryValue): value is File {
  return typeof value !== 'string'
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return (
    bytes.length >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  )
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
}

export function parseAllowedOrigins(value: string): Set<string> {
  return new Set(
    value
      .split(/[,\n]/u)
      .map((origin) => origin.trim())
      .filter((origin) => {
        try {
          const parsed = new URL(origin)
          return parsed.origin === origin
        } catch {
          return false
        }
      }),
  )
}

export async function detectImageMime(
  image: Blob,
): Promise<SupportedImageMime | undefined> {
  const bytes = new Uint8Array(await image.slice(0, 12).arrayBuffer())
  if (isJpeg(bytes)) {
    return 'image/jpeg'
  }
  if (isPng(bytes)) {
    return 'image/png'
  }
  if (isWebp(bytes)) {
    return 'image/webp'
  }
  return undefined
}

export async function validateOcrRequest(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): Promise<ValidatedOcrRequest> {
  if (request.method !== 'POST') {
    throw new RequestValidationError(405, 'METHOD_NOT_ALLOWED')
  }

  const origin = request.headers.get('Origin') ?? ''
  if (!origin || !allowedOrigins.has(origin)) {
    throw new RequestValidationError(403, 'ORIGIN_NOT_ALLOWED')
  }

  const contentType = request.headers.get('Content-Type') ?? ''
  if (!/^multipart\/form-data\s*;\s*boundary=/iu.test(contentType)) {
    throw new RequestValidationError(415, 'UNSUPPORTED_CONTENT_TYPE')
  }

  const contentLength = Number(request.headers.get('Content-Length'))
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_REQUEST_BYTES
  ) {
    throw new RequestValidationError(413, 'IMAGE_TOO_LARGE')
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    throw new RequestValidationError(400, 'INVALID_REQUEST')
  }

  const entries = [...formData.entries()]
  const imageEntries = formData.getAll('image')
  const tokenEntries = formData.getAll('turnstileToken')
  if (
    entries.length !== 2 ||
    imageEntries.length !== 1 ||
    tokenEntries.length !== 1 ||
    !isFile(imageEntries[0]) ||
    entries.some(
      ([key, value]) =>
        (key !== 'image' && key !== 'turnstileToken') ||
        (key === 'turnstileToken' && typeof value !== 'string'),
    )
  ) {
    throw new RequestValidationError(400, 'INVALID_IMAGE_COUNT')
  }
  const image = imageEntries[0]
  if (image.size === 0) {
    throw new RequestValidationError(400, 'INVALID_IMAGE')
  }
  if (image.size > MAX_IMAGE_BYTES) {
    throw new RequestValidationError(413, 'IMAGE_TOO_LARGE')
  }
  if (!SUPPORTED_MIME_TYPES.has(image.type as SupportedImageMime)) {
    throw new RequestValidationError(415, 'UNSUPPORTED_IMAGE_TYPE')
  }
  const detectedMime = await detectImageMime(image)
  if (!detectedMime || detectedMime !== image.type) {
    throw new RequestValidationError(415, 'UNSUPPORTED_IMAGE_TYPE')
  }

  const tokenEntry = formData.get('turnstileToken')
  const turnstileToken =
    typeof tokenEntry === 'string' ? tokenEntry.trim() : ''
  if (
    !turnstileToken ||
    turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH
  ) {
    throw new RequestValidationError(403, 'AUTH_FAILED')
  }

  return {
    image,
    turnstileToken,
    origin,
    ...(request.headers.get('CF-Connecting-IP')
      ? { remoteIp: request.headers.get('CF-Connecting-IP') ?? undefined }
      : {}),
  }
}
