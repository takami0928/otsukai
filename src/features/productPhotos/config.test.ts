import { describe, expect, it } from 'vitest'
import { resolveProductPhotoConfig } from './config'

describe('product photo configuration', () => {
  it('is disabled when the flag is missing or false', () => {
    expect(resolveProductPhotoConfig({}).enabled).toBe(false)
    expect(
      resolveProductPhotoConfig({ VITE_PRODUCT_PHOTOS_ENABLED: 'false' })
        .enabled,
    ).toBe(false)
  })

  it('is enabled only by an explicit true value', () => {
    expect(
      resolveProductPhotoConfig({ VITE_PRODUCT_PHOTOS_ENABLED: ' TRUE ' })
        .enabled,
    ).toBe(true)
    expect(
      resolveProductPhotoConfig({ VITE_PRODUCT_PHOTOS_ENABLED: '1' })
        .enabled,
    ).toBe(false)
  })
})
