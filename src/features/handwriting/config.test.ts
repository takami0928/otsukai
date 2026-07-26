import { describe, expect, it } from 'vitest'
import { resolveHandwritingImportConfig } from './config'

describe('resolveHandwritingImportConfig', () => {
  it('enables the feature only when the flag and both public settings exist', () => {
    expect(
      resolveHandwritingImportConfig({
        VITE_HANDWRITING_IMPORT_ENABLED: 'true',
        VITE_HANDWRITING_IMPORT_ENDPOINT:
          'https://import.example.workers.dev/',
        VITE_TURNSTILE_SITE_KEY: 'site-key',
      }),
    ).toEqual({
      enabled: true,
      endpoint: 'https://import.example.workers.dev/',
      turnstileSiteKey: 'site-key',
    })
  })

  it.each([
    {},
    {
      VITE_HANDWRITING_IMPORT_ENABLED: 'false',
      VITE_HANDWRITING_IMPORT_ENDPOINT:
        'https://import.example.workers.dev/',
      VITE_TURNSTILE_SITE_KEY: 'site-key',
    },
    {
      VITE_HANDWRITING_IMPORT_ENABLED: 'true',
      VITE_TURNSTILE_SITE_KEY: 'site-key',
    },
    {
      VITE_HANDWRITING_IMPORT_ENABLED: 'true',
      VITE_HANDWRITING_IMPORT_ENDPOINT:
        'https://import.example.workers.dev/',
    },
    {
      VITE_HANDWRITING_IMPORT_ENABLED: 'true',
      VITE_HANDWRITING_IMPORT_ENDPOINT: 'javascript:alert(1)',
      VITE_TURNSTILE_SITE_KEY: 'site-key',
    },
  ])('stays safely disabled for incomplete or invalid settings', (environment) => {
    expect(resolveHandwritingImportConfig(environment).enabled).toBe(false)
  })

  it('allows an HTTP localhost endpoint for local development', () => {
    expect(
      resolveHandwritingImportConfig({
        VITE_HANDWRITING_IMPORT_ENABLED: 'TRUE',
        VITE_HANDWRITING_IMPORT_ENDPOINT: 'http://localhost:8787/',
        VITE_TURNSTILE_SITE_KEY: 'site-key',
      }).enabled,
    ).toBe(true)
  })
})
