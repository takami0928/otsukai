import type { TurnstileTokenProvider } from '../handwriting/turnstile'
import {
  MAX_PRODUCT_PHOTO_BYTES,
} from './imageProcessing'
import { isProductPhotoToken } from './photoToken'
import type { PendingPhoto } from './types'

export const PRODUCT_PHOTO_TURNSTILE_ACTION = 'product_photo_upload'

export type ProductPhotoUploadErrorCode =
  | 'auth-failed'
  | 'invalid-photo'
  | 'limit-reached'
  | 'timeout'
  | 'service-unavailable'

export class ProductPhotoUploadError extends Error {
  constructor(readonly code: ProductPhotoUploadErrorCode) {
    super(code)
    this.name = 'ProductPhotoUploadError'
  }
}

export interface ProductPhotoUploadProvider {
  upload(
    photos: readonly PendingPhoto[],
    options?: { signal?: AbortSignal },
  ): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function uploadUrl(endpoint: string): string {
  const base = endpoint.endsWith('/') ? endpoint : `${endpoint}/`
  return new URL('v1/photos/batch', base).toString()
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const value: unknown = await response.json()
    return isRecord(value) && typeof value.code === 'string'
      ? value.code
      : undefined
  } catch {
    return undefined
  }
}

function mapUploadFailure(
  status: number,
  code?: string,
): ProductPhotoUploadError {
  if (status === 401 || status === 403 || code === 'AUTH_FAILED') {
    return new ProductPhotoUploadError('auth-failed')
  }
  if (status === 408 || status === 504 || code === 'TIMEOUT') {
    return new ProductPhotoUploadError('timeout')
  }
  if (status === 413 || status === 429) {
    return new ProductPhotoUploadError('limit-reached')
  }
  if (status === 400 || status === 409 || status === 415) {
    return new ProductPhotoUploadError('invalid-photo')
  }
  return new ProductPhotoUploadError('service-unavailable')
}

function validatePhotos(photos: readonly PendingPhoto[]): void {
  const tokens = new Set<string>()
  const itemKeys = new Set<string>()
  if (photos.length < 1 || photos.length > 3) {
    throw new ProductPhotoUploadError('invalid-photo')
  }
  for (const photo of photos) {
    if (
      !photo.itemKey ||
      photo.itemKey.length > 128 ||
      !/^[A-Za-z0-9:_-]+$/u.test(photo.itemKey) ||
      !isProductPhotoToken(photo.token) ||
      tokens.has(photo.token) ||
      itemKeys.has(photo.itemKey) ||
      photo.blob.type !== 'image/jpeg' ||
      photo.blob.size < 1 ||
      photo.blob.size > MAX_PRODUCT_PHOTO_BYTES
    ) {
      throw new ProductPhotoUploadError('invalid-photo')
    }
    tokens.add(photo.token)
    itemKeys.add(photo.itemKey)
  }
}

function validateSuccess(value: unknown, photos: readonly PendingPhoto[]): boolean {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Array.isArray(value.photos)) {
    return false
  }
  if (value.photos.length !== photos.length) {
    return false
  }
  return value.photos.every((entry, index) => {
    const expected = photos[index]
    return (
      isRecord(entry) &&
      Object.keys(entry).sort().join(',') === 'itemKey,token' &&
      entry.itemKey === expected.itemKey &&
      entry.token === expected.token
    )
  })
}

export class WorkerProductPhotoUploadProvider
  implements ProductPhotoUploadProvider
{
  constructor(
    private readonly endpoint: string,
    private readonly turnstile: TurnstileTokenProvider,
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly validationSessionToken?: string,
  ) {}

  async upload(
    photos: readonly PendingPhoto[],
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    validatePhotos(photos)
    try {
      const token = await this.turnstile.getToken({ signal: options.signal })
      const body = new FormData()
      body.append('turnstileToken', token)
      body.append(
        'metadata',
        JSON.stringify(
          photos.map((photo) => ({
            token: photo.token,
            itemKey: photo.itemKey,
          })),
        ),
      )
      for (const photo of photos) {
        body.append('photo', photo.blob, 'photo.jpg')
      }

      const response = await this.fetchImplementation(uploadUrl(this.endpoint), {
        method: 'POST',
        ...(this.validationSessionToken
          ? {
              headers: {
                'X-Otsukai-Validation-Session':
                  this.validationSessionToken,
              },
            }
          : {}),
        body,
        signal: options.signal,
      })
      if (!response.ok) {
        throw mapUploadFailure(response.status, await readErrorCode(response))
      }
      if (!validateSuccess(await response.json(), photos)) {
        throw new ProductPhotoUploadError('service-unavailable')
      }
    } catch (error) {
      if (options.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      if (error instanceof ProductPhotoUploadError) {
        throw error
      }
      throw new ProductPhotoUploadError('service-unavailable')
    } finally {
      this.turnstile.reset()
    }
  }
}
