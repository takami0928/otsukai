export type ProductPhotoConfig = {
  enabled: boolean
  endpoint: string
  turnstileSiteKey: string
}

type ProductPhotoEnvironment = {
  VITE_PRODUCT_PHOTOS_ENABLED?: string
  VITE_HANDWRITING_IMPORT_ENDPOINT?: string
  VITE_TURNSTILE_SITE_KEY?: string
}

function isAllowedEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
    )
  } catch {
    return false
  }
}

export function resolveProductPhotoConfig(
  environment: ProductPhotoEnvironment,
): ProductPhotoConfig {
  const endpoint =
    environment.VITE_HANDWRITING_IMPORT_ENDPOINT?.trim() ?? ''
  const turnstileSiteKey =
    environment.VITE_TURNSTILE_SITE_KEY?.trim() ?? ''
  return {
    enabled:
      environment.VITE_PRODUCT_PHOTOS_ENABLED?.trim().toLowerCase() ===
        'true' &&
      isAllowedEndpoint(endpoint) &&
      Boolean(turnstileSiteKey),
    endpoint,
    turnstileSiteKey,
  }
}

export function getProductPhotoConfig(): ProductPhotoConfig {
  return resolveProductPhotoConfig(import.meta.env)
}
