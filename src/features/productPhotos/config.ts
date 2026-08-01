export type ProductPhotoConfig = {
  enabled: boolean
}

type ProductPhotoEnvironment = {
  VITE_PRODUCT_PHOTOS_ENABLED?: string
}

export function resolveProductPhotoConfig(
  environment: ProductPhotoEnvironment,
): ProductPhotoConfig {
  return {
    enabled:
      environment.VITE_PRODUCT_PHOTOS_ENABLED?.trim().toLowerCase() ===
      'true',
  }
}
